import pb from './pbClient';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { PocketBaseTaskListRecord } from "@/lib/types";

const DB_NAME_PREFIX = 'dodolist-yjs-';
const KNOWN_LIST_IDS_KEY = 'dolist-known-list-ids';

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

// Add interface for sync status
export interface SyncStatusInfo {
  status: 'synced' | 'syncing' | 'offline' | 'error';
  isConnected: boolean;
  queueLength: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  hasError: boolean;
  canRetry: boolean;
}

// Interface for document instance
interface DocumentInstance {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  syncQueue: (() => Promise<void>)[];
  isSyncing: boolean;
  lastSyncTime: Date | null;
  statusListeners: Set<(status: SyncStatusInfo) => void>;
  updateHandler?: (update: Uint8Array, origin: any) => void;
  readOnlyStatus: boolean; // Add readOnlyStatus here
}

// Individual document provider interface for external use
export interface DocumentProvider {
  doc: Y.Doc;
  getSyncStatus(): SyncStatusInfo;
  onStatusChange(listener: (status: SyncStatusInfo) => void): () => void;
  reconnect(): Promise<void>;
  destroy(): void;
  readOnly: boolean;
}

/**
 * Global singleton PocketBaseProvider that manages multiple Yjs documents
 * Each document corresponds to a task list and maintains its own state
 */
export class GlobalPocketBaseProvider {
  private static instance: GlobalPocketBaseProvider | null = null;
  
  private pb: typeof pb;
  private documents = new Map<string, DocumentInstance>();
  private subscriptions = new Map<string, string>(); // listId -> unsubscribeId
  private collectionName = 'task_lists';
  private maxRetries = 5; // Increased retries
  private globalRetryCount = 0;
  private globalRetryTimeout: NodeJS.Timeout | null = null;
  private _canAccessPocketbase = false;
  private connectivityListeners = new Set<(isConnected: boolean) => void>();
  private pinger: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private documentListListeners = new Set<(listId?: string, readOnlyStatus?: boolean) => void>();
  private collectionUnsubscribe: (() => void) | null = null;
  private isInitialFetchDone = false;

