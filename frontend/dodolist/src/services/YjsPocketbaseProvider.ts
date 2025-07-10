import * as Y from 'yjs';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { IndexeddbPersistence } from 'y-indexeddb';
import { networkStatusService } from './NetworkStatusService';

import { uint8ArrayToBase64, base64ToUint8Array } from '@/lib/utils';

export class YjsPocketbaseProvider {
    private doc: Y.Doc;
    private listId: string;
    private pb: PocketBase;
    public persistence: IndexeddbPersistence;
    private unsubscribe: (() => void) | null = null;
    private updateTimeout: ReturnType<typeof setTimeout> | null = null;
    private debounceDelay = 500; // milliseconds
    private connected: boolean = false;
    private syncInProgress: boolean = false;
    

    constructor(listId: string, doc: Y.Doc, pbInstance: PocketBase) {
        this.listId = listId;
        this.doc = doc;
        this.pb = pbInstance;
        console.log(`[YjsPocketbaseProvider] New instance created for list: ${listId}`);

        // 1. Setup IndexedDB persistence for offline support and initial load
        this.persistence = new IndexeddbPersistence(listId, doc);
        this.persistence.on('synced', () => {
            console.log(`[YjsPocketbaseProvider] IndexedDB synced for list: ${this.listId}`);
        });

        // 2. Listen for local Yjs changes and push them to PocketBase
        // The 'update' event fires when the Y.Doc changes (locally or remotely applied)
        this.doc.on('update', this._onLocalUpdate);

        // 3. Listen to network status changes
        networkStatusService.status$.subscribe(status => {
            if (status === 'online') {
                this.connect();
            } else {
                this.disconnect();
            }
        });
    }

    private _onLocalUpdate = (update: Uint8Array, origin: any) => {
        // Prevent re-broadcasting updates that originated from PocketBase or this provider
        if (origin === this.pb || origin === 'pocketbase') {
            return;
        }

        // Debounce the update to bundle rapid changes (e.g., typing)
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        // Only attempt to sync if connected - local changes are always persisted via IndexedDB
        if (!this.connected) {
            console.log(`[YjsPocketbaseProvider] Local update received while offline for list: ${this.listId}. Changes saved locally.`);
            return;
        }

        this.updateTimeout = setTimeout(() => {
            this._pushUpdatesToServer(update);
        }, this.debounceDelay);
    };

    private async _pushUpdatesToServer(update: Uint8Array) {
        if (!this.connected) return;
        
        console.log(`[YjsPocketbaseProvider] Pushing updates to server for list: ${this.listId}`);
        try {
            const base64Update = uint8ArrayToBase64(update);
            const metadata = this.doc.getMap('metadata').toJSON();
            
            // If it doesn't exist on server, _createListOnServer will handle the deleted check
            await this.pb.collection('task_lists').update(this.listId, {
                yjsUpdate: base64Update,
                name: metadata.name,
                color: metadata.color,
                pinned: metadata.pinned,
                archived: metadata.archived,
                deleted: metadata.deleted || false,
            });
            console.log(`[YjsPocketbaseProvider] Successfully pushed update to server for list: ${this.listId}`);
        } catch (error) {
            if (error instanceof ClientResponseError && error.status === 404) {
                console.log(`[YjsPocketbaseProvider] List ${this.listId} not found in PocketBase, attempting to create.`);
                this._createListOnServer().catch(err => {
                    console.error(`[YjsPocketbaseProvider] Failed to create list on server, but local changes are preserved.`, err);
                });
            } else {
                console.error(`[YjsPocketbaseProvider] Network error while pushing updates. Local changes are preserved:`, error);
                // We don't rethrow - local changes are preserved via IndexedDB regardless
            }
        }
    }

    private async _createListOnServer() {
        try {
            const metadata = this.doc.getMap('metadata').toJSON();
            // When creating, we send the full state
            const fullStateUpdate = Y.encodeStateAsUpdate(this.doc);
            const base64Update = uint8ArrayToBase64(fullStateUpdate);
            const currentUser = this.pb.authStore.model;

            if (!currentUser) {
                console.warn(`[YjsPocketbaseProvider] No authenticated user, cannot create list on server`);
                return;
            }

            // Check if the list is marked as deleted locally
            const isDeleted = metadata.deleted === true;
            
            // If list is deleted, don't create it on the server
            if (isDeleted) {
                console.log(`[YjsPocketbaseProvider] List ${this.listId} is marked as deleted locally, skipping server creation`);
                return;
            }

            await this.pb.collection('task_lists').create({
                id: this.listId,
                user_id: currentUser.id,
                createdAt: metadata.createdAt || new Date().toISOString(),
                name: metadata.name || 'Unnamed List',
                color: metadata.color || '#000000',
                pinned: metadata.pinned || false,
                archived: metadata.archived || false,
                deleted: metadata.deleted || false,
                yjsUpdate: base64Update,
            });
            console.log(`[YjsPocketbaseProvider] Successfully created new list ${this.listId} in PocketBase.`);
        } catch (error) {
            console.error(`[YjsPocketbaseProvider] Failed to create list ${this.listId} on server, but local changes are preserved:`, error);
            // We don't rethrow - local functionality continues
        }
    }

