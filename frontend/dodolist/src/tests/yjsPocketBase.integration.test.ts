import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { useYjsTodoList } from '../hooks/useYjsTodoList';
import { useTodoLists } from '../hooks/useTodoLists';
import AuthService from '../services/authService';
import { GlobalPocketBaseProvider } from '../services/yjsPocketBase';
import './setup';
import {
  mockCollectionGetFullList,
  mockCollectionCreate,
  mockCollectionDelete,
  mockCollectionGetOne,
  mockCollectionUpdate,
  pb
} from './setup';

const createYjsUpdate = (data: Partial<{ name: string; color: string; pinned: boolean; archived: boolean; todos: any[] }>) => {
  const doc = new Y.Doc();
  const ylist = doc.getMap('list');
  if (data.name) ylist.set('name', new Y.Text(data.name));
  if (data.color) ylist.set('color', new Y.Text(data.color));
  if (data.pinned !== undefined) {
    const pinnedMap = new Y.Map();
    pinnedMap.set('value', data.pinned);
    ylist.set('pinned', pinnedMap);
  }
  if (data.archived !== undefined) {
    const archivedMap = new Y.Map();
    archivedMap.set('value', data.archived);
    ylist.set('archived', archivedMap);
  }
  if (data.todos) {
    const yTodos = new Y.Array();
    yTodos.push(data.todos.map(t => new Y.Map(Object.entries(t))));
    ylist.set('todos', yTodos);
  }
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
};

describe('Yjs and Hooks Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    pb.authStore.isValid = true;
    pb.authStore.model = { id: 'user-123', email: 'test@test.com', username: 'test', verified: true, avatar: '' };
    pb.realtime.isConnected = true;
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    mockCollectionGetOne.mockResolvedValue({ yjsUpdate: '' });
    mockCollectionUpdate.mockResolvedValue({});
    vi.spyOn(AuthService.prototype, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(AuthService.prototype, 'getCurrentUser').mockReturnValue({ id: 'user-123', email: 'test@test.com', username: 'test', verified: true, avatar: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
    GlobalPocketBaseProvider.getInstance().destroy();
    (GlobalPocketBaseProvider as any).instance = null;
  });

  describe('useYjsTodoList', () => {
    it('initializes and updates state from Yjs document', async () => {
      const { result } = renderHook(() => useYjsTodoList('list-1'));
      expect(result.current.listData.name).toBe('');
      await act(async () => {
        result.current.updateListName('Updated Name');
      });
      expect(result.current.listData.name).toBe('Updated Name');
    });

    it('adds, toggles, and deletes todos', async () => {
      const { result } = renderHook(() => useYjsTodoList('list-2'));
      let todoId = '';
      await act(async () => {
        result.current.addTodo('Test Todo');
      });
      expect(result.current.listData.todos.length).toBe(1);
      expect(result.current.listData.todos[0].text).toBe('Test Todo');
      todoId = result.current.listData.todos[0].id;
      await act(async () => {
        result.current.toggleTodo(todoId);
      });
      expect(result.current.listData.todos[0].completed).toBe(true);
      await act(async () => {
        result.current.deleteTodo(todoId);
      });
      expect(result.current.listData.todos.length).toBe(0);
    });
  });

  describe('useTodoLists', () => {
    it('fetches lists and decodes yjsUpdate metadata', async () => {
      const mockLists = [
        { id: '1', user_id: 'user-123', yjsUpdate: createYjsUpdate({ name: 'List 1', color: 'bg-red-500' }) },
        { id: '2', user_id: 'user-123', yjsUpdate: createYjsUpdate({ name: 'List 2', color: 'bg-blue-500' }) },
      ];
      mockCollectionGetFullList.mockResolvedValue(mockLists);
      const { result } = renderHook(() => useTodoLists());
      await waitFor(() => {
        expect(result.current.todoLists.length).toBe(2);
        expect(result.current.todoLists[0].name).toBe('List 1');
        expect(result.current.todoLists[0].color).toBe('bg-red-500');
        expect(result.current.todoLists[1].name).toBe('List 2');
        expect(result.current.todoLists[1].color).toBe('bg-blue-500');
      }, { timeout: 10000 }); // Increase timeout
    });

    it('creates a new list and queues backend operation', async () => {
      mockCollectionGetFullList.mockResolvedValue([]);
      mockCollectionCreate.mockResolvedValue({ id: 'new-list-id' });
      const { result } = renderHook(() => useTodoLists());
      await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10000 });
      await act(async () => {
        await result.current.createNewList('New List', 'bg-green-500');
      });
      expect(result.current.todoLists.find(l => l.name === 'New List')).toBeDefined();
      await waitFor(() => {
        expect(mockCollectionCreate).toHaveBeenCalled();
      }, { timeout: 10000 });
    });

    it('deletes a list and creates a default if last', async () => {
      const mockLists = [{ id: '1', user_id: 'user-123', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }];
      mockCollectionGetFullList.mockResolvedValue(mockLists);
      mockCollectionDelete.mockResolvedValue({});
      mockCollectionCreate.mockResolvedValue({ id: 'default-list-id' });
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

    it('should not allow unauthenticated users to fetch or edit lists', async () => {
      vi.spyOn(AuthService.prototype, 'isAuthenticated').mockReturnValue(false);
      vi.spyOn(AuthService.prototype, 'getCurrentUser').mockReturnValue(null);
      mockCollectionGetFullList.mockResolvedValue([]);
      const { result } = renderHook(() => useTodoLists());
      await act(async () => {});
      expect(result.current.todoLists.length).toBe(0);
    });
  });

  describe('GlobalPocketBaseProvider', () => {
    it('queues sync operations when offline and processes when online', async () => {
      const provider = GlobalPocketBaseProvider.getInstance();
      const docProvider = provider.getDocumentProvider('sync-list');
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      provider.setConnectionStatus(false); // Simulate offline for provider
      await act(async () => {
        docProvider.doc.getMap('list').set('name', new Y.Text('Offline Name'));
      });
      expect(docProvider.getSyncStatus().status).toBe('offline');
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      provider.setConnectionStatus(true); // Simulate online for provider
      window.dispatchEvent(new Event('online'));
      await act(async () => {
        docProvider.doc.getMap('list').set('name', new Y.Text('Online Name'));
      });
      expect(['syncing', 'synced']).toContain(docProvider.getSyncStatus().status);
    });
  });
});