  private constructor() {
    this.pb = pb;
    this.initializeAuth();
    this.setupEventListeners();
    this.setCanAccessPocketbase(navigator.onLine);
    if (navigator.onLine) {
        this.startConnectivityPinger();
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): GlobalPocketBaseProvider {
    if (!GlobalPocketBaseProvider.instance) {
      GlobalPocketBaseProvider.instance = new GlobalPocketBaseProvider();
    }
    return GlobalPocketBaseProvider.instance;
  }

  public onConnectivityChange(listener: (isConnected: boolean) => void): () => void {
    this.connectivityListeners.add(listener);
    listener(this._canAccessPocketbase); // Immediately notify with current state
    return () => {
        this.connectivityListeners.delete(listener);
    };
  }

  private setCanAccessPocketbase(canAccess: boolean) {
      if (this._canAccessPocketbase === canAccess) return;

      const wasOffline = !this._canAccessPocketbase;
      this._canAccessPocketbase = canAccess;

      console.log(`[GlobalPocketBaseProvider] Connectivity status changed to: ${this._canAccessPocketbase ? 'Online' : 'Offline'}`);

      this.connectivityListeners.forEach(listener => listener(this._canAccessPocketbase));

      if (this._canAccessPocketbase) {
          if (wasOffline) {
              console.log('[GlobalPocketBaseProvider] Came back online. Re-evaluating connection state and syncing.');
              this.resetGlobalRetry();
              this.handleOnline();
          }
      } else {
          this.disconnectAllDocuments();
          // The pinger keeps running if the browser is online, allowing for automatic reconnection.
          // For connected to wifi but no internet connection cases or backend is down.
          // It's only stopped by the 'offline' event listener.
      }
  }

  private startConnectivityPinger() {
      if (this.pinger) return; // Already running
      console.log('[GlobalPocketBaseProvider] Starting connectivity pinger.');
      this.pinger = setInterval(async () => {
          if (navigator.onLine) {
              try {
                  await this.pb.health.check();
                  this.setCanAccessPocketbase(true);
              } catch (e) {
                  if (this._canAccessPocketbase) {
                     this.setCanAccessPocketbase(false);
                  }
              }
          } else {
              if (this._canAccessPocketbase) {
                  this.setCanAccessPocketbase(false);
              }
          }
      }, 15000); // Ping every 15 seconds
  }

  private stopConnectivityPinger() {
      if (this.pinger) {
          console.log('[GlobalPocketBaseProvider] Stopping connectivity pinger.');
          clearInterval(this.pinger);
          this.pinger = null;
      }
  }

  public onDocumentListChange(listener: (listId?: string, readOnlyStatus?: boolean) => void): () => void {
    this.documentListListeners.add(listener);
    return () => {
      this.documentListListeners.delete(listener);
    };
  }

  private notifyDocumentListChange(listId?: string, readOnlyStatus?: boolean) {
    if (listId) {
      console.log(`[GlobalPocketBaseProvider] Notifying UI of document list change for listId: ${listId}. ReadOnly: ${readOnlyStatus}`);
    } else {
      console.log('[GlobalPocketBaseProvider] Notifying UI of document list change.');
    }
    this.documentListListeners.forEach(listener => listener(listId, readOnlyStatus));
  }

  private addKnownListId(listId: string) {
    const knownListIdsJson = localStorage.getItem(KNOWN_LIST_IDS_KEY);
    let knownListIds: string[] = [];
    if (knownListIdsJson) {
      try {
        const parsed = JSON.parse(knownListIdsJson);
        if (Array.isArray(parsed)) {
          knownListIds = parsed;
        }
      } catch (e) {
        knownListIds = [];
      }
    }
    if (!knownListIds.includes(listId)) {
      knownListIds.push(listId);
      localStorage.setItem(KNOWN_LIST_IDS_KEY, JSON.stringify(knownListIds));
    }
  }

  private removeKnownListId(listId: string) {
    const knownListIdsJson = localStorage.getItem(KNOWN_LIST_IDS_KEY);
    if (!knownListIdsJson) return;
    let knownListIds: string[] = [];
    try {
      const parsed = JSON.parse(knownListIdsJson);
      if (Array.isArray(parsed)) {
        knownListIds = parsed;
      }
    } catch (e) {
      knownListIds = [];
      return;
    }
    const index = knownListIds.indexOf(listId);
    if (index > -1) {
      knownListIds.splice(index, 1);
      localStorage.setItem(KNOWN_LIST_IDS_KEY, JSON.stringify(knownListIds));
      console.log(`[GlobalPocketBaseProvider] Removed listId ${listId} from known lists.`);
    }
  }

  public async clearAllLocalData() {
    console.log('[GlobalPocketBaseProvider] Clearing all local data.');
    // 1. Disconnect and destroy all in-memory documents
    for (const listId of Array.from(this.documents.keys())) {
        this.destroyDocument(listId, { notify: false });
    }
    this.documents.clear();

    // 2. Clear known list IDs from localStorage
    const knownListIdsJson = localStorage.getItem(KNOWN_LIST_IDS_KEY);
    localStorage.removeItem(KNOWN_LIST_IDS_KEY);

    // 3. Delete IndexedDB databases
    if (knownListIdsJson) {
        try {
            const knownListIds = JSON.parse(knownListIdsJson);
            if (Array.isArray(knownListIds)) {
                const promises = knownListIds.map(listId => {
                    const dbName = `${DB_NAME_PREFIX}${listId}`;
                    console.log(`[GlobalPocketBaseProvider] Deleting IndexedDB: ${dbName}`);
                    return new Promise<void>((resolve, reject) => {
                        const request = indexedDB.deleteDatabase(dbName);
                        request.onsuccess = () => resolve();
                        request.onerror = () => {
                            console.error(`[GlobalPocketBaseProvider] Error deleting DB ${dbName}`, request.error);
                            reject(request.error);
                        };
                        request.onblocked = () => {
                            console.warn(`[GlobalPocketBaseProvider] Deletion of ${dbName} is blocked.`);
                            resolve(); // Resolve anyway, page might reload.
                        };
                    });
                });
                await Promise.all(promises);
                console.log('[GlobalPocketBaseProvider] Finished deleting local databases.');
            }
        } catch (e) {
            console.error('[GlobalPocketBaseProvider] Failed to parse or delete local databases:', e);
        }
    }
    
    // 4. Notify UI of the reset
    this.notifyDocumentListChange(); 
  }

  /**
   * Initialize authentication from global state or localStorage
   */
  private initializeAuth() {
    const globalAuthStore = (window as any).__pb_auth_store;
    if (globalAuthStore && globalAuthStore.isValid) {
      this.pb.authStore.save(globalAuthStore.token, globalAuthStore.model);
      this.setCanAccessPocketbase(true); // Assume online if authenticated
      this.loadAndSyncLists();
      this.processAllSyncQueues();
      this.subscribeToCollectionChanges();
    } else {
      this.setCanAccessPocketbase(false);
    }

    this.pb.authStore.onChange(async () => {
      if (this.pb.authStore.isValid) {
        this.setCanAccessPocketbase(true);
        await this.loadAndSyncLists(true);
        this.processAllSyncQueues();
        this.subscribeToCollectionChanges();
      } else {
        this.setCanAccessPocketbase(false);
        this.isInitialFetchDone = false;
        this.unsubscribeFromCollectionChanges();
        await this.clearAllLocalData();
      }
    });
  }

  private async loadAndSyncLists(isLoginEvent = false) {
    const hasLocal = this.loadLocalDocuments();

    if (isLoginEvent && !hasLocal) {
      // First login on this device, block to fetch lists.
      await this.fetchInitialLists();
    } else {
      // Subsequent page load, or login with existing local data.
      // Fetch in background to not block UI.
      this.fetchInitialLists();
    }
  }

  private loadLocalDocuments(): boolean {
    const knownListIdsJson = localStorage.getItem(KNOWN_LIST_IDS_KEY);
    if (knownListIdsJson) {
        try {
            const knownListIds = JSON.parse(knownListIdsJson);
            if (Array.isArray(knownListIds) && knownListIds.length > 0) {
                console.log(`[GlobalPocketBaseProvider] Loading ${knownListIds.length} known lists from local storage.`);
                for (const listId of knownListIds) {
                    this.getDocumentProvider(listId);
                }
                return true;
            }
        } catch (e) {
            console.error('[GlobalPocketBaseProvider] Failed to parse known list IDs.', e);
        }
    }
    return false;
  }

  private async fetchInitialLists() {
    if (!this.pb.authStore.isValid || this.isInitialFetchDone) return;
    const userId = this.pb.authStore.model?.id;
    if (!userId) return;

    this.isInitialFetchDone = true; // Prevent re-fetching
    console.log(`[GlobalPocketBaseProvider] Fetching initial lists for user ${userId}...`);

    try {
      // The view rule on PocketBase handles the filtering. We just fetch all lists we can see.
      const records = await this.pb.collection(this.collectionName).getFullList({
        filter: 'deleted = false',
        requestKey: null // No filter needed, relies on the collection's view rule
      });

      console.log(`[GlobalPocketBaseProvider] Found ${records.length} lists on server.`);

      if (records.length === 0 && this.documents.size === 0) {
        console.log('[GlobalPocketBaseProvider] No lists found, creating a default list.');
        this.createDefaultList();
      } else {
        for (const record of records) {
          if (record.deleted) {
            this.destroyDocument(record.id);
            continue;
          }
          if (!this.documents.has(record.id)) {
            this.getDocumentProvider(record.id);
          }
        }
      }
      this.notifyDocumentListChange(); // Notify UI after initial fetch is processed
    } catch (e) {
      console.error('[GlobalPocketBaseProvider] Failed to fetch initial lists:', e);
      this.isInitialFetchDone = false; // Allow retry on failure
      this.handleServerDisconnect();
    }
  }

  private createDefaultList() {
    const newId = crypto.randomUUID();
    const name = "My First List";
    const color = "bg-stone-400";

    const yjsProvider = this.getDocumentProvider(newId);
    const ylist = yjsProvider.doc.getMap('list');

    yjsProvider.doc.transact(() => {
      if (!ylist.has('name')) ylist.set('name', new Y.Text());
      if (!ylist.has('color')) ylist.set('color', new Y.Text());
      (ylist.get('name') as Y.Text).insert(0, name);
      (ylist.get('color') as Y.Text).insert(0, color);
      ylist.set('pinned', false);
      ylist.set('archived', false);
      ylist.set('deleted', false);
      if (!ylist.has('todos')) ylist.set('todos', new Y.Array());
    });
  }

  private async subscribeToCollectionChanges() {
    if (this.collectionUnsubscribe) return;
    try {
      const unsubscribe = await this.pb.collection(this.collectionName).subscribe('*', this.handleCollectionChange);
      this.collectionUnsubscribe = unsubscribe;
      console.log('[GlobalPocketBaseProvider] Subscribed to collection-wide changes.');
    } catch (e) {
      console.error('[GlobalPocketBaseProvider] Failed to subscribe to collection changes:', e);
      this.handleServerDisconnect();
    }
  }

  private unsubscribeFromCollectionChanges() {
    if (this.collectionUnsubscribe) {
      this.collectionUnsubscribe();
      this.collectionUnsubscribe = null;
      console.log('[GlobalPocketBaseProvider] Unsubscribed from collection-wide changes.');
    }
  }

  private handleCollectionChange = async ({ action, record }: { action: string, record: any }) => {
    console.log(`[GlobalPocketBaseProvider] Collection change received: ${action} on record ${record.id}`);
    if (action === 'create') {
      if (!this.documents.has(record.id)) {
        console.log(`[GlobalPocketBaseProvider] New list detected: ${record.id}. Creating local document.`);
        this.getDocumentProvider(record.id); // This will create, setup handlers, and notify
      }
    } else if (action === 'update') {
      const docInstance = this.documents.get(record.id);
      if (docInstance) {
        // Compare previous Yjs doc value for 'deleted' with new record.deleted
        const ylist = docInstance.doc.getMap('list');
        const prevDeleted = ylist.get('deleted') === true;
        const newDeleted = record.deleted === true;
        if (!prevDeleted && newDeleted) {
          console.log(`[GlobalPocketBaseProvider] Detected 'deleted' field changed to true for list ${record.id}. Destroying local persistence.`);
          // Set the in-memory Yjs doc's 'deleted' field to true before destroying
          if (!ylist.get('deleted')) {
            docInstance.doc.transact(() => {
              ylist.set('deleted', true);
            }, 'server-update');
          }
          this.notifyDocumentListChange(record.id, true);
          this.destroyDocument(record.id);
          return;
        }
        // If not deleted, apply yjsUpdate if present
        if (record.yjsUpdate) {
          const remoteUpdate = base64ToUint8Array(record.yjsUpdate);
          Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-update');
          console.log(`[GlobalPocketBaseProvider] Applied real-time update for list ${record.id}`);
        }
      } else {
        // This can happen if a client comes online and receives an update for a list it doesn't have yet.
        console.log(`[GlobalPocketBaseProvider] Received update for a list not yet in memory: ${record.id}. Creating it now.`);
        this.getDocumentProvider(record.id);
      }
    } else if (action === 'delete') {
      // This is a hard delete from the server, which we translate to a local soft delete if the doc exists.
      const docInstance = this.documents.get(record.id);
      if (docInstance) {
        console.log(`[GlobalPocketBaseProvider] Server deleted list ${record.id}. Marking as deleted locally.`);
        const ylist = docInstance.doc.getMap('list');
        if (!ylist.get('deleted')) {
          docInstance.doc.transact(() => {
            ylist.set('deleted', true);
          }, 'server-update');
        }
      }
    }
  };

  private setupEventListeners() {
    window.addEventListener('online', this.handleBrowserOnline);
    window.addEventListener('offline', this.handleBrowserOffline);
  }

  private handleBrowserOffline = () => {
      console.log('[GlobalPocketBaseProvider] Browser is offline.');
      this.setCanAccessPocketbase(false);
  };

  private handleBrowserOnline = () => {
      console.log('[GlobalPocketBaseProvider] Browser is online. Starting connectivity check.');
      this.startConnectivityPinger();
  };

  public attemptGlobalReconnect = async () => {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    console.log('[GlobalPocketBaseProvider] Attempting to reconnect...');
    try {
      // Check for actual internet access by pinging the backend health check
      await this.pb.health.check();
      this.setCanAccessPocketbase(true);
      console.log('[GlobalPocketBaseProvider] Internet connection confirmed.');
      this.resetGlobalRetry();
      await this.handleOnline();
    } catch (error) {
      this.setCanAccessPocketbase(false);
      console.error('[GlobalPocketBaseProvider] Internet connection check failed. Still offline.', error);
      this.scheduleGlobalRetry();
    } finally {
      this.isReconnecting = false;
    }
  };

  private handleOnline = async () => {
    if (this.pb.authStore.isValid) {
      await this.subscribeToCollectionChanges();

      if (!this._canAccessPocketbase) {
        console.log('[GlobalPocketBaseProvider] Aborting online process, connection lost during collection subscription.');
        return;
      }

      const promises = [];
      for (const [listId, docInstance] of this.documents.entries()) {
        const ylist = docInstance.doc.getMap('list');
        if (ylist.get('deleted') !== true) {
          promises.push(
            this.forceReadMergeWrite(listId)
              .then(() => this.connectDocument(listId))
          );
        }
      }
      await Promise.all(promises);
      this.processAllSyncQueues();
    }
    console.log('[GlobalPocketBaseProvider] Online: remote sync resumed.');
  };

  private handleServerDisconnect() {
    if (!this._canAccessPocketbase) return;
    console.warn('[GlobalPocketBaseProvider] Server connection lost. Transitioning to offline mode.');
    this.setCanAccessPocketbase(false);
    this.scheduleGlobalRetry();
  }

  public getDocumentProvider(listId: string): DocumentProvider {
    if (!this.documents.has(listId)) {
      this.createDocument(listId);
      this.addKnownListId(listId);
    }
    const docInstance = this.documents.get(listId)!;
    return {
      doc: docInstance.doc,
      getSyncStatus: () => this.getSyncStatus(listId),
      onStatusChange: (listener: (status: SyncStatusInfo) => void) => this.onStatusChange(listId, listener),
      reconnect: () => this.reconnectDocument(listId),
      destroy: () => this.destroyDocument(listId),
      readOnly: docInstance.readOnlyStatus,
    };
  }

  public createNewList(name: string, color: string): string {
    const newId = crypto.randomUUID();
    console.log(`[GlobalPocketBaseProvider] Creating new list with id ${newId}`);

    // This will create the document instance if it doesn't exist
    const yjsProvider = this.getDocumentProvider(newId);
    const ylist = yjsProvider.doc.getMap('list');

    // Initialize metadata
    yjsProvider.doc.transact(() => {
      if (!ylist.has('name')) ylist.set('name', new Y.Text());
      if (!ylist.has('color')) ylist.set('color', new Y.Text());
      (ylist.get('name') as Y.Text).insert(0, name);
      (ylist.get('color') as Y.Text).insert(0, color);
      ylist.set('pinned', false);
      ylist.set('archived', false);
      ylist.set('deleted', false);
      if (!ylist.has('todos')) ylist.set('todos', new Y.Array());
    });

    // The 'update' event on the doc will trigger sync.
    // We need to notify that the list of documents has changed.
    this.notifyDocumentListChange(newId);

    return newId;
  }

  public deleteList(listId: string) {
    const docInstance = this.documents.get(listId);
    if (!docInstance) {
      console.warn(`[GlobalPocketBaseProvider] deleteList called for non-existent listId: ${listId}`);
      return;
    }
    console.log(`[GlobalPocketBaseProvider] Soft deleting list ${listId}`);
    const ylist = docInstance.doc.getMap('list');
    // Use a Yjs transaction with origin 'user' so it is queued for sync
    docInstance.doc.transact(() => {
      ylist.set('deleted', true);
    }, 'user');
    // The doc 'update' event will handle the rest (syncing and notifying listeners)
    this.notifyDocumentListChange(listId, true);
  }

  public cloneList(listId: string): string {
    const docInstanceToClone = this.documents.get(listId);
    if (!docInstanceToClone) {
      throw new Error(`[GlobalPocketBaseProvider] List with id ${listId} not found for cloning.`);
    }

    const ylistToClone = docInstanceToClone.doc.getMap('list');
    const name = (ylistToClone.get('name') as Y.Text)?.toString() || 'Untitled';
    const color = (ylistToClone.get('color') as Y.Text)?.toString() || 'bg-stone-400';
    const newName = `${name} (Copy)`;

    // Create a new list, the name and color will be overwritten but it initializes the doc
    const newId = this.createNewList(newName, color);
    const newDocInstance = this.documents.get(newId);

    if (newDocInstance) {
      // Apply the full state of the old document to the new one
      const update = Y.encodeStateAsUpdate(docInstanceToClone.doc);
      Y.applyUpdate(newDocInstance.doc, update);

      // Now, explicitly set the new name for the cloned list
      const newYList = newDocInstance.doc.getMap('list');
      const yName = newYList.get('name') as Y.Text;
      if (yName) {
        newDocInstance.doc.transact(() => {
          yName.delete(0, yName.length);
          yName.insert(0, newName);
        });
      } else {
        // Fallback if 'name' doesn't exist for some reason
        newDocInstance.doc.transact(() => {
          newYList.set('name', new Y.Text(newName));
        });
      }
    }

    console.log(`[GlobalPocketBaseProvider] Cloned list ${listId} to new list ${newId}`);
    this.notifyDocumentListChange(); // Ensure UI updates
    return newId;
  }

  private createDocument(listId: string) {
    console.log(`[GlobalPocketBaseProvider] Creating document for list ${listId}`);
    const doc = new Y.Doc();
    const dbName = `${DB_NAME_PREFIX}${listId}`;
    const persistence = new IndexeddbPersistence(dbName, doc);
    const docInstance: DocumentInstance = {
      doc,
      persistence,
      syncQueue: [],
      isSyncing: false,
      lastSyncTime: null,
      statusListeners: new Set(),
      readOnlyStatus: false
    };
    this.documents.set(listId, docInstance);
    this.setupDocumentHandlers(listId, docInstance);

    persistence.on('synced', async () => {
      console.log(`[GlobalPocketBaseProvider] Local persistence for list ${listId} is ready`);
      // Now that the document is loaded from IndexedDB, notify the UI.
      this.notifyDocumentListChange(listId);
      if (navigator.onLine) {
        await this.mergeRemoteState(listId);
      }
      await this.connectDocument(listId);
      this.processSyncQueue(listId);
    });
  }

  private setupDocumentHandlers(listId: string, docInstance: DocumentInstance) {
    const handleDocUpdate = (_update: Uint8Array, origin: any) => {
      // Only queue a sync if the origin is 'user' (explicit user action)
      if (origin === 'user') {
        console.log(`[GlobalPocketBaseProvider] Local document updated for list ${listId}, origin: ${origin}, queueing sync.`);
        if (this._canAccessPocketbase) {
          this.updateDocumentStatus(listId, 'syncing');
        }
        this.queueSync(listId, () => this.syncDocumentToServer(listId));
      } else {
        // For all other origins, just notify the UI
        this.notifyDocumentListChange(listId);
      }
    };
    docInstance.doc.on('update', handleDocUpdate);
    docInstance.updateHandler = handleDocUpdate;
  }

  private async connectDocument(listId: string) {
    if (!this._canAccessPocketbase) {
        this.disconnectDocument(listId);
        return;
    }
    try {
      if (!this.pb.authStore.isValid) {
        console.log(`[GlobalPocketBaseProvider] Not authenticated, skipping connection for list ${listId}`);
        return;
      }
      console.log(`[GlobalPocketBaseProvider] Connecting to PocketBase for list ${listId}`);
      await this.pb.collection(this.collectionName).subscribe(listId, (e) => {
        const docInstance = this.documents.get(listId);
        if (!docInstance) {
          console.warn(`[GlobalPocketBaseProvider] Received update for a non-existent document: ${listId}`);
          return;
        }
        if (e.action === 'update' && e.record.yjsUpdate && e.record.yjsClientId !== docInstance.doc.clientID.toString()) {
          const remoteUpdate = base64ToUint8Array(e.record.yjsUpdate);
          Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-update');
          console.log(`[GlobalPocketBaseProvider] Applied real-time update for list ${listId}`);
          this.notifyDocumentListChange(listId);
        }
      }, { requestKey: null });
      this.subscriptions.set(listId, listId);
      console.log(`[GlobalPocketBaseProvider] Successfully connected to PocketBase for list ${listId}`);
      this.resetGlobalRetry();
    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to connect for list ${listId}:`, error);
      this.handleServerDisconnect();
    }
  }

  private async mergeRemoteState(listId: string) {
    try {
      const docInstance = this.documents.get(listId);
      if (!docInstance) return;
      const remoteDoc = await this.pb.collection(this.collectionName).getOne(listId, { requestKey: null, expand: 'collaborators' });
      const userId = this.pb.authStore.model?.id;

      if (remoteDoc.deleted) {
        this.destroyDocument(listId);
        return;
      }

      if (remoteDoc.yjsUpdate) {
        const beforeSV = Y.encodeStateVector(docInstance.doc);
        const remoteUpdate = base64ToUint8Array(remoteDoc.yjsUpdate);
        Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-init');
        const afterSV = Y.encodeStateVector(docInstance.doc);
        const changed = !areUint8ArraysEqual(beforeSV, afterSV);
        if (changed) {
          console.log(`[GlobalPocketBaseProvider] Merged remote state for list ${listId} (local doc changed)`);
        } else {
          console.log(`[GlobalPocketBaseProvider] Merged remote state for list ${listId} (no local change)`);
        }
        // Only queue sync if changed
        if (changed) {
          this.queueSync(listId, () => this.syncDocumentToServer(listId));
        }
      }

      // After applying the update, set the readOnly status on the Yjs doc itself.
      if (userId) {
        const isOwner = remoteDoc.user_id === userId;
        const isCollaborator = remoteDoc.collaborators?.includes(userId);
        const readOnly = !isOwner && !isCollaborator;
        docInstance.readOnlyStatus = readOnly;
        console.log(`[GlobalPocketBaseProvider] Set readOnly status for list ${listId} to ${readOnly}`);
        this.notifyDocumentListChange(listId); // Notify to trigger UI update
      }

    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to merge remote state for list ${listId}:`, error);
      this.handleServerDisconnect();
    }
  }

