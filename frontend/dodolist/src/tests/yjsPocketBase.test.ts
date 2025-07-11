import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import PocketBase from 'pocketbase';
import * as Y from 'yjs';
import { PocketBaseProvider } from '../services/yjsPocketBase';

// Mock PocketBase properly (outside beforeEach)
vi.mock('pocketbase', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      authStore: {
        isValid: true,
        token: 'test-token',
        model: { id: 'user-id' },
        save: vi.fn(),
        onChange: vi.fn()
      },
      collection: vi.fn().mockReturnValue({
        getOne: vi.fn(),
        update: vi.fn(),
        subscribe: vi.fn().mockImplementation(() => Promise.resolve(() => {}))
      })
    }))
  };
});

// --- Mocks ---

// Mock y-indexeddb with a stateful in-memory store
const storedDocs = new Map<string, Uint8Array>();

// Create a proper mock class that implements the IndexeddbPersistence interface
class MockIndexeddbPersistence {
  private eventCallbacks: Record<string, Function[]> = {};
  private doc: Y.Doc;
  private dbName: string;
  private updateHandler: (update: Uint8Array, origin: any) => void;

  constructor(dbName: string, doc: Y.Doc) {
    this.dbName = dbName;
    this.doc = doc;
    
    // When a new persistence object is created, load the stored state if it exists.
    if (storedDocs.has(dbName)) {
      Y.applyUpdate(doc, storedDocs.get(dbName)!);
    }

    this.updateHandler = (_update: Uint8Array, _origin: any) => {
      // Persist the entire document state on any change.
      storedDocs.set(dbName, Y.encodeStateAsUpdate(doc));
    };

    doc.on('update', this.updateHandler);

    // Trigger 'synced' event in next tick to simulate IndexedDB sync completion
    setTimeout(() => {
      this.emit('synced');
    }, 0);
  }

  // Event emitter methods
  on(eventName: string, callback: Function) {
    if (!this.eventCallbacks[eventName]) {
      this.eventCallbacks[eventName] = [];
    }
    this.eventCallbacks[eventName].push(callback);
    
    // Immediately trigger 'synced' event if that's what we're listening for
    if (eventName === 'synced') {
      setTimeout(() => callback(), 0);
    }
    
    return this; // For method chaining
  }
  
  off = vi.fn((eventName: string, callback: Function) => {
    if (this.eventCallbacks[eventName]) {
      this.eventCallbacks[eventName] = this.eventCallbacks[eventName].filter(cb => cb !== callback);
    }
    return this;
  });
  
  emit = vi.fn((eventName: string, ...args: any[]) => {
    if (this.eventCallbacks[eventName]) {
      this.eventCallbacks[eventName].forEach(callback => callback(...args));
    }
  });
  
  // Promise that resolves when synced
  whenSynced = Promise.resolve();
  
  destroy = vi.fn(() => {
    // On destroy, ensure final state is saved and remove listener.
    storedDocs.set(this.dbName, Y.encodeStateAsUpdate(this.doc));
    this.doc.off('update', this.updateHandler);
    // Clear event listeners
    Object.keys(this.eventCallbacks).forEach(key => {
      this.eventCallbacks[key] = [];
    });
  });
}

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation((dbName: string, doc: Y.Doc) => {
    return new MockIndexeddbPersistence(dbName, doc);
  }),
}));