    public isConnected(): boolean {
        return this.pb.realtime.isConnected;
    }

    public async connect() {
        if (this.syncInProgress || this.connected) return;
        
        this.syncInProgress = true;
        console.log(`[YjsPocketbaseProvider] Connecting list: ${this.listId}`);
        
        try {
            // Pull from server first to get latest state
            await this._pullFromServer();
            
            // After pulling, set up the realtime subscription for ongoing updates
            await this._setupSubscription();

            // The subscription is the primary indicator of a successful "connection" for this provider.
            if (typeof this.unsubscribe === 'function') {
                this.connected = true;
            }
        } catch (error) {
            console.error(`[YjsPocketbaseProvider] Connection failed for list ${this.listId}, but local functionality continues:`, error);
        } finally {
            this.syncInProgress = false;
        }
    }

    private async _pullFromServer() {
        try {
            const record = await this.pb.collection('task_lists').getOne(this.listId);
            if (record && record.yjsUpdate) {
                const remoteUpdate = base64ToUint8Array(record.yjsUpdate);
                // Apply the update with 'pocketbase' origin to prevent echo
                Y.applyUpdate(this.doc, remoteUpdate, 'pocketbase');
                console.log(`[YjsPocketbaseProvider] Retrieved and applied latest state from server for list: ${this.listId}`);
            }
        } catch (error) {
            if (error instanceof ClientResponseError && error.status === 404) {
                console.log(`[YjsPocketbaseProvider] List ${this.listId} not found on server. Will create on next update.`);
            } else {
                console.warn(`[YjsPocketbaseProvider] Failed to fetch state from server for list ${this.listId}, continuing with local state:`, error);
            }
        }
    }

    private async _setupSubscription() {
        try {
            this.unsubscribe = await this.pb.collection('task_lists').subscribe(this.listId, (e) => {
                if (e.action === 'update' && e.record.yjsUpdate) {
                    try {
                        const remoteUpdate = base64ToUint8Array(e.record.yjsUpdate);
                        // Apply the update with 'pocketbase' origin to prevent echo
                        Y.applyUpdate(this.doc, remoteUpdate, 'pocketbase');
                    } catch (err) {
                        console.error(`[YjsPocketbaseProvider] Error applying remote update:`, err);
                        // Don't throw - we continue with local state
                    }
                }
            });
            
            if (typeof this.unsubscribe === 'function') {
                console.log(`[YjsPocketbaseProvider] Successfully subscribed to realtime updates for list: ${this.listId}`);
            } else {
                console.warn(`[YjsPocketbaseProvider] Subscription failed for list: ${this.listId}. No unsubscribe function received.`);
            }
        } catch (error) {
            console.warn(`[YjsPocketbaseProvider] Failed to subscribe to list ${this.listId}, but local functionality continues:`, error);
            // Don't rethrow - we continue with local state
        }
    }

    public disconnect() {
        if (!this.connected) return;
        
        if (this.unsubscribe !== null) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        
        this.connected = false;
        console.log(`[YjsPocketbaseProvider] Disconnected from PocketBase for list: ${this.listId}`);
    }

    public destroy() {
        this.disconnect();
        this.doc.off('update', this._onLocalUpdate);
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.persistence?.destroy();
        console.log(`[YjsPocketbaseProvider] Destroyed for list: ${this.listId}`);
    }

    public async reconnect() {
        console.log(`[YjsPocketbaseProvider] Forcing reconnect for list: ${this.listId}`);
        this.disconnect();
        // Add a small delay to ensure the disconnection completes
        await new Promise(resolve => setTimeout(resolve, 100));
        this.connect();
    }

    // Force a full sync by sending the complete document state to the server
    public async forceSyncToServer() {
        if (!this.connected) {
            console.log(`[YjsPocketbaseProvider] Cannot force sync while disconnected for list: ${this.listId}`);
            return;
        }
        
        console.log(`[YjsPocketbaseProvider] Forcing full sync to server for list: ${this.listId}`);
        try {
            const fullState = Y.encodeStateAsUpdate(this.doc);
            const base64Update = uint8ArrayToBase64(fullState);
            const metadata = this.doc.getMap('metadata').toJSON();
            
            // Check if list is marked as deleted
            const isDeleted = metadata.deleted === true;
            if (isDeleted) {
                console.log(`[YjsPocketbaseProvider] List ${this.listId} is marked as deleted, updating server with deleted status`);
            }
            
            await this.pb.collection('task_lists').update(this.listId, {
                yjsUpdate: base64Update,
                name: metadata.name,
                color: metadata.color,
                pinned: metadata.pinned,
                archived: metadata.archived,
                deleted: metadata.deleted || false,
            });
            console.log(`[YjsPocketbaseProvider] Successfully pushed full state to server for list: ${this.listId}`);
        } catch (error) {
            console.error(`[YjsPocketbaseProvider] Failed to force sync list ${this.listId}, but local functionality continues:`, error);
            // Don't rethrow - local functionality continues
        }
    }
}