import * as Y from 'yjs';
import PocketBase from 'pocketbase';
import { IndexeddbPersistence } from 'y-indexeddb';

import { uint8ArrayToBase64, base64ToUint8Array } from '@/lib/utils';

export class YjsPocketbaseProvider {
    private doc: Y.Doc;
    private listId: string;
    private pb: PocketBase;
    public persistence: IndexeddbPersistence;
    private unsubscribe: (() => void) | null = null;
    private isSynced: boolean = false; // Tracks if connected to PocketBase realtime
    private updateTimeout: ReturnType<typeof setTimeout> | null = null;
    private debounceDelay = 500; // milliseconds

    constructor(listId: string, doc: Y.Doc, pbInstance: PocketBase) {
        this.listId = listId;
        this.doc = doc;
        this.pb = pbInstance;

        // 1. Setup IndexedDB persistence for offline support and initial load
        this.persistence = new IndexeddbPersistence(listId, doc);
        this.persistence.on('update', (yjsUpdate: Uint8Array, origin: any) => {
            // This event fires when IndexedDB writes a new update.
            // Useful for debugging, but not directly used for PB sync here.
            console.log(`[YjsPocketbaseProvider] IndexedDB update for list: ${listId}`);
        });

        // 2. Listen for local Yjs changes and push them to PocketBase
        // The 'update' event fires when the Y.Doc changes (locally or remotely applied)
        this.doc.on('update', this._onLocalUpdate);
    }

    public isConnected(): boolean {
        return this.isSynced;
    }

    private _onLocalUpdate = (update: Uint8Array, origin: any) => {
        // Prevent re-broadcasting updates that originated from PocketBase or from this provider
        if (origin === this.pb || origin === 'pocketbase') {
            return;
        }

        // If not connected to PocketBase, the update is still persisted locally by IndexedDB.
        // It will be synced when the connection is re-established.
        if (!this.isSynced) {
            console.log(`[YjsPocketbaseProvider] Offline. Update for list ${this.listId} persisted locally.`);
            return;
        }

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = setTimeout(async () => {
            try {
                const base64Update = uint8ArrayToBase64(Y.encodeStateAsUpdate(this.doc));
                console.log(`[YjsPocketbaseProvider] Sending debounced Yjs update to PocketBase for list ${this.listId}.`);

                await this.pb.collection('task_lists').update(this.listId, {
                    yjsUpdate: base64Update,
                });
                console.log(`[YjsPocketbaseProvider] Sent update to PocketBase for list: ${this.listId}`);
            } catch (error) {
                console.error(`[YjsPocketbaseProvider] Failed to send update to PocketBase for list ${this.listId}:`, error);
                // If the update fails, we assume disconnection. The global connectivity check will handle reconnection.
                this.disconnect();
            } finally {
                this.updateTimeout = null;
            }
        }, this.debounceDelay);
    };

    public async connect() {
        if (this.isSynced) return; // Already connected and synced

        console.log(`[YjsPocketbaseProvider] Connecting to PocketBase for list: ${this.listId}`);
        try {
            // 1. Fetch the latest full state from PocketBase to ensure consistency
            // This is important for clients joining or reconnecting.
            const record = await this.pb.collection('task_lists').getOne(this.listId);
            if (record.yjsUpdate) {
                const remoteUpdate = base64ToUint8Array(record.yjsUpdate);
                // Use a unique origin to mark this as a remote update
                Y.applyUpdate(this.doc, remoteUpdate, 'pocketbase');
                console.log(`[YjsPocketbaseProvider] Applied initial state from PocketBase for list: ${this.listId}. Yjs update size: ${remoteUpdate.length} bytes.`);
            }
            // Metadata is now solely managed within the Yjs doc, no direct application from PB record here.
            // The Y.applyUpdate above will handle the full Yjs doc state, including metadata map.
            console.log(`[YjsPocketbaseProvider] Initial state (including metadata) applied from PocketBase for list: ${this.listId}.`);

            // 2. Subscribe to real-time updates from PocketBase for this specific list record
            this.unsubscribe = await this.pb.collection('task_lists').subscribe(this.listId, (e) => {
                if (e.action === 'update') {
                    console.log(`[YjsPocketbaseProvider] Received real-time update for list: ${this.listId}. Action: ${e.action}`);
                    if (e.record.yjsUpdate) {
                        const remoteUpdate = base64ToUint8Array(e.record.yjsUpdate);
                        // Use a unique origin to mark this as a remote update
                        Y.applyUpdate(this.doc, remoteUpdate, 'pocketbase');
                        console.log(`[YjsPocketbaseProvider] Applied real-time Yjs update for list: ${this.listId}. Yjs update size: ${remoteUpdate.length} bytes.`);
                    }

                    // Apply metadata from PocketBase record to Yjs doc if available
                    this.doc.transact(() => {
                        const metadataMap = this.doc.getMap('metadata');
                        if (e.record.name !== undefined) metadataMap.set('name', e.record.name);
                        if (e.record.color !== undefined) metadataMap.set('color', e.record.color);
                        if (e.record.pinned !== undefined) metadataMap.set('pinned', e.record.pinned);
                        if (e.record.archived !== undefined) metadataMap.set('archived', e.record.archived);
                    }, 'pocketbase');
                    console.log(`[YjsPocketbaseProvider] Real-time state (including metadata) applied from PocketBase for list: ${this.listId}.`);
                }
            });
            this.isSynced = true;
            console.log(`[YjsPocketbaseProvider] Successfully connected and subscribed to real-time updates for list: ${this.listId}`);
        } catch (error) {
            console.error(`[YjsPocketbaseProvider] Failed to connect to PocketBase for list ${this.listId}:`, error);
            this.isSynced = false; // Mark as not synced
            // Do NOT re-throw the error here, allow IndexedDB to load
        }
    }

    public disconnect() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.isSynced = false;
        console.log(`[YjsPocketbaseProvider] Disconnected from PocketBase for list: ${this.listId}`);
    };

    public destroy() {
        this.disconnect();
        this.doc.off('update', this._onLocalUpdate); // Remove event listener
        this.persistence?.destroy(); // Clean up IndexedDB persistence
        console.log(`[YjsPocketbaseProvider] Destroyed for list: ${this.listId}`);
    };
}