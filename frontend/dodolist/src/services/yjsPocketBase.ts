import PocketBase from 'pocketbase';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { PB_URL } from '@/config';
import type { PocketBaseTaskListRecord, TodoListWithTodos } from "@/lib/types";

const DB_NAME_PREFIX = 'dodolist-yjs-';
const KNOWN_LIST_IDS_KEY = 'dodolist-known-list-ids';

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
}

// Interface for document instance
interface DocumentInstance {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  syncQueue: (() => Promise<void>)[];
  isSyncing: boolean;
  lastSyncTime: Date | null;
  statusListeners: Set<(status: SyncStatusInfo) => void>;
  retryCount: number;
  retryTimeout: NodeJS.Timeout | null;
  updateHandler?: (update: Uint8Array, origin: any) => void;
}

// Individual document provider interface for external use
export interface DocumentProvider {
  doc: Y.Doc;
  getSyncStatus(): SyncStatusInfo;
  onStatusChange(listener: (status: SyncStatusInfo) => void): () => void;
  reconnect(): Promise<void>;
  destroy(): void;
}

/**
 * Global singleton PocketBaseProvider that manages multiple Yjs documents
 * Each document corresponds to a task list and maintains its own state
 */
export class GlobalPocketBaseProvider {
  private static instance: GlobalPocketBaseProvider | null = null;
  
  private pb: PocketBase;
  private documents = new Map<string, DocumentInstance>();
  private subscriptions = new Map<string, string>(); // listId -> unsubscribeId
  private collectionName = 'task_lists';
  private isConnected = false;
  private maxRetries = 5;
  private documentListListeners = new Set<(listId?: string) => void>();
  private collectionUnsubscribe: (() => void) | null = null;
  private isInitialFetchDone = false;

