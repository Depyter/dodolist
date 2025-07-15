// Use the proper waitFor from testing library instead of custom implementation
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import { waitFor, act } from '@testing-library/react';
import PocketBase from 'pocketbase';
import * as Y from 'yjs';
import { GlobalPocketBaseProvider } from '../services/yjsPocketBase';
import { IndexeddbPersistence } from 'y-indexeddb';

// --- Mocks ---
vi.mock('pocketbase');
vi.mock('y-indexeddb');

describe('GlobalPocketBaseProvider Sync Logic', () => {
  let provider: GlobalPocketBaseProvider | null = null;
  const listId = 'test-list';

  const mockPbInstance = {
    authStore: {
      isValid: true,
      token: 'test-token',
      model: { id: 'user-id' },
      onChange: vi.fn(),
    },
    collection: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
    update: vi.fn(),
    subscribe: vi.fn(),
    realtime: { isConnected: true },
  };

  const MockedPocketBase = PocketBase as Mock;
  const MockedIndexeddbPersistence = IndexeddbPersistence as Mock;

  let remoteUpdateCallback: (data: any) => void = () => {};

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup PocketBase mock
    MockedPocketBase.mockReturnValue(mockPbInstance);
    mockPbInstance.collection.mockReturnValue(mockPbInstance);
    mockPbInstance.subscribe.mockImplementation((_id, callback) => {
      remoteUpdateCallback = callback;
      return Promise.resolve(() => {}); // Return unsubscribe function
    });

    // Setup IndexedDB mock with immediate sync
    const mockPersistence = {
      on: vi.fn((event, cb) => {
        if (event === 'synced') cb(); // Immediate sync
      }),
      destroy: vi.fn(),
    };
    MockedIndexeddbPersistence.mockReturnValue(mockPersistence);

    // Mock navigator
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    provider?.destroy();
    provider = null;
  });

  it('should connect, fetch initial state, and sync local changes', async () => {
    // 1. Initial server state
    const initialDoc = new Y.Doc();
    initialDoc.getText('name').insert(0, 'Initial Name');
    const initialStateUpdate = Y.encodeStateAsUpdate(initialDoc);
    const base64InitialState = Buffer.from(initialStateUpdate).toString('base64');
    mockPbInstance.getOne.mockResolvedValue({ id: listId, yjsUpdate: base64InitialState });
    mockPbInstance.update.mockResolvedValue({});

    // 2. Create provider
    provider = GlobalPocketBaseProvider.getInstance();
    const docProvider = provider.getDocumentProvider(listId);

    // 3. Verify initial state is applied
    await waitFor(() => {
      expect(mockPbInstance.getOne).toHaveBeenCalledWith(listId, { requestKey: null });
      expect(docProvider.doc.getText('name').toString()).toBe('Initial Name');
    });

    // 4. Make a local change
    act(() => {
      docProvider.doc.getArray('todos').insert(0, [{ text: 'new todo' }]);
    });

    // 5. Verify the local change is synced to PocketBase
    await waitFor(() => {
      expect(mockPbInstance.update).toHaveBeenCalled();
    });

    const sentData = mockPbInstance.update.mock.calls[0][1].yjsUpdate;
    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, Buffer.from(sentData, 'base64'));
    expect(tempDoc.getArray('todos').toJSON()).toEqual([{ text: 'new todo' }]);
    expect(tempDoc.getText('name').toString()).toBe('Initial Name');
  });

  it('should apply remote updates to the local document', async () => {
    mockPbInstance.getOne.mockResolvedValue({ id: listId, yjsUpdate: null });
    provider = GlobalPocketBaseProvider.getInstance();
    const docProvider = provider.getDocumentProvider(listId);

    await waitFor(() => {
      expect(mockPbInstance.subscribe).toHaveBeenCalledWith(listId, expect.any(Function), { requestKey: null });
    });

    // Simulate a remote update from another client
    const remoteUpdateDoc = new Y.Doc();
    remoteUpdateDoc.getText('name').insert(0, 'Remote Update');
    const remoteUpdate = Y.encodeStateAsUpdate(remoteUpdateDoc);
    const base64RemoteUpdate = Buffer.from(remoteUpdate).toString('base64');

    act(() => {
      remoteUpdateCallback({
        action: 'update',
        record: { yjsUpdate: base64RemoteUpdate, yjsClientId: 'some-other-client' },
      });
    });

    expect(docProvider.doc.getText('name').toString()).toBe('Remote Update');
  });

  it('should queue changes when offline and sync upon reconnection', async () => {
    // 1. Simulate being offline
    mockPbInstance.realtime.isConnected = false;
    Object.defineProperty(navigator, 'onLine', { value: false });

    provider = GlobalPocketBaseProvider.getInstance();
    const docProvider = provider.getDocumentProvider(listId);

    // 2. Make a local change while offline
    act(() => {
      docProvider.doc.getText('name').insert(0, 'Offline Change');
    });

    // 3. Verify no sync was attempted
    expect(mockPbInstance.update).not.toHaveBeenCalled();

    // 4. Simulate reconnection
    const remoteDoc = new Y.Doc();
    remoteDoc.getArray('todos').insert(0, [{ text: 'remote todo' }]);
    const remoteStateUpdate = Y.encodeStateAsUpdate(remoteDoc);
    const base64RemoteState = Buffer.from(remoteStateUpdate).toString('base64');
    mockPbInstance.getOne.mockResolvedValue({ id: listId, yjsUpdate: base64RemoteState });
    mockPbInstance.update.mockResolvedValue({});

    await act(async () => {
      mockPbInstance.realtime.isConnected = true;
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));
    });

    // 5. Verify it fetches latest, merges, and syncs back
    await waitFor(() => {
      expect(mockPbInstance.getOne).toHaveBeenCalled();
      expect(mockPbInstance.update).toHaveBeenCalled();
    });

    // 6. Check final merged state
    const finalDoc = docProvider.doc;
    expect(finalDoc.getText('name').toString()).toBe('Offline Change');
    expect(finalDoc.getArray('todos').toJSON()).toEqual([{ text: 'remote todo' }]);
  });
});
