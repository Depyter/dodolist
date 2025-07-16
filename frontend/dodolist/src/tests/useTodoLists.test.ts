import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { useTodoLists } from '../hooks/useTodoLists';
import AuthService from '../services/authService';
import './setup'; // Ensure global mocks are loaded
import { mockCollectionGetFullList, mockCollectionCreate, mockCollectionDelete, pb } from './setup';

// Mock AuthService
vi.mock('../services/authService');

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

describe('useTodoLists Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Mock the AuthService implementation
    vi.mocked(AuthService).mockImplementation(function() {
      // @ts-ignore: allow private pb for test
      this.pb = pb;
      return {
        isAuthenticated: () => true,
        getCurrentUser: () => ({ id: 'user-123', email: 'test@test.com', username: 'test', verified: true, avatar: '' }),
        onAuthChange: () => () => {},
        logout: () => {},
        login: vi.fn(),
        register: vi.fn(),
        requestPasswordReset: vi.fn(),
        confirmPasswordReset: vi.fn(),
        requestVerification: vi.fn(),
        confirmVerification: vi.fn(),
        updateProfile: vi.fn(),
        getToken: () => 'fake-token',
      };
    } as any);

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
    });

    expect(result.current.todoLists[0].name).toBe('List 1');
    expect(result.current.activeListId).toBe('1');
  });

  it('creates a new list optimistically and queues the backend operation', async () => {
    mockCollectionGetFullList.mockResolvedValue([]);
    mockCollectionCreate.mockResolvedValue({ id: 'new-list' });
    const { result } = renderHook(() => useTodoLists());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createNewList('New List', 'bg-red-400');
    });

    expect(result.current.todoLists.find(l => l.name === 'New List')).toBeDefined();
    
    await waitFor(() => {
      expect(mockCollectionCreate).toHaveBeenCalled();
    });
  });

  it('deletes a list optimistically and queues the backend operation', async () => {
    const mockLists = [{ id: '1', user_id: 'user-123', createdAt: '2023-01-01T00:00:00Z', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }];
    mockCollectionGetFullList.mockResolvedValue([...mockLists]);
    mockCollectionDelete.mockResolvedValue({});
    const { result } = renderHook(() => useTodoLists());

    await waitFor(() => expect(result.current.todoLists).toHaveLength(1));

    await act(async () => {
      await result.current.deleteList('1');
    });

    expect(result.current.todoLists.find(l => l.id === '1')).toBeUndefined();
    
    await waitFor(() => {
      expect(mockCollectionDelete).toHaveBeenCalledWith('1', { requestKey: null });
    });
  });

  it('queues operations when offline and processes them when back online', async () => {
    mockCollectionGetFullList.mockResolvedValue([]);
    const { result } = renderHook(() => useTodoLists());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Go offline
    await act(async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      await result.current.createNewList('Offline List', 'bg-gray-500');
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(result.current.todoLists.find(l => l.name === 'Offline List')).toBeDefined();

    // Go back online
    await act(async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockCollectionCreate).toHaveBeenCalled();
    });
  });
});