  private constructor() {
    this.pb = new PocketBase(PB_URL);
    this.initializeAuth();
    this.setupEventListeners();
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

  public onDocumentListChange(listener: (listId?: string) => void): () => void {
    this.documentListListeners.add(listener);
    return () => {
      this.documentListListeners.delete(listener);
    };
  }

  private notifyDocumentListChange(listId?: string) {
    if (listId) {
      console.log(`[GlobalPocketBaseProvider] Notifying UI of document list change for listId: ${listId}.`);
    } else {
      console.log('[GlobalPocketBaseProvider] Notifying UI of document list change.');
    }
    this.documentListListeners.forEach(listener => listener(listId));
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

  /**
   * Initialize authentication from global state or localStorage
   */
  private initializeAuth() {
    const globalAuthStore = (window as any).__pb_auth_store;
    if (globalAuthStore && globalAuthStore.isValid) {
      this.pb.authStore.save(globalAuthStore.token, globalAuthStore.model);
      this.isConnected = true;
      this.fetchInitialLists();
      this.processAllSyncQueues();
      this.subscribeToCollectionChanges();
    } else {
      this.isConnected = false;
    }

    this.pb.authStore.onChange(() => {
      if (this.pb.authStore.isValid) {
        this.isConnected = true;
        this.fetchInitialLists();
        this.processAllSyncQueues();
        this.subscribeToCollectionChanges();
      } else {
        this.isConnected = false;
        this.isInitialFetchDone = false;
        this.unsubscribeFromCollectionChanges();
        for (const listId of Array.from(this.documents.keys())) {
          this.destroyDocument(listId, { notify: false });
        }
        this.documents.clear();
        localStorage.removeItem(KNOWN_LIST_IDS_KEY);
        this.notifyDocumentListChange();
      }
    });
  }

  private async fetchInitialLists() {
    if (!this.pb.authStore.isValid || this.isInitialFetchDone) return;
    const userId = this.pb.authStore.model?.id;
    if (!userId) return;

    this.isInitialFetchDone = true; // Prevent re-fetching
    console.log(`[GlobalPocketBaseProvider] Fetching initial lists for user ${userId}...`);

    try {
      const records = await this.pb.collection(this.collectionName).getFullList({
        filter: `user_id = "${userId}"`,
        requestKey: null
      });

      console.log(`[GlobalPocketBaseProvider] Found ${records.length} lists on server.`);

      if (records.length === 0) {
        console.log('[GlobalPocketBaseProvider] No lists found, creating a default list.');
        this.createDefaultList();
      } else {
        for (const record of records) {
          if (!this.documents.has(record.id)) {
            this.getDocumentProvider(record.id);
          }
        }
      }
      this.notifyDocumentListChange(); // Notify UI after initial fetch is processed
    } catch (e) {
      console.error('[GlobalPocketBaseProvider] Failed to fetch initial lists:', e);
      this.isInitialFetchDone = false; // Allow retry on failure
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
    }
  }

  private unsubscribeFromCollectionChanges() {
    if (this.collectionUnsubscribe) {
      this.collectionUnsubscribe();
      this.collectionUnsubscribe = null;
      console.log('[GlobalPocketBaseProvider] Unsubscribed from collection-wide changes.');
    }
  }

  private handleCollectionChange = ({ action, record }: { action: string, record: any }) => {
    console.log(`[GlobalPocketBaseProvider] Collection change received: ${action} on record ${record.id}`);
    if (action === 'create') {
      if (!this.documents.has(record.id)) {
        console.log(`[GlobalPocketBaseProvider] New list detected: ${record.id}. Creating local document.`);
        const docProvider = this.getDocumentProvider(record.id);
        if (record.yjsUpdate) {
          const remoteUpdate = base64ToUint8Array(record.yjsUpdate);
          Y.applyUpdate(docProvider.doc, remoteUpdate, 'server-create-event');
          console.log(`[GlobalPocketBaseProvider] Applied initial state from create event for list ${record.id}`);
        }
      }
      this.notifyDocumentListChange(record.id);
    } else if (action === 'update') {
      // The per-document subscription in `connectDocument` will handle applying the Yjs update.
      // We just notify the UI that this specific list might have changed.
      this.notifyDocumentListChange(record.id);
    } else if (action === 'delete') {
      this.destroyDocument(record.id);
    }
  };

  private setupEventListeners() {
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);
  }

  private handleOffline = () => {
    this.disconnectAllDocuments();
    console.log('[GlobalPocketBaseProvider] Offline: remote sync paused, local persistence active.');
  };

  private handleOnline = () => {
    if (this.pb.authStore.isValid) {
      this.isConnected = true;
      this.processAllSyncQueues();
    }
    console.log('[GlobalPocketBaseProvider] Online: remote sync resumed.');
  };

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
      destroy: () => this.destroyDocument(listId)
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
    ylist.set('deleted', true);
    // The doc 'update' event will handle the rest (syncing and notifying listeners)
    this.notifyDocumentListChange(listId);
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
      retryCount: 0,
      retryTimeout: null
    };
    this.documents.set(listId, docInstance);
    this.setupDocumentHandlers(listId, docInstance);
    persistence.on('synced', async () => {
      console.log(`[GlobalPocketBaseProvider] Local persistence for list ${listId} is ready`);
      if (navigator.onLine) {
        await this.mergeRemoteState(listId);
      }
      await this.connectDocument(listId);
      this.processSyncQueue(listId);
    });
    this.notifyDocumentListChange();
  }

  private setupDocumentHandlers(listId: string, docInstance: DocumentInstance) {
    const handleDocUpdate = (_update: Uint8Array, origin: any) => {
      if (origin === 'server-init' || origin === 'server-update' || origin === 'server-merge' || origin === 'server-reconnect') {
        return;
      }
      console.log(`[GlobalPocketBaseProvider] Local document updated for list ${listId}, origin: ${origin}`);
      if (this.isConnected) {
        this.updateDocumentStatus(listId, 'syncing');
      }
      this.queueSync(listId, async () => {
        await this.syncDocumentToServer(listId);
      });
      // Notify UI about local changes to ensure immediate reactivity
      this.notifyDocumentListChange(listId);
    };
    docInstance.doc.on('update', handleDocUpdate);
    docInstance.updateHandler = handleDocUpdate;
  }

  private async connectDocument(listId: string) {
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
    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to connect for list ${listId}:`, error);
      this.updateDocumentStatus(listId, 'error');
      this.scheduleRetry(listId);
    }
  }

  private async mergeRemoteState(listId: string) {
    try {
      const docInstance = this.documents.get(listId);
      if (!docInstance) {
        console.warn(`[GlobalPocketBaseProvider] Cannot merge remote state, document instance not found for list ${listId}`);
        return;
      }
      const remoteDoc = await this.pb.collection(this.collectionName).getOne(listId, { requestKey: null });
      if (remoteDoc.yjsUpdate) {
        const remoteUpdate = base64ToUint8Array(remoteDoc.yjsUpdate);
        Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-init');
        console.log(`[GlobalPocketBaseProvider] Merged remote state for list ${listId}`);
      }
    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to merge remote state for list ${listId}:`, error);
    }
  }

  private async forceReadMergeWrite(listId: string) {
    try {
      console.log(`[GlobalPocketBaseProvider] Forcing read-merge-write for list ${listId}`);
      const docInstance = this.documents.get(listId);
      if (!docInstance) {
        console.warn(`[GlobalPocketBaseProvider] Cannot force sync, document instance not found for list ${listId}`);
        return;
      }
      let remoteDoc: any = null;
      try {
        remoteDoc = await this.pb.collection(this.collectionName).getOne(listId, { requestKey: null });
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
        const remoteUpdate = base64ToUint8Array(remoteDoc.yjsUpdate);
        Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-reconnect');
        console.log(`[GlobalPocketBaseProvider] Merged remote state for list ${listId}`);
      }
      console.log(`[GlobalPocketBaseProvider] Queuing sync-to-server after merge for list ${listId}`);
      this.queueSync(listId, () => this.syncDocumentToServer(listId));
    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to force read-merge-write for list ${listId}:`, error);
      this.updateDocumentStatus(listId, 'error');
    }
  }

  private disconnectAllDocuments() {
    for (const listId of this.subscriptions.keys()) {
      this.disconnectDocument(listId);
    }
    this.isConnected = false;
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
        if (docInstance.retryTimeout) {
            clearTimeout(docInstance.retryTimeout);
            docInstance.retryTimeout = null;
        }
        this.updateDocumentStatus(listId, 'offline');
    }
  }

  private queueSync(listId: string, operation: () => Promise<void>) {
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;
    docInstance.syncQueue.push(operation);
    console.log(`[GlobalPocketBaseProvider] Queued sync operation for list ${listId}, queue length: ${docInstance.syncQueue.length}`);
    if (!docInstance.isSyncing && this.isConnectedToServer()) {
      this.processSyncQueue(listId);
    }
  }

  private async processSyncQueue(listId: string) {
    const docInstance = this.documents.get(listId);
    if (!docInstance || docInstance.isSyncing || docInstance.syncQueue.length === 0) return;
    console.log(`[GlobalPocketBaseProvider] Processing sync queue for list ${listId}, ${docInstance.syncQueue.length} operations pending`);
    docInstance.isSyncing = true;
    this.updateDocumentStatus(listId, 'syncing');
    let processedCount = 0;
    let failedCount = 0;
    let consecutiveFailures = 0;
    while (docInstance.syncQueue.length > 0 && this.isConnectedToServer()) {
      const operation = docInstance.syncQueue[0];
      if (operation) {
        try {
          await operation();
          docInstance.syncQueue.shift();
          processedCount++;
          consecutiveFailures = 0;
        } catch (error) {
          failedCount++;
          consecutiveFailures++;
          console.error(`[GlobalPocketBaseProvider] Sync operation failed for list ${listId}:`, error);
          if (consecutiveFailures > 3) break;
          break;
        }
      } else {
        docInstance.syncQueue.shift();
      }
    }
    docInstance.isSyncing = false;
    if (this.isConnected) {
      this.updateDocumentStatus(listId, docInstance.syncQueue.length === 0 ? 'synced' : 'syncing');
    } else {
      this.updateDocumentStatus(listId, 'offline');
    }
    console.log(`[GlobalPocketBaseProvider] Finished processing sync queue for list ${listId}. Processed: ${processedCount}, Failed: ${failedCount}, Remaining: ${docInstance.syncQueue.length}`);
  }

  private processAllSyncQueues() {
    for (const listId of this.documents.keys()) {
      this.processSyncQueue(listId);
    }
  }

  private async syncDocumentToServer(listId: string) {
    try {
      const docInstance = this.documents.get(listId);
      if (!docInstance) {
        console.warn(`[GlobalPocketBaseProvider] Cannot sync, document instance not found for list ${listId}`);
        return;
      }
      let currentDoc: PocketBaseTaskListRecord | null = null;
      try {
        currentDoc = await this.pb.collection(this.collectionName).getOne(listId, { requestKey: null });
      } catch (error: any) {
        if (error?.status === 404) {
          const createdAt = new Date().toISOString();
          const userId = (window as any)?.__pb_auth_store?.model?.id || null;
          const latestState = Y.encodeStateAsUpdate(docInstance.doc);
          const base64Update = uint8ArrayToBase64(latestState);
          const data: PocketBaseTaskListRecord = {
            id: listId,
            user_id: userId,
            createdAt,
            yjsUpdate: base64Update,
            yjsClientId: docInstance.doc.clientID.toString(),
          };
          await this.pb.collection(this.collectionName).create(data, { requestKey: null });
          currentDoc = null;
          console.log(`[GlobalPocketBaseProvider] Created missing PocketBase record for list ${listId}`);
        } else {
          throw error;
        }
      }
      if (currentDoc && currentDoc.yjsUpdate) {
        const remoteUpdate = base64ToUint8Array(currentDoc.yjsUpdate);
        Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-merge');
      }
      const latestState = Y.encodeStateAsUpdate(docInstance.doc);
      const base64Update = uint8ArrayToBase64(latestState);
      const metadataUpdate: Partial<PocketBaseTaskListRecord> = {
        yjsUpdate: base64Update,
        yjsClientId: docInstance.doc.clientID.toString(),
      };
      await this.pb.collection(this.collectionName).update(listId, metadataUpdate, { requestKey: null });
      docInstance.lastSyncTime = new Date();
      console.log(`[GlobalPocketBaseProvider] Successfully synced document for list ${listId}`);
    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to sync document for list ${listId}:`, error);
      throw error;
    }
  }

  private scheduleRetry(listId: string) {
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;
    if (docInstance.retryCount >= this.maxRetries) {
      console.error(`[GlobalPocketBaseProvider] Max retries reached for list ${listId}`);
      this.updateDocumentStatus(listId, 'error');
      return;
    }
    const retryDelay = Math.min(1000 * Math.pow(2, docInstance.retryCount), 30000);
    docInstance.retryCount++;
    docInstance.retryTimeout = setTimeout(async () => {
      console.log(`[GlobalPocketBaseProvider] Retrying connection for list ${listId} (attempt ${docInstance.retryCount})`);
      await this.connectDocument(listId);
    }, retryDelay);
  }

  private getSyncStatus(listId: string): SyncStatusInfo {
    const docInstance = this.documents.get(listId);
    if (!docInstance) {
      return {
        status: 'offline',
        isConnected: false,
        queueLength: 0,
        isSyncing: false,
        lastSyncTime: null,
        hasError: false
      };
    }
    let status: 'synced' | 'syncing' | 'offline' | 'error' = 'offline';
    if (docInstance.retryCount >= this.maxRetries) {
      status = 'error';
    } else if (this.isConnected) {
      status = (docInstance.isSyncing || docInstance.syncQueue.length > 0 ? 'syncing' : 'synced');
    } else {
      status = 'offline';
    }
    return {
      status,
      isConnected: this.isConnected,
      queueLength: docInstance.syncQueue.length,
      isSyncing: docInstance.isSyncing,
      lastSyncTime: docInstance.lastSyncTime,
      hasError: status === 'error'
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
        hasError: false
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
    if (docInstance.persistence) {
      docInstance.persistence.destroy();
    }
    docInstance.doc.destroy();
    this.documents.delete(listId);
    if (options.notify) {
      this.notifyDocumentListChange(listId);
    }
  }

  public isConnectedToServer(): boolean {
    return this.isConnected && this.pb.authStore.isValid;
  }

  public getDocument(listId: string): Y.Doc | null {
    return this.documents.get(listId)?.doc || null;
  }

  public destroy() {
    console.log('[GlobalPocketBaseProvider] Destroying global provider');
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
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
    this.listId = listId;
    this.globalProvider = GlobalPocketBaseProvider.getInstance();
    this.globalProvider.getDocumentProvider(this.listId);
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

  get persistence() {
    const docInstance = (this.globalProvider as any).documents.get(this.listId);
    return docInstance?.persistence;
  }

  isConnectedToServer(): boolean {
    return this.globalProvider.isConnectedToServer();
  }
}