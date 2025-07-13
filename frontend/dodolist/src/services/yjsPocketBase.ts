import PocketBase from 'pocketbase';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { PB_URL } from '@/config';

const DB_NAME_PREFIX = 'dodolist-yjs-';

// Helper function to convert a base64 string to a Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper function to convert a Uint8Array to a base64 string
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class PocketBaseProvider {
  public doc: Y.Doc;
  public persistence!: IndexeddbPersistence;
  private pb: PocketBase;
  private listId: string;
  private collectionName = 'task_lists';
  private unsubscribeId: string | null = null;
  private syncQueue: (() => Promise<void>)[] = [];
  private isSyncing = false;
  private isConnected = false;
  private retryTimeout: NodeJS.Timeout | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private maxRetries = 5;
  private retryCount = 0;
  private wasConnected = false;

  constructor(listId: string) {
    this.listId = listId;
    this.doc = new Y.Doc();
    this.pb = new PocketBase(PB_URL);

    // Copy the current auth state from the main app's PocketBase instance
    // Get the global PocketBase instance that's already authenticated
    const globalAuthStore = (window as any).__pb_auth_store;
    if (globalAuthStore && globalAuthStore.isValid) {
      this.pb.authStore.save(globalAuthStore.token, globalAuthStore.model);
    } else {
      // Fallback: try to get auth from localStorage
      const authData = localStorage.getItem('pocketbase_auth');
      if (authData) {
        try {
          const parsed = JSON.parse(authData);
          this.pb.authStore.save(parsed.token, parsed.model);
        } catch (e) {
          console.warn('[Yjs] Failed to parse auth data from localStorage');
        }
      }
    }

    // Use a unique DB name for each list to avoid conflicts
    const dbName = `${DB_NAME_PREFIX}${this.listId}`;
    // Create IndexedDB persistence
    this.persistence = new IndexeddbPersistence(dbName, this.doc);

    // Wait for the persistence to be synced with IndexedDB before starting remote sync
    this.persistence.on('synced', async () => {
      console.log(`[Yjs] Local persistence for list ${this.listId} is ready.`);
      // After local IndexedDB is loaded, merge remote state if online
      if (navigator.onLine) {
        await this.mergeRemoteState();
      }
      // Start remote sync after local is ready
      await this.connect();
      this.processSyncQueue();
    });

    // Listen for browser offline/online events to pause/resume remote sync
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);

    // Start listening to local changes immediately
    this.doc.on('update', this.handleDocUpdate);

    // Listen to auth store changes to reconnect when authentication changes
    this.pb.authStore.onChange(() => {
      if (this.pb.authStore.isValid && !this.isConnected) {
        this.connect();
      } else if (!this.pb.authStore.isValid && this.isConnected) {
        this.disconnect();
      }
    });

    // Start monitoring PocketBase realtime connection status
    this.startConnectionMonitoring();
  }

  // Returns the PocketBase realtime connection state
  private getRealtimeConnected(): boolean {
    // Use the PocketBase SDK's realtime.isConnected property
    return this.pb.realtime && this.pb.realtime.isConnected === true;
  }

  private startConnectionMonitoring = () => {
    // Check connection status every 3 seconds
    this.connectionCheckInterval = setInterval(() => {
      const realtimeConnected = this.getRealtimeConnected();
      if (!realtimeConnected && this.pb.authStore.isValid) {
        if (this.wasConnected) {
          // We just lost connection
          console.log(`[Yjs] Lost PocketBase realtime connection for list ${this.listId}`);
        }
        this.isConnected = false;
        this.wasConnected = false;
      } else if (realtimeConnected && !this.wasConnected) {
        // We just reconnected
        console.log(`[Yjs] PocketBase realtime reconnected for list ${this.listId}, forcing read-merge-write`);
        this.isConnected = true;
        this.forceReadMergeWrite();
        this.wasConnected = true;
      } else if (realtimeConnected) {
        this.isConnected = true;
        this.wasConnected = true;
        
        // If we have a sync queue and we're not currently syncing, process it
        if (this.syncQueue.length > 0 && !this.isSyncing) {
          console.log(`[Yjs] Connection restored, processing pending sync queue for list ${this.listId}`);
          this.processSyncQueue();
        }
      }
    }, 3000);
  };

  private forceReadMergeWrite = async () => {
    try {
      console.log(`[Yjs] Starting forced read-merge-write cycle for list ${this.listId}`);
      
      // 1. Fetch latest state from server
      const remoteDoc = await this.pb.collection(this.collectionName).getOne(this.listId, { requestKey: null });
      
      if (remoteDoc.yjsUpdate) {
        // 2. Merge remote state into local document
        const remoteUpdate = base64ToUint8Array(remoteDoc.yjsUpdate);
        Y.applyUpdate(this.doc, remoteUpdate, 'server-reconnect');
        console.log(`[Yjs] Applied remote state during forced reconnection for list ${this.listId}`);
      }
      
      // 3. Re-establish real-time subscription
      await this.pb.collection(this.collectionName).subscribe(this.listId, (e) => {
        if (e.action === 'update' && e.record.yjsUpdate && e.record.yjsClientId !== this.doc.clientID.toString()) {
          const update = base64ToUint8Array(e.record.yjsUpdate);
          Y.applyUpdate(this.doc, update, 'server-update');
          console.log(`[Yjs] Applied remote update for list ${this.listId} from client ${e.record.yjsClientId}`);
        }
      }, { requestKey: null });
      
      this.unsubscribeId = this.listId;
      this.isConnected = true;
      this.retryCount = 0;
      
      // 4. Process any queued offline changes with read-merge-write
      if (this.syncQueue.length > 0) {
        console.log(`[Yjs] Processing ${this.syncQueue.length} queued offline changes for list ${this.listId}`);
        
        try {
          // Store the current queue length to avoid race conditions
          const queueLength = this.syncQueue.length;
          
          // Instead of just processing the queue, force a full sync
          const fullState = Y.encodeStateAsUpdate(this.doc);
          const base64Update = uint8ArrayToBase64(fullState);
          
          // Extract metadata
          const ylist = this.doc.getMap('list');
          const name = (ylist.get('name') as Y.Text)?.toString();
          const color = (ylist.get('color') as Y.Text)?.toString();

          const dataToUpdate: { [key: string]: any } = {
            'yjsUpdate': base64Update,
            'yjsClientId': this.doc.clientID.toString(),
          };

          if (name) dataToUpdate.name = name;
          if (color) dataToUpdate.color = color;

          // Send the complete state to ensure offline changes are synced
          await this.pb.collection(this.collectionName).update(this.listId, dataToUpdate, { requestKey: null });
          console.log(`[Yjs] Successfully pushed offline changes for list ${this.listId}`);
          
          // Only remove the operations that were queued before this sync
          // This prevents clearing operations that might have been added during this process
          this.syncQueue.splice(0, queueLength);
        } catch (syncError: any) {
          console.error(`[Yjs] Failed to push offline changes during forced read-merge-write for list ${this.listId}:`, syncError);
          // Don't clear the queue if the sync failed - let the normal sync queue processing handle retries
        }
      }
      
      console.log(`[Yjs] Successfully completed forced read-merge-write for list ${this.listId}`);
      
      // Process any remaining operations in the queue after reconnection
      this.processSyncQueue();
      
    } catch (error) {
      console.error(`[Yjs] Failed forced read-merge-write for list ${this.listId}:`, error);
      this.isConnected = false;
    }
  };

  private handleOffline = () => {
    // Pause remote sync, but keep local IndexedDB working
    this.disconnect();
    console.log('[Yjs] Offline: remote sync paused, local persistence active.');
  };

  private handleOnline = () => {
    // Always check the actual realtime connection state
    if (this.pb.authStore.isValid && !this.getRealtimeConnected()) {
      console.log('[Yjs] Online: attempting to reconnect and force sync...');
      this.reconnect();
    } else if (this.pb.authStore.isValid && this.getRealtimeConnected()) {
      // If already connected, but we were offline, force a merge-write to ensure offline changes are pushed
      console.log('[Yjs] Online: already connected, forcing read-merge-write to push offline changes.');
      this.forceReadMergeWrite();
    }
    console.log('[Yjs] Online: remote sync resumed.');
  };

  // Merge remote state into local doc after IndexedDB is loaded
  private mergeRemoteState = async () => {
    try {
      if (!this.pb.authStore.isValid) return;
      const remoteDoc = await this.pb.collection(this.collectionName).getOne(this.listId, { requestKey: null });
      if (remoteDoc.yjsUpdate) {
        const remoteUpdate = base64ToUint8Array(remoteDoc.yjsUpdate);
        // Merge remote update into local doc (idempotent)
        Y.applyUpdate(this.doc, remoteUpdate, 'server-init');
        console.log(`[Yjs] Merged remote state for list ${this.listId}`);
      }
    } catch (e) {
      console.warn(`[Yjs] Could not merge remote state for list ${this.listId}:`, e);
    }
  };

  private connect = async () => {
    try {
      // Use the forced read-merge-write cycle for robust reconnection
      await this.forceReadMergeWrite();
    } catch (error) {
      console.error(`[Yjs] Failed to connect for list ${this.listId}:`, error);
      this.isConnected = false;
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 1000;
        console.log(`[Yjs] Retrying connection in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        this.retryTimeout = setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        console.error(`[Yjs] Max retry attempts reached for list ${this.listId}`);
      }
    }
  };

  private disconnect = () => {
    if (this.unsubscribeId) {
      this.pb.collection(this.collectionName).unsubscribe(this.unsubscribeId);
      this.unsubscribeId = null;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    this.isConnected = false;
    this.wasConnected = false; // Reset tracking when disconnecting
    this.retryCount = 0;
    console.log(`[Yjs] Disconnected from PocketBase for list ${this.listId}`);
  };

  private queueSync = (operation: () => Promise<void>) => {
    // Always queue, even if offline. The queue will be processed on reconnect.
    this.syncQueue.push(operation);
    console.log(`[Yjs] Queued sync operation for list ${this.listId}, queue length: ${this.syncQueue.length}`);
    
    // Only process if we're connected and not already syncing
    if (!this.isSyncing && this.getRealtimeConnected()) {
      this.processSyncQueue();
    }
  };

  private processSyncQueue = async () => {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return;
    }
    
    console.log(`[Yjs] Processing sync queue for list ${this.listId}, ${this.syncQueue.length} operations pending`);
    this.isSyncing = true;
    
    let processedCount = 0;
    let failedCount = 0;
    let consecutiveFailures = 0;
    
    while (this.syncQueue.length > 0 && this.getRealtimeConnected()) {
      // Get the first operation without removing it from the queue yet
      const operation = this.syncQueue[0];
      if (operation) {
        try {
          await operation();
          // Only remove the operation if it succeeded
          this.syncQueue.shift();
          processedCount++;
          consecutiveFailures = 0; // Reset consecutive failures on success
          console.log(`[Yjs] Successfully processed sync operation ${processedCount} for list ${this.listId}`);
        } catch (error: any) {
          console.error(`[Yjs] Sync operation failed for list ${this.listId}:`, error);
          failedCount++;
          consecutiveFailures++;
          
          // Check if this is a critical error that suggests we should stop processing
          if (error?.status === 401 || error?.status === 403) {
            console.error(`[Yjs] Authentication error, stopping sync queue processing for list ${this.listId}`);
            break;
          }
          
          // For network errors, implement backoff and keep the operation in queue for retry
          if (error?.status === 0 || error?.status === 500 || error?.status >= 502) {
            console.warn(`[Yjs] Network error detected, will retry later for list ${this.listId}`);
            
            // If we have too many consecutive failures, add a delay before retrying
            if (consecutiveFailures >= 3) {
              const backoffDelay = Math.min(1000 * Math.pow(2, consecutiveFailures - 3), 30000); // Max 30s
              console.log(`[Yjs] Too many consecutive failures (${consecutiveFailures}), backing off for ${backoffDelay}ms`);
              
              // Break the processing loop to add delay, but don't remove the operation
              setTimeout(() => {
                if (this.getRealtimeConnected() && !this.isSyncing) {
                  this.processSyncQueue();
                }
              }, backoffDelay);
              break;
            }
            // For fewer consecutive failures, just continue with the operation still in queue
            break;
          }
          
          // For other errors (like validation errors), remove the failed operation
          // This prevents the same operation from blocking the queue indefinitely
          this.syncQueue.shift();
          console.warn(`[Yjs] Removed failed sync operation from queue for list ${this.listId} (non-network error)`);
        }
      } else {
        // Remove null/undefined operations
        this.syncQueue.shift();
      }
    }
    
    this.isSyncing = false;
    console.log(`[Yjs] Finished processing sync queue for list ${this.listId}. Processed: ${processedCount}, Failed: ${failedCount}, Remaining: ${this.syncQueue.length}`);
  };

  private handleDocUpdate = (_update: Uint8Array, origin: any) => {
    // Ignore updates that came from the server to prevent echo
    if (origin === 'server-init' || origin === 'server-update' || origin === 'server-merge' || origin === 'server-reconnect') {
      return;
    }

    console.log(`[Yjs] Local document updated for list ${this.listId}, origin: ${origin}`);

    // Always queue the sync operation, even if offline
    this.queueSync(async () => {
      try {
        // Only attempt remote sync if connected and authenticated
        if (!this.pb.authStore.isValid || !this.getRealtimeConnected()) {
          console.log(`[Yjs] Not ready for remote sync, will retry when online for list ${this.listId}`);
          return;
        }

        console.log(`[Yjs] Starting read-merge-write cycle for list ${this.listId}`);

        // 1. Fetch the latest state from the server
        const remoteDoc = await this.pb.collection(this.collectionName).getOne(this.listId, { requestKey: null });
        const remoteUpdate = remoteDoc.yjsUpdate ? base64ToUint8Array(remoteDoc.yjsUpdate) : new Uint8Array();

        // 2. Merge remote state into the local document
        if (remoteUpdate.length > 0) {
          Y.applyUpdate(this.doc, remoteUpdate, 'server-merge');
          console.log(`[Yjs] Merged remote state for list ${this.listId}`);
        }

        // 3. Now that the local doc is up-to-date, encode the full state
        const mergedState = Y.encodeStateAsUpdate(this.doc);
        const base64Update = uint8ArrayToBase64(mergedState);

        // 4. Extract metadata to update the main record fields
        const ylist = this.doc.getMap('list');
        const name = (ylist.get('name') as Y.Text)?.toString();
        const color = (ylist.get('color') as Y.Text)?.toString();

        const dataToUpdate: { [key: string]: any } = {
          'yjsUpdate': base64Update,
          'yjsClientId': this.doc.clientID.toString(),
        };

        if (name) dataToUpdate.name = name;
        if (color) dataToUpdate.color = color;

        // 5. Send the merged update back to the server
        await this.pb.collection(this.collectionName).update(this.listId, dataToUpdate, { requestKey: null });
        console.log(`[Yjs] Successfully synced merged state for list ${this.listId}`);
      } catch (error: any) {
        console.error(`[Yjs] Failed to sync state for list ${this.listId}:`, error);
        
        // Check if this is a connection issue and mark as disconnected
        if (error?.status === 0 || error?.status === 500 || error?.status >= 502) {
          console.warn(`[Yjs] Network/server error detected, marking as disconnected for list ${this.listId}`);
          this.isConnected = false;
        }
        
        // Re-throw the error so the sync queue can handle it properly
        throw error;
      }
    });
  };

  public destroy = () => {
    console.log(`[Yjs] Destroying provider for list ${this.listId}`);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
    
    // Clear connection monitoring interval
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    
    // Clear retry timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    
    // Clear sync queue
    this.syncQueue = [];
    this.isSyncing = false;
    
    // Remove document listeners
    this.doc.off('update', this.handleDocUpdate);
    
    // Disconnect from PocketBase
    this.disconnect();
    
    // Destroy persistence first, then document
    if (this.persistence) {
      this.persistence.destroy();
    }
    
    // Destroy Yjs document
    this.doc.destroy();
  };

  // Helper method to check connection status
  public isConnectedToServer(): boolean {
    return this.isConnected && this.pb.authStore.isValid;
  }

  // Helper method to manually trigger reconnection
  public reconnect = async () => {
    this.disconnect();
    await this.forceReadMergeWrite();
  };
}