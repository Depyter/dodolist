import * as Y from 'yjs';
import PocketBase from 'pocketbase';
import { IndexeddbPersistence } from 'y-indexeddb';

// --- Helper Functions (can be moved to a shared utils.ts if preferred) ---
function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
// --- End Helper Functions ---

export class YjsPocketbaseProvider {
    private doc: Y.Doc;
    private listId: string;
    private pb: PocketBase;
    private persistence: IndexeddbPersistence;
    private unsubscribe: (() => void) | null = null;
    private isSynced: boolean = false; // Tracks if connected to PocketBase realtime

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

    private _onLocalUpdate = async (update: Uint8Array, origin: any) => {
        // Prevent re-broadcasting updates that originated from PocketBase
        // The 'origin' parameter is crucial for avoiding infinite loops.
        if (origin === this.pb) { // 'this.pb' is passed as origin when applying remote updates
            return;
        }

        console.log(`[YjsPocketbaseProvider] Local Yjs update detected for list: ${this.listId}`);
        try {
            // Encode the Yjs update (which is a Uint8Array) to base64 string
            const base64Update = uint8ArrayToBase64(update);
            console.log(`[YjsPocketbaseProvider] Sending local Yjs update to PocketBase for list ${this.listId}. Update size: ${update.length} bytes.`);

            // Send the update to PocketBase. 
            // We're updating the 'yjsUpdate' field of the specific list record.
            // PocketBase's real-time API will then broadcast this change to all subscribed clients.
            await this.pb.collection('task_lists').update(this.listId, {
                yjsUpdate: base64Update,
            });
            console.log(`[YjsPocketbaseProvider] Sent update to PocketBase for list: ${this.listId}`);
        } catch (error) {
            console.error(`[YjsPocketbaseProvider] Failed to send update to PocketBase for list ${this.listId}:`, error);
            throw error; // Re-throw the error
        }
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
                Y.applyUpdate(this.doc, remoteUpdate, this.pb);
                console.log(`[YjsPocketbaseProvider] Applied initial state from PocketBase for list: ${this.listId}. Yjs update size: ${remoteUpdate.length} bytes.`);
            } else {
                console.log(`[YjsPocketbaseProvider] No initial Yjs state found for list: ${this.listId}.`);
            }

            // 2. Subscribe to real-time updates from PocketBase for this specific list record
            this.unsubscribe = await this.pb.collection('task_lists').subscribe(this.listId, (e) => {
                if (e.action === 'update' && e.record.yjsUpdate) {
                    console.log(`[YjsPocketbaseProvider] Received real-time update for list: ${this.listId}. Action: ${e.action}`);
                    const remoteUpdate = base64ToUint8Array(e.record.yjsUpdate);
                    Y.applyUpdate(this.doc, remoteUpdate, this.pb);
                    console.log(`[YjsPocketbaseProvider] Applied real-time update for list: ${this.listId}. Yjs update size: ${remoteUpdate.length} bytes.`);
                }
            });
            this.isSynced = true;
            console.log(`[YjsPocketbaseProvider] Successfully connected and subscribed to real-time updates for list: ${this.listId}`);
        } catch (error) {
            console.error(`[YjsPocketbaseProvider] Failed to connect to PocketBase for list ${this.listId}:`, error);
            this.isSynced = false; // Mark as not synced
            throw error; // Re-throw the error
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
        this.persistence.destroy(); // Clean up IndexedDB persistence
        console.log(`[YjsPocketbaseProvider] Destroyed for list: ${this.listId}`);
    };
}