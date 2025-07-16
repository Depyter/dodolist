import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { waitFor, act } from '@testing-library/react';
import * as Y from 'yjs';
import { GlobalPocketBaseProvider } from '../services/yjsPocketBase';
import { pb, mockCollectionGetOne, mockCollectionUpdate, mockCollectionSubscribe } from './setup';
import './setup'; // Ensure global mocks are loaded

describe('GlobalPocketBaseProvider Sync Logic', () => {
  let provider: GlobalPocketBaseProvider | null = null;
  const listId = 'test-list';

  let remoteUpdateCallback: (data: any) => void = () => {};

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup auth state
    pb.authStore.isValid = true;
    pb.authStore.token = 'test-token';
    pb.authStore.model = { id: 'user-id', email: 'test@test.com', username: 'test', verified: true, avatar: '' };
    pb.realtime.isConnected = true;

    // Mock navigator
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    // Setup collection mock with subscribe that captures the callback
    mockCollectionSubscribe.mockImplementation((_id: string, callback: any) => {
      remoteUpdateCallback = callback;
      return 'subscription-id';
    });

    provider = GlobalPocketBaseProvider.getInstance();
  });

  afterEach(() => {
    provider?.destroy();
    provider = null;
    // Clear the singleton instance for the next test
    (GlobalPocketBaseProvider as any).instance = null;
  });

  it('should connect, fetch initial state, and sync local changes', async () => {
    // 1. Initial server state
    const initialDoc = new Y.Doc();
    initialDoc.getText('name').insert(0, 'Initial Name');
    const initialStateUpdate = Y.encodeStateAsUpdate(initialDoc);
    const base64InitialState = Buffer.from(initialStateUpdate).toString('base64');
    mockCollectionGetOne.mockResolvedValue({ id: listId, yjsUpdate: base64InitialState });
    mockCollectionUpdate.mockResolvedValue({});

    // 2. Create provider
    provider = GlobalPocketBaseProvider.getInstance();
    const docProvider = provider.getDocumentProvider(listId);

    // 3. Verify initial state is applied
    await waitFor(() => {
      expect(mockCollectionGetOne).toHaveBeenCalledWith(listId, { requestKey: null });
      expect(docProvider.doc.getText('name').toString()).toBe('Initial Name');
    });

    // 4. Make a local change
    act(() => {
      docProvider.doc.getArray('todos').insert(0, [{ text: 'new todo' }]);
    });

    // 5. Verify the local change is synced to PocketBase
    await waitFor(() => {
      expect(mockCollectionUpdate).toHaveBeenCalled();
    });

    const sentData = mockCollectionUpdate.mock.calls[0][1].yjsUpdate;
    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, Buffer.from(sentData, 'base64'));
    expect(tempDoc.getArray('todos').toJSON()).toEqual([{ text: 'new todo' }]);
    expect(tempDoc.getText('name').toString()).toBe('Initial Name');
  });

  it('should apply remote updates to the local document', async () => {
    mockCollectionGetOne.mockResolvedValue({ id: listId, yjsUpdate: '' });
    provider = GlobalPocketBaseProvider.getInstance();
    const docProvider = provider.getDocumentProvider(listId);

    await waitFor(() => {
      expect(mockCollectionSubscribe).toHaveBeenCalledWith(listId, expect.any(Function), { requestKey: null });
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
    pb.realtime.isConnected = false;
    Object.defineProperty(navigator, 'onLine', { value: false });

    provider = GlobalPocketBaseProvider.getInstance();
    const docProvider = provider.getDocumentProvider(listId);

    // 2. Make a local change while offline
    act(() => {
      docProvider.doc.getText('name').insert(0, 'Offline Change');
    });

    // 3. Verify no sync was attempted yet
    expect(mockCollectionUpdate).not.toHaveBeenCalled();

    // 4. Simulate reconnection
    const remoteDoc = new Y.Doc();
    remoteDoc.getArray('todos').insert(0, [{ text: 'remote todo' }]);
    const remoteStateUpdate = Y.encodeStateAsUpdate(remoteDoc);
    const base64RemoteState = Buffer.from(remoteStateUpdate).toString('base64');
    mockCollectionGetOne.mockResolvedValue({ id: listId, yjsUpdate: base64RemoteState });
    mockCollectionUpdate.mockResolvedValue({});

    await act(async () => {
      pb.realtime.isConnected = true;
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));
    });

    // 5. Verify it fetches latest, merges, and syncs back
    await waitFor(() => {
      expect(mockCollectionGetOne).toHaveBeenCalled();
      expect(mockCollectionUpdate).toHaveBeenCalled();
    });

    // 6. Check final merged state
    const finalDoc = docProvider.doc;
    expect(finalDoc.getText('name').toString()).toBe('Offline Change');
    expect(finalDoc.getArray('todos').toJSON()).toEqual([{ text: 'remote todo' }]);
  });
});
