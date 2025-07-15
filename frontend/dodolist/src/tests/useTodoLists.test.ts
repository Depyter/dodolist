import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTodoLists } from '../hooks/useTodoLists';
import PocketBase from 'pocketbase';
import * as Y from 'yjs';

// --- Mocks ---
vi.mock('pocketbase');
vi.mock('@/services/authService', () => ({
  default: vi.fn(() => ({
    isAuthenticated: () => true,
    getCurrentUser: () => ({ id: 'user-123' }),
  })),
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation((_name, doc) => {
    setTimeout(() => {
      if (doc && typeof doc.emit === 'function') {
        doc.emit('synced', []);
      }
    }, 0);
    return {
      on: vi.fn((event, callback) => {
        if (event === 'synced') {
          setTimeout(callback, 0);
        }
      }),
      whenSynced: Promise.resolve(),
      destroy: vi.fn(),
    };
  }),
}));

const mockPbInstance = {
  collection: vi.fn().mockImplementation(() => mockPbInstance),
  getFullList: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(), // Ensure unsubscribe is always defined
  authStore: {
    isValid: true,
    model: { id: 'user-123' },
    token: 'test-token',
    save: vi.fn(),
    clear: vi.fn(),
  },
};

// Patch PocketBase constructor globally to always return the same mock instance
(PocketBase as unknown as { mockReturnValue: (v: any) => void }).mockReturnValue(mockPbInstance);

// Patch PocketBase prototype so all instances share the same spies
(PocketBase.prototype as any).collection = function () { return mockPbInstance; };
(PocketBase.prototype as any).authStore = mockPbInstance.authStore;
(PocketBase.prototype as any).getFullList = mockPbInstance.getFullList;
(PocketBase.prototype as any).create = mockPbInstance.create;
(PocketBase.prototype as any).delete = mockPbInstance.delete;
(PocketBase.prototype as any).update = mockPbInstance.update;
(PocketBase.prototype as any).subscribe = mockPbInstance.subscribe;
(PocketBase.prototype as any).unsubscribe = mockPbInstance.unsubscribe;

// Helper to create a valid yjsUpdate string
const createYjsUpdate = (data: { name: string }) => {
  const doc = new Y.Doc();
  const ylist = doc.getMap('list');
  ylist.set('name', new Y.Text(data.name));
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
};

describe('useTodoLists Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPbInstance.collection.mockReturnValue(mockPbInstance);
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    // Default getFullList mock for all tests
    mockPbInstance.getFullList.mockResolvedValue([
      { id: '1', yjsUpdate: createYjsUpdate({ name: 'List 1' }) },
    ]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches initial lists and sets the active list', async () => {
    const mockLists = [
      { id: '1', yjsUpdate: createYjsUpdate({ name: 'List 1' }) },
      { id: '2', yjsUpdate: createYjsUpdate({ name: 'List 2' }) },
    ];
    mockPbInstance.getFullList.mockResolvedValue(mockLists);
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => result.current && result.current.todoLists !== undefined, { timeout: 60000 });
    await act(async () => {
      vi.runAllTimers();
      await new Promise(r => setTimeout(r, 0));
    });
    await waitFor(() => {
      expect(result.current.todoLists.length).toBe(2);
    }, { timeout: 60000 });
    expect(result.current.todoLists[0].name).toBe('List 1');
    expect(result.current.activeListId).toBe('1');
  });

  it('creates a new list optimistically and queues the backend operation', async () => {
    mockPbInstance.getFullList.mockResolvedValue([]); // No initial lists
    mockPbInstance.create.mockResolvedValue({ id: 'new-list' });
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => result.current && result.current.createNewList, { timeout: 60000 });
    await act(async () => {
      await result.current.createNewList('New List', 'bg-red-400');
      vi.runAllTimers();
      await new Promise(r => setTimeout(r, 0));
    });
    await waitFor(() => {
      expect(result.current.todoLists.find(l => l.name === 'New List')).toBeDefined();
    }, { timeout: 60000 });
    await waitFor(() => {
      expect(mockPbInstance.create).toHaveBeenCalled();
    }, { timeout: 60000 });
  });

  it('deletes a list optimistically and queues the backend operation', async () => {
    const initialLists = [{ id: '1', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }];
    mockPbInstance.getFullList.mockResolvedValue(initialLists);
    mockPbInstance.delete.mockResolvedValue({});
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => result.current && result.current.todoLists.length === 1, { timeout: 60000 });
    await waitFor(() => result.current && result.current.deleteList, { timeout: 60000 });
    await act(async () => {
      await result.current.deleteList('1');
      vi.runAllTimers();
      await new Promise(r => setTimeout(r, 0));
    });
    await waitFor(() => {
      expect(result.current.todoLists.find(l => l.id === '1')).toBeUndefined();
    }, { timeout: 60000 });
    await waitFor(() => {
      expect(mockPbInstance.delete).toHaveBeenCalledWith('task_lists', '1', { requestKey: null });
    }, { timeout: 60000 });
  });

  it('queues operations when offline and processes them when back online', async () => {
    mockPbInstance.getFullList.mockResolvedValue([]); // No initial lists
    mockPbInstance.create.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => result.current && result.current.createNewList, { timeout: 60000 });
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      window.dispatchEvent(new Event('offline'));
    });
    await act(async () => {
      await result.current.createNewList('Offline List', 'bg-blue-500');
      vi.runAllTimers();
      await new Promise(r => setTimeout(r, 0));
    });
    await waitFor(() => {
      expect(result.current.todoLists.find(l => l.name === 'Offline List')).toBeDefined();
    }, { timeout: 60000 });
    expect(mockPbInstance.create).not.toHaveBeenCalled();
    mockPbInstance.create.mockResolvedValue({ id: 'new-id' });
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));
      vi.runAllTimers();
    });
    await new Promise(r => setTimeout(r, 0));
    await waitFor(() => {
      expect(mockPbInstance.create).toHaveBeenCalled();
    }, { timeout: 60000 });
  });
});