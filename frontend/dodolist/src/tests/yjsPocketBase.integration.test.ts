import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { useYjsTodoList } from '../hooks/useYjsTodoList';
import { useTodoLists } from '../hooks/useTodoLists';
import { GlobalPocketBaseProvider } from '../services/yjsPocketBase';
import { pb, mockCollectionGetFullList, mockCollectionCreate, mockCollectionDelete, mockCollectionGetOne, mockCollectionUpdate } from './setup';
import './setup'; // Ensure global mocks are loaded
import AuthService from '../services/authService';

// Helper to create a valid yjsUpdate string
const createYjsUpdate = (data: Partial<{ name: string; color: string; pinned: boolean; archived: boolean; todos: any[] }>) => {
    if (!data) return '';
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


describe('Yjs and Hooks Integration Tests', () => {
  vi.setConfig({ testTimeout: 30000 });
  vi.setConfig({ testTimeout: 30000 });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Setup mock auth state for all tests in this suite
    pb.authStore.isValid = true;
    pb.authStore.model = { id: 'user-123', email: 'test@test.com', username: 'test', verified: true, avatar: '' };
    pb.realtime.isConnected = true;
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    // Setup default mocks for document operations
    mockCollectionGetOne.mockResolvedValue({ yjsUpdate: '' });
    mockCollectionUpdate.mockResolvedValue({});
    
    vi.spyOn(AuthService.prototype, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(AuthService.prototype, 'getCurrentUser').mockReturnValue({ id: 'user-123', email: 'test@test.com', username: 'test', verified: true, avatar: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
    const provider = GlobalPocketBaseProvider.getInstance();
    provider.destroy();
    // Clear the singleton instance for the next test
    (GlobalPocketBaseProvider as any).instance = null;
  });

  // --- useYjsTodoList Hook Tests ---
  describe('useYjsTodoList Hook', () => {
    it('initializes and updates its state from the Yjs document', async () => {
        const { result } = renderHook(() => useYjsTodoList('list-1'));
        
        // Should be empty initially
        expect(result.current.listData.name).toBe('');

        // Simulate a document update
        await act(async () => {
            const provider = GlobalPocketBaseProvider.getInstance().getDocumentProvider('list-1');
            provider.doc.getMap('list').set('name', new Y.Text('Updated Name'));
            await vi.runAllTimersAsync();
            await Promise.resolve();
        });

        expect(result.current.listData.name).toBe('Updated Name');
    });

    it('adds, toggles, and deletes todos', async () => {
        const { result } = renderHook(() => useYjsTodoList('list-2'));
        let todoId = '';

        await act(async () => {
            result.current.addTodo('Test Todo');
            await vi.runAllTimersAsync();
            await Promise.resolve();
        });
        expect(result.current.listData.todos.length).toBe(1);
        expect(result.current.listData.todos[0].text).toBe('Test Todo');
        todoId = result.current.listData.todos[0].id;

        await act(async () => {
            result.current.toggleTodo(todoId);
            await vi.runAllTimersAsync();
            await Promise.resolve();
        });
        expect(result.current.listData.todos[0].completed).toBe(true);

        await act(async () => {
            result.current.deleteTodo(todoId);
            await vi.runAllTimersAsync();
            await Promise.resolve();
        });
        expect(result.current.listData.todos.length).toBe(0);
    });
  });

  // --- useTodoLists Hook Tests ---
  describe('useTodoLists Hook', () => {
    it('fetches lists and correctly decodes yjsUpdate metadata', async () => {
        const mockLists = [
          { id: '1', user_id: 'user-123', yjsUpdate: createYjsUpdate({ name: 'List 1', color: 'bg-red-500' }) },
          { id: '2', user_id: 'user-123', yjsUpdate: createYjsUpdate({ name: 'List 2', pinned: true }) },
        ];
        mockCollectionGetFullList.mockResolvedValue(mockLists);
    
        const { result } = renderHook(() => useTodoLists());
    
        await waitFor(() => {
          expect(result.current.todoLists.length).toBe(2);
        });
    
        expect(result.current.todoLists[0].name).toBe('List 1');
        expect(result.current.todoLists[0].color).toBe('bg-red-500');
        expect(result.current.todoLists[1].name).toBe('List 2');
        expect(result.current.todoLists[1].pinned).toBe(true);
      }, 10000);

      it('creates a new list and queues the backend operation', async () => {
        mockCollectionGetFullList.mockResolvedValue([]);
        mockCollectionCreate.mockResolvedValue({ id: 'new-list-id' });
    
        const { result } = renderHook(() => useTodoLists());
    
        await waitFor(() => expect(result.current.loading).toBe(false));
    
        let newId = '';
        await act(async () => {
          newId = await result.current.createNewList('A New List', 'bg-purple-500');
        });
    
        expect(result.current.todoLists.length).toBe(1);
        expect(result.current.todoLists[0].name).toBe('A New List');
        
        await waitFor(() => {
          expect(mockCollectionCreate).toHaveBeenCalledWith(expect.objectContaining({ id: newId }), { requestKey: null });
        });
      });

      it('deletes a list and creates a default one if it was the last', async () => {
        const mockLists = [{ id: '1', user_id: 'user-123', yjsUpdate: createYjsUpdate({ name: 'List 1' }) }];
        mockCollectionGetFullList.mockResolvedValue(mockLists);
        mockCollectionDelete.mockResolvedValue({});
        mockCollectionCreate.mockResolvedValue({ id: 'new-default-list' }); // Mock for the new default list
    
        const { result } = renderHook(() => useTodoLists());
    
        await waitFor(() => expect(result.current.todoLists.length).toBe(1));
    
        await act(async () => {
          await result.current.deleteList('1');
        });
        
        // The hook creates a new default list, so the count should be 1
        expect(result.current.todoLists.length).toBe(1);
        expect(result.current.todoLists[0].name).toBe('Default List');
        
        await waitFor(() => {
          expect(mockCollectionDelete).toHaveBeenCalledWith('1', { requestKey: null });
        });
        await waitFor(() => {
            expect(mockCollectionCreate).toHaveBeenCalledWith(expect.objectContaining({
                name: "Default List"
            }), { requestKey: null });
        });
      });

      it('should not allow unauthenticated users to fetch or edit lists', async () => {
        // Patch AuthService to simulate unauthenticated user
        vi.spyOn(AuthService.prototype, 'isAuthenticated').mockReturnValue(false);
        vi.spyOn(AuthService.prototype, 'getCurrentUser').mockReturnValue(null);

        const { result } = renderHook(() => useTodoLists());
        // Wait for any effects to run
        await act(async () => { await vi.runAllTimersAsync(); });
        expect(result.current.todoLists.length).toBe(0);
        expect(result.current.loading).toBe(false);
        // Try to create a new list, should throw
        await expect(result.current.createNewList('Should Fail', 'bg-red-500')).rejects.toThrow();
      });
  });

  // --- GlobalPocketBaseProvider Tests ---
  describe('GlobalPocketBaseProvider', () => {
    it('queues sync operations when offline and processes when online', async () => {
        mockCollectionGetOne.mockResolvedValue({ yjsUpdate: '' });
        mockCollectionUpdate.mockResolvedValue({});
        const provider = GlobalPocketBaseProvider.getInstance();
        const docProvider = provider.getDocumentProvider('list-sync-test');

        await act(async () => { await vi.runAllTimersAsync(); });

        // Go offline
        act(() => { (provider as any).handleOffline(); });

        // Make a change
        act(() => { docProvider.doc.getText('name').insert(0, 'offline change'); });

        const docInstance = (provider as any).documents.get('list-sync-test');
        expect(docInstance.syncQueue.length).toBe(1);
        expect(mockCollectionUpdate).not.toHaveBeenCalled();

        // Go online
        await act(async () => {
            (provider as any).handleOnline();
            await vi.runAllTimersAsync();
        });

        expect(mockCollectionUpdate).toHaveBeenCalled();
        expect(docInstance.syncQueue.length).toBe(0);
    });
  });
});
