import * as Y from 'yjs';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { IndexeddbPersistence } from 'y-indexeddb';

import { uint8ArrayToBase64, base64ToUint8Array } from '@/lib/utils';

export class YjsPocketbaseProvider {
    private doc: Y.Doc;
    private listId: string;
    private pb: PocketBase;
    public persistence: IndexeddbPersistence;
    private unsubscribe: (() => void) | null = null;
    private updateTimeout: ReturnType<typeof setTimeout> | null = null;
    private debounceDelay = 500; // milliseconds
    

    constructor(listId: string, doc: Y.Doc, pbInstance: PocketBase) {
        this.listId = listId;
        this.doc = doc;
        this.pb = pbInstance;
        console.log(`[YjsPocketbaseProvider] New instance created for list: ${listId}`);

        // 1. Setup IndexedDB persistence for offline support and initial load
        this.persistence = new IndexeddbPersistence(listId, doc);
        this.persistence.on('update', (yjsUpdate: Uint8Array, origin: any) => {
            console.log(`[YjsPocketbaseProvider] IndexedDB update for list: ${listId}. Update size: ${yjsUpdate.byteLength} bytes. Origin:`, origin);
        });

        // 2. Listen for local Yjs changes and push them to PocketBase
        // The 'update' event fires when the Y.Doc changes (locally or remotely applied)
        this.doc.on('update', this._onLocalUpdate);
    }

    

    private _onLocalUpdate = (update: Uint8Array, origin: any) => {
        // Prevent re-broadcasting updates that originated from PocketBase or from this provider
        if (origin === this.pb || origin === 'pocketbase') {
            console.log(`[YjsPocketbaseProvider] Skipping update due to origin: ${origin}`);
            return;
        }

        console.log(`[YjsPocketbaseProvider] Local Yjs update detected for list: ${this.listId}. Origin:`, origin);

        (async () => {
            console.log(`[YjsPocketbaseProvider] Attempting to send update to PocketBase for list: ${this.listId}.`);
            try {
                const base64Update = uint8ArrayToBase64(Y.encodeStateAsUpdate(this.doc));
                const metadata = this.doc.getMap('metadata').toJSON();
                const currentUser = this.pb.authStore.model;

                await this.pb.collection('task_lists').update(this.listId, {
                    yjsUpdate: base64Update,
                    name: metadata.name,
                    color: metadata.color,
                    pinned: metadata.pinned,
                    archived: metadata.archived,
                });
                console.log(`[YjsPocketbaseProvider] Successfully sent full state and metadata update to PocketBase for list: ${this.listId}`);
            } catch (error) {
                if (error instanceof ClientResponseError && error.status === 404) {
                    console.log(`[YjsPocketbaseProvider] List ${this.listId} not found in PocketBase, attempting to create.`);
                    try {
                        const metadata = this.doc.getMap('metadata').toJSON();
                        const yjsUpdate = Y.encodeStateAsUpdate(this.doc);
                        const base64Update = uint8ArrayToBase64(yjsUpdate);
                        const currentUser = this.pb.authStore.model;

                        await this.pb.collection('task_lists').create({
                            id: this.listId,
                            user_id: currentUser?.id,
                            createdAt: metadata.createdAt || new Date().toISOString(),
                            name: metadata.name || 'Unnamed List',
                            color: metadata.color || '#000000',
                            pinned: metadata.pinned || false,
                            archived: metadata.archived || false,
                            yjsUpdate: base64Update,
                        });
                        console.log(`[YjsPocketbaseProvider] Successfully created new list ${this.listId} in PocketBase.`);
                    } catch (createError) {
                        console.error(`[YjsPocketbaseProvider] Failed to create new list ${this.listId} in PocketBase:`, createError);
                    }
                } else {
                    console.error(`[YjsPocketbaseProvider] Failed to send update to PocketBase for list ${this.listId}:`, error);
                }
            }
        })();
    };

    public async connect() {
        try {
            // Fetch the latest state from PocketBase before subscribing
            try {
                const record = await this.pb.collection('task_lists').getOne(this.listId);
                if (record && record.yjsUpdate) {
                    const remoteUpdate = base64ToUint8Array(record.yjsUpdate);
                    Y.applyUpdate(this.doc, remoteUpdate, 'pocketbase');
                    console.log(`[YjsPocketbaseProvider] Retrieved latest state from server for list: ${this.listId}`);
                }
            } catch (fetchError) {
                console.error(`[YjsPocketbaseProvider] Failed to fetch initial state for list ${this.listId}:`, fetchError);
            }

            // After applying remote state, the local doc has the merged state.
            // We broadcast this back to ensure all clients converge to the same state.
            this._onLocalUpdate(Y.encodeStateAsUpdate(this.doc), 'reconnect-sync');

            this.unsubscribe = await this.pb.collection('task_lists').subscribe(this.listId, (e) => {
                console.log(`[YjsPocketbaseProvider] Realtime update received for list ${this.listId}:`, e);
                if (e.action === 'update') {
                    if (e.record.yjsUpdate) {
                        const remoteUpdate = base64ToUint8Array(e.record.yjsUpdate);
                        Y.applyUpdate(this.doc, remoteUpdate, 'pocketbase');
                    }
                }
            });
            if (typeof this.unsubscribe === 'function') {
                console.log(`[YjsPocketbaseProvider] Successfully subscribed for list: ${this.listId}.`);
            } else {
                console.warn(`[YjsPocketbaseProvider] Subscription failed for list: ${this.listId}. No unsubscribe function received.`);
            }
        } catch (error) {
            console.error(`[YjsPocketbaseProvider] Failed to subscribe or fetch initial state for list ${this.listId}:`, error);
        }
    }

    public disconnect() {
        if (this.unsubscribe !== null) {
            this.unsubscribe();
            this.unsubscribe = null;
            console.log(`[YjsPocketbaseProvider] Unsubscribed for list: ${this.listId}`);
        }
        console.log(`[YjsPocketbaseProvider] Disconnected from PocketBase for list: ${this.listId}`);
    };

    public destroy() {
        this.disconnect();
        this.doc.off('update', this._onLocalUpdate); // Remove event listener
        this.persistence?.destroy(); // Clean up IndexedDB persistence
        // Do not disconnect PocketBase realtime here, as it's a global connection.
        console.log(`[YjsPocketbaseProvider] Destroyed for list: ${this.listId}`);
    };

    public isConnected(): boolean {
        return typeof this.unsubscribe === 'function';
    }
}