  private async forceReadMergeWrite(listId: string) {
    try {
      console.log(`[GlobalPocketBaseProvider] Forcing read-merge-write for list ${listId}`);
      const docInstance = this.documents.get(listId);
      if (!docInstance) return;
      let remoteDoc: any = null;
      try {
        remoteDoc = await this.pb.collection(this.collectionName).getOne(listId, { requestKey: null, expand: 'collaborators' });
      } catch (error: any) {
        if (error?.status === 404) {
          const ylist = docInstance.doc.getMap('list');
          let name = '';
          let color = '';
          if (ylist.has('name')) {
            const yName = ylist.get('name') as Y.Text;
            name = yName ? yName.toString() : '';
          }
          if (ylist.has('color')) {
            const yColor = ylist.get('color') as Y.Text;
            color = yColor ? yColor.toString() : '';
          }
          const createdAt = new Date().toISOString();
          const userId = (window as any)?.__pb_auth_store?.model?.id || null;
          const data: any = {
            id: listId,
            user_id: userId,
            name,
            color,
            createdAt,
            pinned: ylist.get('pinned') ?? false,
            archived: ylist.get('archived') ?? false,
            deleted: ylist.get('deleted') ?? false,
          };
          await this.pb.collection(this.collectionName).create(data, { requestKey: null });
          remoteDoc = null;
          console.log(`[GlobalPocketBaseProvider] Created missing PocketBase record for list ${listId}`);
        } else {
          throw error;
        }
      }
      if (remoteDoc && remoteDoc.yjsUpdate) {
        const beforeSV = Y.encodeStateVector(docInstance.doc);
        const remoteUpdate = base64ToUint8Array(remoteDoc.yjsUpdate);
        Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-merge');
        const afterSV = Y.encodeStateVector(docInstance.doc);
        const changed = !areUint8ArraysEqual(beforeSV, afterSV);
        if (changed) {
          console.log(`[GlobalPocketBaseProvider] Queuing sync-to-server after merge for list ${listId}`);
          this.queueSync(listId, () => this.syncDocumentToServer(listId));
        } else {
          console.log(`[GlobalPocketBaseProvider] Merge for list ${listId} resulted in no local change, not queuing sync.`);
        }
      }
    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to force read-merge-write for list ${listId}:`, error);
      this.updateDocumentStatus(listId, 'error');
      this.handleServerDisconnect();
    }
  }

  private scheduleGlobalRetry() {
    if (this.globalRetryTimeout) return; // Already scheduled

    if (this.globalRetryCount >= this.maxRetries) {
      console.error('[GlobalPocketBaseProvider] Max global retries reached. Halting automatic reconnection.');
      this.documents.forEach((_, listId) => this.updateDocumentStatus(listId, 'error'));
      return;
    }

    const retryDelay = Math.min(1000 * Math.pow(2, this.globalRetryCount), 30000);
    this.globalRetryCount++;

    console.log(`[GlobalPocketBaseProvider] Scheduling global reconnection attempt ${this.globalRetryCount} in ${retryDelay}ms`);

    this.globalRetryTimeout = setTimeout(() => {
      this.globalRetryTimeout = null;
      console.log('[GlobalPocketBaseProvider] Retrying all connections...');
      this.attemptGlobalReconnect();
    }, retryDelay);
  }

  private resetGlobalRetry() {
    if (this.globalRetryTimeout) {
      clearTimeout(this.globalRetryTimeout);
      this.globalRetryTimeout = null;
    }
    this.globalRetryCount = 0;
  }

  private disconnectAllDocuments() {
    for (const listId of this.subscriptions.keys()) {
      this.disconnectDocument(listId);
    }
  }

  private disconnectDocument(listId: string) {
    if (this.subscriptions.has(listId)) {
      try {
        this.pb.collection(this.collectionName).unsubscribe(listId);
        this.subscriptions.delete(listId);
        console.log(`[GlobalPocketBaseProvider] Disconnected from PocketBase for list ${listId}`);
      } catch (error) {
        console.error(`[GlobalPocketBaseProvider] Error disconnecting list ${listId}:`, error);
      }
    }
    const docInstance = this.documents.get(listId);
    if (docInstance) {
        this.updateDocumentStatus(listId, 'offline');
    }
  }

  private queueSync(listId: string, operation: () => Promise<void>) {
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;
    if (docInstance.readOnlyStatus) {
      console.log(`[GlobalPocketBaseProvider] Not queuing sync for readonly list ${listId}`);
      return;
    }
    docInstance.syncQueue.push(operation);
    console.log(`[GlobalPocketBaseProvider] Queued sync operation for list ${listId}, queue length: ${docInstance.syncQueue.length}`);
    if (!docInstance.isSyncing && this.isConnectedToServer()) {
      this.processSyncQueue(listId);
    }
  }

  private async processSyncQueue(listId: string) {
    const docInstance = this.documents.get(listId);
    if (!docInstance || docInstance.isSyncing || docInstance.syncQueue.length === 0) return;
    if (docInstance.readOnlyStatus) {
      console.log(`[GlobalPocketBaseProvider] Not processing sync queue for readonly list ${listId}`);
      return;
    }
    console.log(`[GlobalPocketBaseProvider] Processing sync queue for list ${listId}, ${docInstance.syncQueue.length} operations pending`);
    docInstance.isSyncing = true;
    this.updateDocumentStatus(listId, 'syncing');
    
    let processedCount = 0;
    let failedCount = 0;

    while (docInstance.syncQueue.length > 0 && this.isConnectedToServer()) {
      const operation = docInstance.syncQueue[0];
      if (operation) {
        try {
          await operation();
          docInstance.syncQueue.shift();
          processedCount++;
        } catch (error: any) {
          failedCount++;
          console.error(`[GlobalPocketBaseProvider] Sync operation failed for list ${listId}:`, error);
          
          const isNetworkError = error?.isAbort === true || error?.response?.status === 0;
          if (isNetworkError) {
              this.handleServerDisconnect();
          }
          
          break;
        }
      } else {
        docInstance.syncQueue.shift();
      }
    }
    
    docInstance.isSyncing = false;
    this.updateDocumentStatus(listId, this.getSyncStatus(listId).status);
    console.log(`[GlobalPocketBaseProvider] Finished processing sync queue for list ${listId}. Processed: ${processedCount}, Failed: ${failedCount}, Remaining: ${docInstance.syncQueue.length}`);
  }

  private processAllSyncQueues() {
    for (const listId of this.documents.keys()) {
      this.processSyncQueue(listId);
    }
  }

  private async syncDocumentToServer(listId: string) {
    const docInstance = this.documents.get(listId);
    if (!docInstance) {
      console.warn(`[GlobalPocketBaseProvider] Cannot sync, document instance not found for list ${listId}`);
      return;
    }

    const ylist = docInstance.doc.getMap('list');
    const isDeleted = ylist.get('deleted') === true;
    const latestState = Y.encodeStateAsUpdate(docInstance.doc);
    const base64Update = uint8ArrayToBase64(latestState);
    const userId = this.pb.authStore.model?.id;

    if (!userId) {
      console.error(`[GlobalPocketBaseProvider] Cannot sync, user is not authenticated.`);
      throw new Error('User not authenticated');
    }

    try {
      const existingRecord = await this.pb.collection(this.collectionName).getOne(listId, { requestKey: null }).catch(e => {
        if (e.status === 404) return null;
        throw e;
      });

      if (isDeleted) {
        if (existingRecord) {
          console.log(`[GlobalPocketBaseProvider] Soft deleting list on server: ${listId}`);
          await this.pb.collection(this.collectionName).update(listId, { deleted: true }, { requestKey: null });
        }
        this.destroyDocument(listId);
        return; // Stop further processing
      }

      if (existingRecord) {
        // Update existing record
        const metadataUpdate: Partial<PocketBaseTaskListRecord> = {
          yjsUpdate: base64Update,
          yjsClientId: docInstance.doc.clientID.toString(),
        };
        await this.pb.collection(this.collectionName).update(listId, metadataUpdate, { requestKey: null });
        console.log(`[GlobalPocketBaseProvider] Successfully synced document update for list ${listId}`);
      } else {
        // Create new record
        const data: PocketBaseTaskListRecord = {
          id: listId,
          user_id: userId,
          createdAt: new Date().toISOString(),
          yjsUpdate: base64Update,
          yjsClientId: docInstance.doc.clientID.toString(),
        };
        await this.pb.collection(this.collectionName).create(data, { requestKey: null });
        console.log(`[GlobalPocketBaseProvider] Successfully created and synced new list ${listId}`);
      }

      docInstance.lastSyncTime = new Date();
      this.updateDocumentStatus(listId, 'synced');

    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to sync document for list ${listId}:`, error);
      this.updateDocumentStatus(listId, 'error');
      this.handleServerDisconnect(); // This will trigger retry logic
      throw error; // Re-throw to stop the current sync queue processing
    }
  }

  private getSyncStatus(listId: string): SyncStatusInfo {
    const docInstance = this.documents.get(listId);
    const canRetry = this.globalRetryCount < this.maxRetries;

    if (!docInstance) {
      return {
        status: 'offline',
        isConnected: false,
        queueLength: 0,
        isSyncing: false,
        lastSyncTime: null,
        hasError: false,
        canRetry: canRetry,
      };
    }
    
    let status: 'synced' | 'syncing' | 'offline' | 'error' = 'offline';
    if (!canRetry) {
      status = 'error';
    } else if (this._canAccessPocketbase) {
      status = (docInstance.isSyncing || docInstance.syncQueue.length > 0 ? 'syncing' : 'synced');
    } else {
      status = 'offline';
    }

    return {
      status,
      isConnected: this._canAccessPocketbase,
      queueLength: docInstance.syncQueue.length,
      isSyncing: docInstance.isSyncing,
      lastSyncTime: docInstance.lastSyncTime,
      hasError: status === 'error',
      canRetry: canRetry,
    };
  }

  private onStatusChange(listId: string, listener: (status: SyncStatusInfo) => void): () => void {
    const docInstance = this.documents.get(listId);
    if (!docInstance) {
      listener({
        status: 'offline',
        isConnected: false,
        queueLength: 0,
        isSyncing: false,
        lastSyncTime: null,
        hasError: false,
        canRetry: this.globalRetryCount < this.maxRetries,
      });
      return () => {};
    }
    docInstance.statusListeners.add(listener);
    listener(this.getSyncStatus(listId));
    return () => {
      docInstance.statusListeners.delete(listener);
    };
  }

  private updateDocumentStatus(listId: string, newStatus: 'synced' | 'syncing' | 'offline' | 'error') {
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;
    if (newStatus === 'synced') {
      docInstance.lastSyncTime = new Date();
    }
    const status = this.getSyncStatus(listId);
    docInstance.statusListeners.forEach(listener => listener(status));
  }

  private async reconnectDocument(listId: string): Promise<void> {
    this.disconnectDocument(listId);
    await this.forceReadMergeWrite(listId);
  }

  private destroyDocument(listId: string, options: { notify: boolean } = { notify: true }) {
    console.log(`[GlobalPocketBaseProvider] Destroying document for list ${listId}`);
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;

    this.disconnectDocument(listId);

    if (docInstance.updateHandler) {
      docInstance.doc.off('update', docInstance.updateHandler);
    }

    // ydoc.destroy() will trigger the persistence layer to destroy itself and clear the IndexedDB.
    docInstance.doc.destroy();

    // Fully delete the IndexedDB database for this list
    const dbName = `${DB_NAME_PREFIX}${listId}`;
    try {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => {
        console.log(`[GlobalPocketBaseProvider] Successfully deleted IndexedDB: ${dbName}`);
      };
      request.onerror = () => {
        console.error(`[GlobalPocketBaseProvider] Error deleting DB ${dbName}`, request.error);
      };
      request.onblocked = () => {
        console.warn(`[GlobalPocketBaseProvider] Deletion of ${dbName} is blocked.`);
      };
    } catch (e) {
      console.error(`[GlobalPocketBaseProvider] Exception while deleting IndexedDB: ${dbName}`, e);
    }

    this.documents.delete(listId);
    this.removeKnownListId(listId);

    if (options.notify) {
      this.notifyDocumentListChange(listId);
    }
  }

  public getReadOnlyStatus(listId: string): boolean {
    return this.documents.get(listId)?.readOnlyStatus ?? false;
  }

  public isConnectedToServer(): boolean {
    return this.pb.authStore.isValid && this._canAccessPocketbase;
  }

  public getDocument(listId: string): Y.Doc | null {
    return this.documents.get(listId)?.doc || null;
  }

  public getAllDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  public destroy() {
    console.log('[GlobalPocketBaseProvider] Destroying global provider');
    window.removeEventListener('offline', this.handleBrowserOffline);
    window.removeEventListener('online', this.handleBrowserOnline);
    this.stopConnectivityPinger();
    this.unsubscribeFromCollectionChanges();
    for (const listId of Array.from(this.documents.keys())) {
      this.destroyDocument(listId);
    }
    this.documents.clear();
    this.subscriptions.clear();
    GlobalPocketBaseProvider.instance = null;
  }
}

