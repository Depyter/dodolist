import PocketBase from 'pocketbase';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { PB_URL } from '@/config';

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
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private wasConnected = false;
  private maxRetries = 5;

  private constructor() {
    this.pb = new PocketBase(PB_URL);
    this.initializeAuth();
    this.loadKnownDocuments();
    this.startConnectionMonitoring();
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

  private loadKnownDocuments() {
    const knownListIdsJson = localStorage.getItem(KNOWN_LIST_IDS_KEY);
    if (knownListIdsJson) {
      try {
        const knownListIds = JSON.parse(knownListIdsJson);
        if (Array.isArray(knownListIds)) {
          console.log(`[GlobalPocketBaseProvider] Loading ${knownListIds.length} known documents.`);
          for (const listId of knownListIds) {
            if (!this.documents.has(listId)) {
              this.createDocument(listId);
            }
          }
        }
      } catch (e) {
        console.error('[GlobalPocketBaseProvider] Failed to parse known list IDs from localStorage', e);
      }
    }
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
    // Copy the current auth state from the main app's PocketBase instance
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
          console.warn('[GlobalPocketBaseProvider] Failed to parse auth data from localStorage');
        }
      }
    }

    // Listen to auth store changes to reconnect when authentication changes
    this.pb.authStore.onChange(() => {
      if (this.pb.authStore.isValid && !this.isConnected) {
        this.connectAllDocuments();
      } else if (!this.pb.authStore.isValid && this.isConnected) {
        this.disconnectAllDocuments();
      }
    });
  }

  /**
   * Setup event listeners for online/offline events
   */
  private setupEventListeners() {
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);
  }

  /**
   * Start monitoring PocketBase realtime connection status
   */
  private startConnectionMonitoring() {
    this.connectionCheckInterval = setInterval(() => {
      const realtimeConnected = this.getRealtimeConnected();
      const isOnline = navigator.onLine;
      const effectivelyConnected = realtimeConnected && isOnline && this.pb.authStore.isValid;
      
      if (effectivelyConnected && !this.wasConnected) {
        console.log('[GlobalPocketBaseProvider] PocketBase reconnected, forcing read-merge-write for all documents');
        this.isConnected = true;
        this.wasConnected = true;
        this.forceReadMergeWriteAll();
        this.updateAllDocumentsStatus('syncing');
      } else if (!effectivelyConnected && this.wasConnected) {
        console.log('[GlobalPocketBaseProvider] Lost PocketBase connection');
        this.isConnected = false;
        this.wasConnected = false;
        this.updateAllDocumentsStatus('offline');
      } else if (effectivelyConnected) {
        if (!this.isConnected) {
          this.isConnected = true;
          this.processAllSyncQueues();
        }
      }
    }, 3000);
  }

  /**
   * Returns the PocketBase realtime connection state
   */
  private getRealtimeConnected(): boolean {
    return this.pb.realtime && this.pb.realtime.isConnected === true;
  }

  /**
   * Handle offline event
   */
  private handleOffline = () => {
    this.disconnectAllDocuments();
    console.log('[GlobalPocketBaseProvider] Offline: remote sync paused, local persistence active.');
  };

  /**
   * Handle online event
   */
  private handleOnline = () => {
    if (this.pb.authStore.isValid && !this.getRealtimeConnected()) {
      this.connectAllDocuments();
    }
    console.log('[GlobalPocketBaseProvider] Online: remote sync resumed.');
  };

  /**
   * Get or create a document provider for a specific list
   */
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

  /**
   * Create a new document instance
   */
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

    // Setup document-specific event handlers
    this.setupDocumentHandlers(listId, docInstance);

    // Wait for persistence to be synced before starting remote sync
    persistence.on('synced', async () => {
      console.log(`[GlobalPocketBaseProvider] Local persistence for list ${listId} is ready`);
      
      if (navigator.onLine) {
        await this.mergeRemoteState(listId);
      }
      
      await this.connectDocument(listId);
      this.processSyncQueue(listId);
    });
  }

  /**
   * Setup event handlers for a specific document
   */
  private setupDocumentHandlers(listId: string, docInstance: DocumentInstance) {
    // Listen to local document changes
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
    };

    docInstance.doc.on('update', handleDocUpdate);
    docInstance.updateHandler = handleDocUpdate;
  }

  /**
   * Connect a specific document to PocketBase
   */
  private async connectDocument(listId: string) {
    try {
      if (!this.pb.authStore.isValid) {
        console.log(`[GlobalPocketBaseProvider] Not authenticated, skipping connection for list ${listId}`);
        return;
      }

      console.log(`[GlobalPocketBaseProvider] Connecting to PocketBase for list ${listId}`);

      // Subscribe to real-time updates
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

  /**
   * Merge remote state for a specific document
   */
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

  /**
   * Force read-merge-write for all documents
   */
  private async forceReadMergeWriteAll() {
    // Get all known list IDs from localStorage, not just currently active documents
    const knownListIdsJson = localStorage.getItem(KNOWN_LIST_IDS_KEY);
    if (knownListIdsJson) {
      try {
        const knownListIds = JSON.parse(knownListIdsJson);
        if (Array.isArray(knownListIds)) {
          console.log(`[GlobalPocketBaseProvider] Force syncing ${knownListIds.length} known documents upon reconnection`);
          for (const listId of knownListIds) {
            // Ensure document exists before trying to sync it
            if (!this.documents.has(listId)) {
              this.createDocument(listId);
            }
            await this.forceReadMergeWrite(listId);
          }
          return;
        }
      } catch (e) {
        console.error('[GlobalPocketBaseProvider] Failed to parse known list IDs during force sync', e);
      }
    }
    
    // Fallback to syncing only currently active documents
    for (const listId of this.documents.keys()) {
      await this.forceReadMergeWrite(listId);
    }
  }

  /**
   * Force read-merge-write for a specific document
   */
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
        // If the record does not exist (404), create it
        if (error?.status === 404) {
          // Extract initial metadata from the Yjs doc
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
          // You may want to add more fields as needed
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
            // yjsUpdate will be set by syncDocumentToServer
          };
          await this.pb.collection(this.collectionName).create(data, { requestKey: null });
          remoteDoc = null; // No remote state to merge
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

      // After merging (or creating), immediately queue a sync to write the full state back
      console.log(`[GlobalPocketBaseProvider] Queuing sync-to-server after merge for list ${listId}`);
      this.queueSync(listId, () => this.syncDocumentToServer(listId));

    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to force read-merge-write for list ${listId}:`, error);
      this.updateDocumentStatus(listId, 'error');
    }
  }

  /**
   * Connect all documents
   */
  private async connectAllDocuments() {
    for (const listId of this.documents.keys()) {
      await this.connectDocument(listId);
    }
  }

  /**
   * Disconnect all documents
   */
  private disconnectAllDocuments() {
    for (const listId of this.subscriptions.keys()) {
      this.disconnectDocument(listId);
    }
    this.isConnected = false;
    this.wasConnected = false;
  }

  /**
   * Disconnect a specific document
   */
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

  /**
   * Queue a sync operation for a specific document
   */
  private queueSync(listId: string, operation: () => Promise<void>) {
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;

    docInstance.syncQueue.push(operation);
    console.log(`[GlobalPocketBaseProvider] Queued sync operation for list ${listId}, queue length: ${docInstance.syncQueue.length}`);
    
    if (!docInstance.isSyncing && this.getRealtimeConnected()) {
      this.processSyncQueue(listId);
    }
  }

  /**
   * Process sync queue for a specific document
   */
  private async processSyncQueue(listId: string) {
    const docInstance = this.documents.get(listId);
    if (!docInstance || docInstance.isSyncing || docInstance.syncQueue.length === 0) {
      return;
    }
    
    console.log(`[GlobalPocketBaseProvider] Processing sync queue for list ${listId}, ${docInstance.syncQueue.length} operations pending`);
    docInstance.isSyncing = true;
    this.updateDocumentStatus(listId, 'syncing');
    
    let processedCount = 0;
    let failedCount = 0;
    let consecutiveFailures = 0;
    
    while (docInstance.syncQueue.length > 0 && this.getRealtimeConnected()) {
      const operation = docInstance.syncQueue[0];
      if (operation) {
        try {
          await operation();
          docInstance.syncQueue.shift();
          processedCount++;
          consecutiveFailures = 0;
        } catch (error) {
          console.error(`[GlobalPocketBaseProvider] Sync operation failed for list ${listId}:`, error);
          failedCount++;
          consecutiveFailures++;
          
          if (consecutiveFailures >= 3) {
            console.error(`[GlobalPocketBaseProvider] Too many consecutive failures for list ${listId}, stopping queue processing`);
            break;
          }
          
          docInstance.syncQueue.shift();
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

  /**
   * Process sync queues for all documents
   */
  private processAllSyncQueues() {
    for (const listId of this.documents.keys()) {
      this.processSyncQueue(listId);
    }
  }

  /**
   * Sync document changes to server
   */
  private async syncDocumentToServer(listId: string) {
    try {
      const docInstance = this.documents.get(listId);
      if (!docInstance) {
        console.warn(`[GlobalPocketBaseProvider] Cannot sync, document instance not found for list ${listId}`);
        return;
      }

      // Read-merge-write pattern for conflict resolution
      const currentDoc = await this.pb.collection(this.collectionName).getOne(listId, { requestKey: null });
      
      if (currentDoc.yjsUpdate) {
        const remoteUpdate = base64ToUint8Array(currentDoc.yjsUpdate);
        Y.applyUpdate(docInstance.doc, remoteUpdate, 'server-merge');
      }
      
      // Get the latest state after merging
      const latestState = Y.encodeStateAsUpdate(docInstance.doc);
      const base64Update = uint8ArrayToBase64(latestState);
      
      // Extract metadata from Yjs doc to update record fields
      const ylist = docInstance.doc.getMap('list');
      const metadataUpdate: { [key: string]: any } = {
        yjsUpdate: base64Update,
        yjsClientId: docInstance.doc.clientID.toString(),
      };

      const name = (ylist.get('name') as Y.Text)?.toString();
      if (name !== undefined) metadataUpdate.name = name;

      const color = (ylist.get('color') as Y.Text)?.toString();
      if (color !== undefined) metadataUpdate.color = color;

      const pinned = ylist.get('pinned');
      if (pinned !== undefined) metadataUpdate.pinned = pinned;

      const archived = ylist.get('archived');
      if (archived !== undefined) metadataUpdate.archived = archived;

      const deleted = ylist.get('deleted');
      if (deleted !== undefined) metadataUpdate.deleted = deleted;
      
      await this.pb.collection(this.collectionName).update(listId, metadataUpdate, { requestKey: null });
      
      docInstance.lastSyncTime = new Date();
      
      console.log(`[GlobalPocketBaseProvider] Successfully synced document for list ${listId}`);
      
    } catch (error) {
      console.error(`[GlobalPocketBaseProvider] Failed to sync document for list ${listId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule retry for a specific document
   */
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

  /**
   * Get sync status for a specific document
   */
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

  /**
   * Subscribe to status changes for a specific document
   */
  private onStatusChange(listId: string, listener: (status: SyncStatusInfo) => void): () => void {
    const docInstance = this.documents.get(listId);
    if (!docInstance) {
      // Return current status immediately for non-existent documents
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
    // Immediately call with current status
    listener(this.getSyncStatus(listId));
    
    return () => {
      docInstance.statusListeners.delete(listener);
    };
  }

  /**
   * Update sync status for a specific document and notify listeners
   */
  private updateDocumentStatus(listId: string, newStatus: 'synced' | 'syncing' | 'offline' | 'error') {
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;

    if (newStatus === 'synced') {
      docInstance.lastSyncTime = new Date();
    }

    const status = this.getSyncStatus(listId);
    docInstance.statusListeners.forEach(listener => listener(status));
  }

  /**
   * Update status for all documents
   */
  private updateAllDocumentsStatus(newStatus: 'synced' | 'syncing' | 'offline' | 'error') {
    for (const listId of this.documents.keys()) {
      this.updateDocumentStatus(listId, newStatus);
    }
  }

  /**
   * Reconnect a specific document
   */
  private async reconnectDocument(listId: string): Promise<void> {
    this.disconnectDocument(listId);
    await this.forceReadMergeWrite(listId);
  }

  /**
   * Destroy a specific document
   */
  private destroyDocument(listId: string) {
    console.log(`[GlobalPocketBaseProvider] Destroying document for list ${listId}`);
    
    const docInstance = this.documents.get(listId);
    if (!docInstance) return;

    // Disconnect from PocketBase
    this.disconnectDocument(listId);
    
    // Clear sync queue
    docInstance.syncQueue = [];
    docInstance.isSyncing = false;
    
    // Remove document listeners - need to pass the handler
    if (docInstance.updateHandler) {
      docInstance.doc.off('update', docInstance.updateHandler);
    }
    
    // Destroy persistence first, then document
    if (docInstance.persistence) {
      docInstance.persistence.destroy();
    }
    
    // Destroy Yjs document
    docInstance.doc.destroy();
    
    // Remove from documents map
    this.documents.delete(listId);
  }

  /**
   * Check if connected to server
   */
  public isConnectedToServer(): boolean {
    return this.isConnected && this.pb.authStore.isValid;
  }

  /**
   * Destroy the entire provider (for cleanup)
   */
  public destroy() {
    console.log('[GlobalPocketBaseProvider] Destroying global provider');
    
    // Remove event listeners
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
    
    // Clear connection monitoring interval
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
    
    // Destroy all documents
    for (const listId of Array.from(this.documents.keys())) {
      this.destroyDocument(listId);
    }
    
    // Clear maps
    this.documents.clear();
    this.subscriptions.clear();
    
    // Reset singleton instance
    GlobalPocketBaseProvider.instance = null;
  }
}

// Export a convenience function to get document providers
export function getDocumentProvider(listId: string): DocumentProvider {
  return GlobalPocketBaseProvider.getInstance().getDocumentProvider(listId);
}

// Export the PocketBaseProvider class for backward compatibility
export class PocketBaseProvider implements DocumentProvider {
  private globalProvider: GlobalPocketBaseProvider;
  private listId: string;

  constructor(listId: string) {
    this.listId = listId;
    this.globalProvider = GlobalPocketBaseProvider.getInstance();
    // Eagerly create the document provider to ensure it's available.
    this.globalProvider.getDocumentProvider(listId);
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

  destroy(): void {
    // For backward compatibility, this method does nothing.
    // The global provider manages document lifecycle independently.
    // Individual hook instances should not destroy shared documents.
  }

  // For backward compatibility with existing code
  get persistence() {
    const docInstance = (this.globalProvider as any).documents.get(this.listId);
    return docInstance?.persistence;
  }

  isConnectedToServer(): boolean {
    return this.globalProvider.isConnectedToServer();
  }
}