import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { useTodoLists } from '../hooks/useTodoLists';
import AuthService from '../services/authService';
import './setup';
import { mockCollectionGetFullList, mockCollectionCreate, mockCollectionDelete } from './setup';

// Helper to create a valid yjsUpdate string
const createYjsUpdate = (data: { name: string; color?: string; pinned?: boolean; archived?: boolean }) => {
  const doc = new Y.Doc();
  const ylist = doc.getMap('list');
  ylist.set('name', new Y.Text(data.name));
  ylist.set('color', new Y.Text(data.color || 'bg-stone-400'));
  const ypinned = new Y.Map();
  ypinned.set('value', data.pinned || false);
  ylist.set('pinned', ypinned);
  const yarchived = new Y.Map();
  yarchived.set('value', data.archived || false);
  ylist.set('archived', yarchived);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
};

describe('useTodoLists', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Properly mock AuthService methods
    vi.spyOn(AuthService.prototype, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(AuthService.prototype, 'getCurrentUser').mockReturnValue({ id: 'user-123', email: 'test@test.com', username: 'test', verified: true, avatar: '' });
    vi.spyOn(AuthService.prototype, 'onAuthChange').mockImplementation(() => () => {});
    vi.spyOn(AuthService.prototype, 'logout').mockImplementation(() => {});
    vi.spyOn(AuthService.prototype, 'login').mockImplementation(vi.fn());
    vi.spyOn(AuthService.prototype, 'register').mockImplementation(vi.fn());
    vi.spyOn(AuthService.prototype, 'requestPasswordReset').mockImplementation(vi.fn());
    vi.spyOn(AuthService.prototype, 'confirmPasswordReset').mockImplementation(vi.fn());
    vi.spyOn(AuthService.prototype, 'requestVerification').mockImplementation(vi.fn());
    vi.spyOn(AuthService.prototype, 'confirmVerification').mockImplementation(vi.fn());
    vi.spyOn(AuthService.prototype, 'updateProfile').mockImplementation(vi.fn());
    vi.spyOn(AuthService.prototype, 'getToken').mockReturnValue('fake-token');
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  it('fetches initial lists and sets the active list', async () => {
    const mockLists = [
      { id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1' }) },
      { id: '2', user_id: 'user-123', createdAt: '2023-01-02T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 2' }) },
    ];
    mockCollectionGetFullList.mockResolvedValue([...mockLists]);
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.todoLists).toHaveLength(2);
    }, { timeout: 10000 }); // Increase timeout for slow test
    expect(result.current.todoLists[0].name).toBe('List 1');
    expect(result.current.activeListId).toBe('1');
  });

  it('creates a new list and updates state optimistically', async () => {
    mockCollectionGetFullList.mockResolvedValue([]);
    mockCollectionCreate.mockResolvedValue({ id: 'new-list' });
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10000 });
    await act(async () => {
      await result.current.createNewList('New List', 'bg-red-400');
    });
    expect(result.current.todoLists.find(l => l.name === 'New List')).toBeDefined();
    await waitFor(() => {
      expect(mockCollectionCreate).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it('deletes a list and removes it from state', async () => {
    const mockLists = [{ id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }];
    mockCollectionGetFullList.mockResolvedValue([...mockLists]);
    mockCollectionDelete.mockResolvedValue({});
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => expect(result.current.todoLists).toHaveLength(1), { timeout: 10000 });
    await act(async () => {
      await result.current.deleteList('1');
    });
    expect(result.current.todoLists.find(l => l.id === '1')).toBeUndefined();
    await waitFor(() => {
      expect(mockCollectionDelete).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it('creates a default list if last list is deleted', async () => {
    const mockLists = [{ id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }];
    mockCollectionGetFullList.mockResolvedValue([...mockLists]);
    mockCollectionDelete.mockResolvedValue({});
    mockCollectionCreate.mockResolvedValue({ id: 'default-list' });
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => expect(result.current.todoLists.length).toBe(1), { timeout: 10000 });
    await act(async () => {
      await result.current.deleteList('1');
    });
    expect(result.current.todoLists.length).toBe(1);
    expect(result.current.todoLists[0].name).toBe('Default List');
    await waitFor(() => {
      expect(mockCollectionCreate).toHaveBeenCalled();
    }, { timeout: 10000 });
  });

  it('does not fetch lists if unauthenticated', async () => {
    vi.mocked(AuthService).mockImplementation(function() {
      return {
        isAuthenticated: () => false,
        getCurrentUser: () => null,
      };
    } as any);
    mockCollectionGetFullList.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoLists());
    await act(async () => {});
    expect(result.current.todoLists.length).toBe(0);
  });

  it('queues operations when offline and processes when online', async () => {
    mockCollectionGetFullList.mockResolvedValue([]);
    mockCollectionCreate.mockResolvedValue({ id: 'offline-list' });
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      await result.current.createNewList('Offline List', 'bg-gray-500');
      await vi.runAllTimersAsync();
    });
    expect(result.current.todoLists.find(l => l.name === 'Offline List')).toBeDefined();
    await act(async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
      await vi.runAllTimersAsync();
    });
    await waitFor(() => {
      expect(mockCollectionCreate).toHaveBeenCalled();
    });
  });

  it('soft deletes a list and ensures it does not resurrect after sync', async () => {
    const mockLists = [
      { id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }
    ];
    mockCollectionGetFullList.mockResolvedValue([...mockLists]);
    mockCollectionDelete.mockResolvedValue({});
    const { result } = renderHook(() => useTodoLists());
    await waitFor(() => expect(result.current.todoLists).toHaveLength(1), { timeout: 10000 });
    await act(async () => {
      await result.current.deleteList('1');
    });
    // List should be removed from visible lists
    expect(result.current.todoLists.find(l => l.id === '1')).toBeUndefined();
    // Simulate a sync event from another client (resurrection attempt)
    mockCollectionGetFullList.mockResolvedValue([
      { id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1', archived: false, pinned: false }), deleted: true }
    ]);
    await act(async () => {
      await result.current.createNewList('Another List', 'bg-blue-400'); // trigger fetchLists
    });
    // List should still not be visible
    expect(result.current.todoLists.find(l => l.id === '1')).toBeUndefined();
  });
});