describe('PocketBaseProvider Sync Logic', () => {
  let provider: PocketBaseProvider | null = null;
  const listId = 'test-list';
  const dbName = `dodolist-yjs-${listId}`;

  // Reference to mocks for control during tests
  const mockPb = {
    authStore: {
      isValid: true,
      token: 'test-token',
      model: { id: 'user-id' },
      save: vi.fn(),
      onChange: vi.fn(),
    },
    collection: vi.fn(),
  };

  // Mocks for collection methods
  const getOneMock = vi.fn();
  const updateMock = vi.fn();
  const subscribeMock = vi.fn();
  let remoteUpdateCallback: (data: any) => void = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
    storedDocs.clear(); // Clear our in-memory DB for each test

    // Set up the PocketBase collection mock for this test
    const pbImpl = PocketBase as unknown as any;
    pbImpl.mockImplementation(() => mockPb);
    
    mockPb.collection.mockReturnValue({
      getOne: getOneMock,
      update: updateMock,
      subscribe: subscribeMock,
    });

    // Mock subscribe to capture the callback for remote updates
    subscribeMock.mockImplementation((_id, callback) => {
      remoteUpdateCallback = callback;
      return Promise.resolve(() => {}); // Return an unsubscribe function
    });

    // Default to authenticated state
    mockPb.authStore.isValid = true;
  });

  afterEach(() => {
    if (provider) {
      provider.destroy();
      provider = null;
    }
  });

  it('should connect, fetch initial state, and sync local changes', async () => {
    // 1. Initial state setup on the "server"
    const initialDoc = new Y.Doc();
    initialDoc.getText('name').insert(0, 'Initial Name');
    const initialStateUpdate = Y.encodeStateAsUpdate(initialDoc);
    const base64InitialState = Buffer.from(initialStateUpdate).toString('base64');
    getOneMock.mockResolvedValue({ id: listId, yjsUpdate: base64InitialState });
    updateMock.mockResolvedValue({});

    // 2. Create provider
    provider = new PocketBaseProvider(listId);
    await vi.waitFor(() => expect(getOneMock).toHaveBeenCalledWith(listId, { requestKey: null }));

    // 3. Verify initial state is applied
    expect(provider.doc.getText('name').toString()).toBe('Initial Name');

    // 4. Make a local change
    provider.doc.getArray('todos').insert(0, [{ text: 'new todo' }]);

    // 5. Verify the local change is synced to PocketBase
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalled());
    const sentData = updateMock.mock.calls[0][1].yjsUpdate;
    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, Buffer.from(sentData, 'base64'));
    expect(tempDoc.getArray('todos').toJSON()).toEqual([{ text: 'new todo' }]);
    expect(tempDoc.getText('name').toString()).toBe('Initial Name');
  });

  it('should queue changes when offline and sync upon reconnection', async () => {
    // 1. Simulate being offline initially
    getOneMock.mockRejectedValue(new Error('Network Error'));
    updateMock.mockRejectedValue(new Error('Network Error'));

    // 2. Create provider. It will fail to connect.
    provider = new PocketBaseProvider(listId);

    // 3. Make a local change while "offline". This change is persisted in our mock IndexedDB.
    provider.doc.getText('name').insert(0, 'Offline Change');

    // 4. Verify that a sync was attempted but failed.
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(provider.doc.getText('name').toString()).toBe('Offline Change');

    // 5. Simulate reconnection
    getOneMock.mockClear();
    updateMock.mockClear();
    const remoteDoc = new Y.Doc();
    remoteDoc.getArray('todos').insert(0, [{ text: 'remote todo' }]);
    const remoteStateUpdate = Y.encodeStateAsUpdate(remoteDoc);
    const base64RemoteState = Buffer.from(remoteStateUpdate).toString('base64');
    getOneMock.mockResolvedValue({ id: listId, yjsUpdate: base64RemoteState });
    updateMock.mockResolvedValue({});

    // 6. Manually trigger the connection retry logic.
    // In the real code, this is a busy loop. We'll just call connect again.
    await (provider as any).connect();

    // 7. Verify it fetches the latest remote state.
    await vi.waitFor(() => expect(getOneMock).toHaveBeenCalled());

    // 8. Verify that the merged state (local offline + remote) is synced back.
    // The merge happens when Y.applyUpdate is called inside connect(), which then
    // triggers the 'update' listener that queues the sync.
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalled());

    // 9. Check the final merged state of the document
    const finalDoc = provider.doc;
    expect(finalDoc.getText('name').toString()).toBe('Offline Change');
    expect(finalDoc.getArray('todos').toJSON()).toEqual([{ text: 'remote todo' }]);

    // 10. Check the data that was sent to the server
    const sentData = updateMock.mock.calls[0][1].yjsUpdate;
    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, Buffer.from(sentData, 'base64'));
    expect(tempDoc.getText('name').toString()).toBe('Offline Change');
    expect(tempDoc.getArray('todos').toJSON()).toEqual([{ text: 'remote todo' }]);
  });

  it('should work completely offline, persisting changes to indexeddb', async () => {
    // 1. Have some data in our mock indexeddb from a "previous session".
    const priorDoc = new Y.Doc();
    priorDoc.getText('name').insert(0, 'Session 1');
    storedDocs.set(dbName, Y.encodeStateAsUpdate(priorDoc));

    // 2. Simulate being completely offline.
    getOneMock.mockRejectedValue(new Error('No network'));
    updateMock.mockRejectedValue(new Error('No network'));

    // 3. Create a new provider. It should load from our mock indexeddb.
    provider = new PocketBaseProvider(listId);
    
    // Wait a bit for the 'synced' event to fire and load data
    await new Promise(resolve => setTimeout(resolve, 50));

    // 4. Verify prior data was loaded.
    expect(provider.doc.getText('name').toString()).toBe('Session 1');

    // 5. Make a new change while offline.
    provider.doc.getArray('todos').insert(0, [{ text: 'offline todo' }]);
    expect(provider.doc.getArray('todos').toJSON()).toEqual([{ text: 'offline todo' }]);

    // 6. Verify it tries to sync but fails.
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalled());

    // 7. Destroy the provider. This should save the merged state back to mock indexeddb.
    provider.destroy();
    provider = null;

    // 8. Create another provider instance, still offline, to ensure persistence worked.
    const provider2 = new PocketBaseProvider(listId);
    
    // Wait a bit for the 'synced' event to fire and load data
    await new Promise(resolve => setTimeout(resolve, 50));

    // 9. Verify the new doc has all the changes.
    expect(provider2.doc.getText('name').toString()).toBe('Session 1');
    expect(provider2.doc.getArray('todos').toJSON()).toEqual([{ text: 'offline todo' }]);
    provider2.destroy();
  });

  it('should not attempt to sync if the user is not authenticated', async () => {
    // 1. Set auth to invalid
    mockPb.authStore.isValid = false;
    
    // 2. Create provider
    provider = new PocketBaseProvider(listId);

    // 3. Make a local change
    provider.doc.getText('name').insert(0, 'No Auth Change');

    // 4. Wait a bit to ensure no network calls are made
    await new Promise(r => setTimeout(r, 100));
    
    // 5. Verify no connection or update calls were made
    expect(getOneMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});