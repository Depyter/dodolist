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
  public persistence: IndexeddbPersistence;
  private pb: PocketBase;
  private listId: string;
  private collectionName = 'task_lists';
  private unsubscribe: () => void = () => {};
  private syncQueue: (() => Promise<void>)[] = [];
  private isSyncing = false;

  constructor(listId: string) {
    this.listId = listId;
    this.doc = new Y.Doc();
    this.pb = new PocketBase(PB_URL);

    // Copy the current auth state from the main app's PocketBase instance
    // This ensures the provider has access to the authentication token
    const mainPb = new PocketBase(PB_URL);
    if (mainPb.authStore.isValid) {
      this.pb.authStore.save(mainPb.authStore.token, mainPb.authStore.model);
    }

    // Use a unique DB name for each list to avoid conflicts
    const dbName = `${DB_NAME_PREFIX}${this.listId}`;
    this.persistence = new IndexeddbPersistence(dbName, this.doc);

    // Local-first: wait for IndexedDB sync, then attempt remote connection
    this.persistence.whenSynced.then(() => {
      console.log(`[Yjs] Local persistence for list ${this.listId} is ready.`);
      
      // Start background sync after local data is ready
      this.initializeBackgroundSync();
    });

    // Start listening to local changes immediately
    this.doc.on('update', this.handleDocUpdate);
  }

  private connect = async () => {
    try {
      // Ensure we are authenticated before setting up listeners
      if (!this.pb.authStore.isValid) {
          console.error("PocketBaseProvider: User is not authenticated. Skipping remote sync.");
          return;
      }

      // 1. Fetch the initial state from the server and merge it with the local state.
      const remoteDoc = await this.pb.collection(this.collectionName).getOne(this.listId, {
        requestKey: null, // Disable auto-cancellation
      });
      
      if (remoteDoc.yjsUpdate) {
          console.log(`[Yjs] Applying initial state for list ${this.listId}`);
          const initialUpdate = base64ToUint8Array(remoteDoc.yjsUpdate);
          Y.applyUpdate(this.doc, initialUpdate, this); // Use origin to prevent echo
      }

      // 2. Subscribe to real-time updates for the specific list document
      this.unsubscribe = await this.pb.collection(this.collectionName).subscribe(this.listId, (e) => {
        if (e.action === 'update' && e.record.yjsUpdate) {
          console.log(`[Yjs] Received remote update for list ${this.listId}`);
          // The update is expected to be a base64 string from PocketBase
          const update = base64ToUint8Array(e.record.yjsUpdate);
          // Apply remote update, the update handler will ignore this because the origin is set to `this`
          Y.applyUpdate(this.doc, update, this); 
        }
      }, {
        requestKey: null, // Disable auto-cancellation for subscriptions
      });
      console.log(`[Yjs] Subscribed to PocketBase for list ${this.listId}`);

    } catch (error) {
      console.error(`[Yjs] Failed to connect for list ${this.listId}:`, error);
      // Queue this operation for retry
      this.queueSync(() => this.connect());
    }
  };

  private initializeBackgroundSync = async () => {
    // Attempt to connect to remote after local is ready
    await this.connect();
    
    // Process any queued sync operations
    this.processSyncQueue();
  };

  private queueSync = (operation: () => Promise<void>) => {
    this.syncQueue.push(operation);
    if (!this.isSyncing) {
      this.processSyncQueue();
    }
  };

  private processSyncQueue = async () => {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return;
    }

    this.isSyncing = true;
    
    while (this.syncQueue.length > 0) {
      const operation = this.syncQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          console.error(`[Yjs] Sync operation failed:`, error);
          // Continue with next operation even if one fails
        }
      }
    }

    this.isSyncing = false;
  };

  private handleDocUpdate = async (update: Uint8Array, origin: any) => {
    if (origin === this) {
      // Ignore updates that came from this provider (i.e., from PocketBase)
      return;
    }
    
    console.log(`[Yjs] Local update detected for list ${this.listId}`);
    
    // Always store the update locally first via IndexedDB (automatic)
    // Then queue the remote sync operation.
    // We encode the whole document state to ensure consistency, as PocketBase
    // just stores a single blob and doesn't merge updates.
    const fullDocUpdate = Y.encodeStateAsUpdate(this.doc);
    const base64Update = uint8ArrayToBase64(fullDocUpdate);
    
    this.queueSync(async () => {
      try {
        if (!this.pb.authStore.isValid) {
          console.log(`[Yjs] Not authenticated, skipping remote sync for list ${this.listId}`);
          return;
        }

        await this.pb.collection(this.collectionName).update(this.listId, {
          'yjsUpdate': base64Update,
        }, {
          requestKey: null, // Disable auto-cancellation
        });
        
        console.log(`[Yjs] Successfully synced full state for list ${this.listId}`);
      } catch (error) {
        console.error(`[Yjs] Failed to sync full state for list ${this.listId}:`, error);
        // The operation will be retried later when connection is restored
        throw error; // Re-throw to trigger retry logic
      }
    });
  };

  public destroy = () => {
    console.log(`[Yjs] Destroying provider for list ${this.listId}`);
    
    // Clear sync queue
    this.syncQueue = [];
    this.isSyncing = false;
    
    // Remove document listeners
    this.doc.off('update', this.handleDocUpdate);
    
    // Unsubscribe from PocketBase
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    // Destroy Yjs document and persistence
    this.doc.destroy();
    this.persistence.destroy();
  };
}
