// Core Yjs collaborative provider for a single todo list
import * as Y from 'yjs'
import PocketBase from 'pocketbase'

// Helper: base64 encode/decode for Uint8Array
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

export class YjsTodoListProvider {
  private doc: Y.Doc
  private pb: PocketBase
  private listId: string
  private unsubscribe: (() => void) | null = null
  private isApplyingRemote = false
  private lastRemoteBase64: string | null = null

  constructor(listId: string, doc: Y.Doc, pbUrl: string) {
    this.listId = listId
    this.doc = doc
    this.pb = new PocketBase(pbUrl)
    this.init()
  }

  private async init() {
    // 1. Load initial state from PB
    try {
      const record = await this.pb.collection('task_lists').getOne(this.listId)
      if (record && record.yjsUpdate) {
        try {
          const update = base64ToUint8Array(record.yjsUpdate)
          Y.applyUpdate(this.doc, update)
          this.lastRemoteBase64 = record.yjsUpdate
        } catch (e) {
          console.error('Failed to decode/apply yjsUpdate from PB:', e)
        }
      }
    } catch (e) {
      // If not found, just start with empty doc
      console.warn('No yjsUpdate found in PB for this list')
    }

    // 2. Listen for remote PB updates
    this.pb.realtime.subscribe(
      `task_lists/${this.listId}`,
      (event) => {
        if (event.action === 'update' && event.record.yjsUpdate) {
          if (event.record.yjsUpdate !== this.lastRemoteBase64) {
            this.isApplyingRemote = true
            const update = base64ToUint8Array(event.record.yjsUpdate)
            Y.applyUpdate(this.doc, update)
            this.lastRemoteBase64 = event.record.yjsUpdate
            this.isApplyingRemote = false
          }
        }
      }
    ).then((unsubscribe) => {
      this.unsubscribe = unsubscribe
    })

    // 3. On local Yjs doc update, save full state to PB
    this.doc.on('update', async () => {
      if (this.isApplyingRemote) return
      // Always encode the full state, not just the update!
      const fullState = Y.encodeStateAsUpdate(this.doc)
      const base64 = uint8ArrayToBase64(fullState)
      if (base64 === this.lastRemoteBase64) return // Don't re-save if no change
      this.lastRemoteBase64 = base64
      try {
        await this.pb.collection('task_lists').update(this.listId, {
          yjsUpdate: base64
        })
      } catch (err) {
        console.error('Failed to update Yjs state in PocketBase:', err)
      }
    })
  }

  destroy() {
    this.doc.destroy()
    if (this.unsubscribe) this.unsubscribe()
  }
}

// Usage (in a React hook or component):
// const pbUrl = import.meta.env.VITE_API_URL; // e.g., http://localhost:8080
// const ydoc = new Y.Doc();
// const provider = new YjsTodoListProvider(listId, ydoc, pbUrl);
// ...bind ydoc to your UI state...
