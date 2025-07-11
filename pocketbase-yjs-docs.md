# PocketBase Real-time API (JavaScript)

- Docs: https://pocketbase.io/docs/api-realtime/

## Overview
- Real-time API uses Server-Sent Events (SSE).
- Subscribe to a single record or an entire collection.
- Use `subscribe` and `unsubscribe` methods from the JavaScript SDK.

## Example Usage
```js
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');

// Authenticate (optional)
await pb.collection('users').authWithPassword('test@example.com', '1234567890');

// Subscribe to all changes in a collection
pb.collection('example').subscribe('*', (e) => {
    console.log(e.action); // 'create', 'update', 'delete'
    console.log(e.record);
});

// Subscribe to a single record
pb.collection('example').subscribe('RECORD_ID', (e) => {
    console.log(e.action);
    console.log(e.record);
});

// Unsubscribe
pb.collection('example').unsubscribe('RECORD_ID'); // remove all 'RECORD_ID' subscriptions
pb.collection('example').unsubscribe('*'); // remove all '*' topic subscriptions
pb.collection('example').unsubscribe(); // remove all subscriptions in the collection
```

- When subscribing to a record, the collection's ViewRule is used for access control.
- When subscribing to a collection, the ListRule is used.

---

# Yjs Quick Start

- Docs: https://docs.yjs.dev/

## Example Usage
```js
import * as Y from 'yjs';

// Create a Yjs document
const ydoc = new Y.Doc();
const ymap = ydoc.getMap();
ymap.set('keyA', 'valueA');

// Simulate a remote user
const ydocRemote = new Y.Doc();
const ymapRemote = ydocRemote.getMap();
ymapRemote.set('keyB', 'valueB');

// Merge changes from remote
yconst update = Y.encodeStateAsUpdate(ydocRemote);
Y.applyUpdate(ydoc, update);

console.log(ymap.toJSON()); // { keyA: 'valueA', keyB: 'valueB' }
```

## Key Points
- Yjs is a high-performance CRDT for collaborative apps.
- Shared types: Y.Map, Y.Array, Y.Text, etc.
- Network agnostic: you can use any network provider or build your own.
- Persistence providers available (IndexedDB, etc).
- See https://docs.yjs.dev/getting-started/a-collaborative-editor for more.

---

# Yjs Syncing

- Docs: https://docs.yjs.dev/

Yjs is network agnostic. You can use any network provider or build your own. As long as all changes eventually arrive, the documents will sync. The order in which document updates are applied doesn't matter.

- You can integrate Yjs into your own communication infrastructure or use existing network providers (WebRTC, WebSocket, etc).
- Yjs exposes its internal CRDT model as shared data types (Y.Map, Y.Array, Y.Text, etc) that can be manipulated concurrently and automatically merge without conflicts.
- See https://docs.yjs.dev/tutorials/creating-a-custom-provider for custom syncing providers.

---

# y-indexeddb (Yjs IndexedDB Persistence)

- Docs: https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb
- Repo: https://github.com/yjs/y-indexeddb

## Overview
IndexedDB database adapter for Yjs. Use the IndexedDB database adapter to store your shared data persistently in the browser. The next time you join the session, your changes will still be there.

- Minimizes the amount of data exchanged between server and client
- Makes offline editing possible

## Getting Started
```js
import { IndexeddbPersistence } from 'y-indexeddb';
const provider = new IndexeddbPersistence('docName', ydoc);

provider.on('synced', () => {
  console.log('content from the database is loaded');
});
```
- The "synced" event is fired when the connection to the database has been established and all available content has been loaded. The event is also fired if no content is found for the given doc name.
- Call `provider.destroy()` to remove the stored document and all related meta-information from the database.

---

# References
- PocketBase: https://pocketbase.io/docs/api-realtime/
- Yjs: https://docs.yjs.dev/
- Yjs Demos: https://github.com/yjs/yjs-demos
- Yjs README: https://github.com/yjs/yjs
