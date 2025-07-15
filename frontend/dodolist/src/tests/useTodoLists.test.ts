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
    if (doc && typeof doc.emit === 'function') {
      doc.emit('synced', []);
    }
    return {
      on: vi.fn((event, callback) => {
        if (event === 'synced') {
          callback();
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
const createYjsUpdate = (data: { name: string; color?: string; pinned?: boolean; archived?: boolean }) => {
  const doc = new Y.Doc();
  const ylist = doc.getMap('list');
  
  // Add name
  const yname = new Y.Text();
  yname.insert(0, data.name);
  ylist.set('name', yname);
  
  // Add color
  const ycolor = new Y.Text();
  ycolor.insert(0, data.color || 'bg-stone-400');
  ylist.set('color', ycolor);
  
  // Add pinned
  const ypinned = new Y.Map();
  ypinned.set('value', data.pinned || false);
  ylist.set('pinned', ypinned);
  
  // Add archived
  const yarchived = new Y.Map();
  yarchived.set('value', data.archived || false);
  ylist.set('archived', yarchived);
  
  // Add deleted
  const ydeleted = new Y.Map();
  ydeleted.set('value', false);
  ylist.set('deleted', ydeleted);
  
  // Add todos array
  const ytodos = new Y.Array();
  ylist.set('todos', ytodos);
  
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
};

describe('useTodoLists Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPbInstance.collection.mockReturnValue(mockPbInstance);
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    // Don't set a default getFullList mock - let each test set its own
  });
  afterEach(() => {
    // No need for vi.useRealTimers()
  });

  it('fetches initial lists and sets the active list', async () => {
    const mockLists = [
      { id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1' }) },
      { id: '2', user_id: 'user-123', createdAt: '2023-01-02T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 2' }) },
    ];
    mockPbInstance.getFullList.mockResolvedValue(mockLists);
    const { result } = renderHook(() => useTodoLists());
    
    // Wait for loading to complete and lists to be populated
    await waitFor(() => {
      return !result.current.loading && result.current.todoLists.length === 2;
    }, { timeout: 3000 });
    
    // Then wait a bit more for the metadata to be processed
    await waitFor(() => {
      return result.current.todoLists[0]?.name === 'List 1';
    }, { timeout: 1000 });
    
    expect(result.current.todoLists[0].name).toBe('List 1');
    expect(result.current.activeListId).toBe('1');
  });

  it('creates a new list optimistically and queues the backend operation', async () => {
    mockPbInstance.getFullList.mockResolvedValue([]); // No initial lists
    mockPbInstance.create.mockResolvedValue({ id: 'new-list' });
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => result.current && result.current.createNewList);
    act(() => {
      result.current.createNewList('New List', 'bg-red-400');
    });
    expect(result.current.todoLists.find(l => l.name === 'New List')).toBeDefined();
    expect(mockPbInstance.create).toHaveBeenCalled();
  });

  it('deletes a list optimistically and queues the backend operation', async () => {
    const initialLists = [{ id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }];
    mockPbInstance.getFullList.mockResolvedValue(initialLists);
    mockPbInstance.delete.mockResolvedValue({});
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => result.current && result.current.todoLists.length === 1);
    act(() => {
      result.current.deleteList('1');
    });
    expect(result.current.todoLists.find(l => l.id === '1')).toBeUndefined();
    // Wait for the queued operation to be processed
    await waitFor(() => {
      expect(mockPbInstance.delete).toHaveBeenCalledWith('1', { requestKey: null });
    });
  });

  it('queues operations when offline and processes them when back online', async () => {
    mockPbInstance.getFullList.mockResolvedValue([]); // No initial lists
    mockPbInstance.create.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => result.current && result.current.createNewList);
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      result.current.createNewList('Offline List', 'bg-blue-500');
    });
    expect(result.current.todoLists.find(l => l.name === 'Offline List')).toBeDefined();
    expect(mockPbInstance.create).not.toHaveBeenCalled();
    mockPbInstance.create.mockResolvedValue({ id: 'new-id' });
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(mockPbInstance.create).toHaveBeenCalled();
  });
});