export function getDocumentProvider(listId: string): DocumentProvider {
  return GlobalPocketBaseProvider.getInstance().getDocumentProvider(listId);
}

export class PocketBaseProvider implements DocumentProvider {
  private globalProvider: GlobalPocketBaseProvider;
  private listId: string;

  constructor(listId: string) {
    this.globalProvider = GlobalPocketBaseProvider.getInstance();
    this.listId = listId;
  }

  private get documentProvider(): DocumentProvider {
    return this.globalProvider.getDocumentProvider(this.listId);
  }

  get doc(): Y.Doc {
    return this.documentProvider.doc;
  }

  getSyncStatus(): SyncStatusInfo {
    return this.documentProvider.getSyncStatus();
  }

  onStatusChange(listener: (status: SyncStatusInfo) => void): () => void {
    return this.documentProvider.onStatusChange(listener);
  }

  async reconnect(): Promise<void> {
    return this.documentProvider.reconnect();
  }

  destroy(): void {}

  triggerGlobalReconnect(): Promise<void> {
    return this.globalProvider.attemptGlobalReconnect();
  }

  get persistence() {
    const docInstance = (this.globalProvider as any).documents.get(this.listId);
    return docInstance?.persistence;
  }

  isConnectedToServer(): boolean {
    return this.globalProvider.isConnectedToServer();
  }

  get readOnly(): boolean {
    return this.globalProvider.getReadOnlyStatus(this.listId);
  }
}

// Helper function to compare two Uint8Arrays
function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
