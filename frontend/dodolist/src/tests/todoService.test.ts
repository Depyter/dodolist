import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePersistentTodoLists } from '../services/todoService';
import PocketBase, { ClientResponseError } from 'pocketbase'; // Import for type hinting and mocking
import AuthService from '../services/authService';
import { generateId, default as dbService } from '../services/dbService';
import { YjsPocketbaseProvider } from '../services/YjsPocketbaseProvider';
import * as Y from 'yjs';

// Mock external dependencies
vi.mock('pocketbase');
vi.mock('../services/authService');
vi.mock('../services/dbService', () => {
  const mockDbServiceInstance = {
    ready: vi.fn().mockResolvedValue(undefined),
  };
  return {
    generateId: vi.fn(),
    default: mockDbServiceInstance,
  };
});
vi.mock('../services/YjsPocketbaseProvider');
vi.mock('yjs'); // Mock the entire yjs module

// Mock PocketBase instance and its methods
const mockPb = new PocketBase('http://mock-url.com');
const mockGetFullList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGetOne = vi.fn();
const mockSubscribe = vi.fn();

// Mock AuthService methods
const mockGetCurrentUser = vi.fn();
const mockIsAuthenticated = vi.fn();

// Mock generateId
const mockGenerateId = vi.fn();

// Mock Yjs
let yDocUpdateCallback: ((update: Uint8Array, origin: any) => void) | undefined;
let yDocDataMap: Map<string, any[]>; // Centralized storage for Y.Doc data

const createMockYArray = (name: string) => {
  const mockYArray = {
    toJSON: vi.fn(() => [...(yDocDataMap.get(name) || [])]), // Return a copy of data from central map
    push: vi.fn((items: any[]) => {
      const currentData = yDocDataMap.get(name) || [];
      yDocDataMap.set(name, [...currentData, ...items]);
      if (yDocUpdateCallback) {
        yDocUpdateCallback(new Uint8Array(), 'mockOrigin'); // Simulate update
      }
    }),
    toArray: vi.fn(() => yDocDataMap.get(name) || []),
    findIndex: vi.fn((predicate: (item: any) => boolean) => (yDocDataMap.get(name) || []).findIndex(predicate)),
    get: vi.fn((index: number) => (yDocDataMap.get(name) || [])[index]),
    delete: vi.fn((index: number, length: number) => {
      const currentData = yDocDataMap.get(name) || [];
      currentData.splice(index, length);
      yDocDataMap.set(name, [...currentData]); // Update map with new array reference
      if (yDocUpdateCallback) {
        yDocUpdateCallback(new Uint8Array(), 'mockOrigin'); // Simulate update
      }
    }),
    insert: vi.fn((index: number, items: any[]) => {
      const currentData = yDocDataMap.get(name) || [];
      currentData.splice(index, 0, ...items);
      yDocDataMap.set(name, [...currentData]); // Update map with new array reference
      if (yDocUpdateCallback) {
        yDocUpdateCallback(new Uint8Array(), 'mockOrigin'); // Simulate update
      }
    }),
  };
  return mockYArray;
};

const mockYDoc = {
  getArray: vi.fn((name: string) => {
    if (!yDocArrays.has(name)) {
      yDocArrays.set(name, createMockYArray(name));
    }
    return yDocArrays.get(name)!;
  }),
  transact: vi.fn((cb) => cb()),
  on: vi.fn((event: 'update', callback: (update: Uint8Array, origin: any) => void) => {
    if (event === 'update') {
      yDocUpdateCallback = callback;
    }
  }),
  off: vi.fn(),
};
const mockYApplyUpdate = vi.fn();
const mockYEncodeStateAsUpdate = vi.fn();

describe('usePersistentTodoLists', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Setup PocketBase mocks
    (PocketBase as any).mockImplementation(() => mockPb);
    mockPb.collection = vi.fn((collectionName) => {
      if (collectionName === 'task_lists') {
        return {
          getFullList: mockGetFullList,
          create: mockCreate,
          update: mockUpdate,
          delete: mockDelete,
          getOne: mockGetOne,
          subscribe: mockSubscribe,
        };
      }
      // Ensure other collections also return necessary mocks if they are used
      return {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        getOne: vi.fn(),
        subscribe: vi.fn(),
        // Add any other methods that might be called on other collections
      };
    });

    // Setup AuthService mocks
    (AuthService as any).mockImplementation(() => ({
      getCurrentUser: mockGetCurrentUser,
      isAuthenticated: mockIsAuthenticated,
    }));

    // Setup generateId mock
    (generateId as any).mockImplementation(mockGenerateId);

    // Setup Yjs mocks
    (Y.Doc as any).mockImplementation(() => mockYDoc);
    (Y.applyUpdate as any).mockImplementation(mockYApplyUpdate);
    (Y.encodeStateAsUpdate as any).mockImplementation(mockYEncodeStateAsUpdate);

    // Mock YjsPocketbaseProvider
    (YjsPocketbaseProvider as any).mockImplementation((listId, doc, pbInstance) => ({
      listId,
      doc,
      pb: pbInstance,
      connect: vi.fn(async () => {
        const currentYArray = doc.getArray('todos');
        // Clear existing data in mockYArray to simulate fresh load
        (currentYArray.toJSON as vi.Mock).mockReturnValue([]);
        (currentYArray.toArray as vi.Mock).mockReturnValue([]);

        // Simulate applying an initial update if there's data from PocketBase
        const pbRecord = await pbInstance.collection('task_lists').getOne(listId);
        if (pbRecord && pbRecord.yjsUpdate) {
          // Assuming yjsUpdate is a JSON string for simplicity in mock
          const decodedTodos = JSON.parse(pbRecord.yjsUpdate);
          // Directly set the internal data of the mockYArray
          (currentYArray as any)._data = decodedTodos;
        }

        if (yDocUpdateCallback) {
          yDocUpdateCallback(new Uint8Array(), 'mockOrigin'); // Trigger the update callback
        }
      }),
      disconnect: vi.fn(),
      destroy: vi.fn(),
    }));
  });

  afterEach(() => {
    // Clean up any lingering effects or timers if necessary
  });

  // --- Test loadInitialData ---
  it('should not load data if user is not authenticated', async () => {
    mockGetCurrentUser.mockReturnValue(null);
    mockIsAuthenticated.mockReturnValue(false);

    const { result } = renderHook(() => usePersistentTodoLists());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetFullList).not.toHaveBeenCalled();
    expect(result.current.todoLists).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should create a default list and task if no lists exist for authenticated user', async () => {
    const mockUser = { id: 'user123', email: 'test@example.com', username: 'testuser' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    mockGetFullList.mockRejectedValue(new ClientResponseError({ status: 400, message: 'Invalid filter', data: {} })); // Simulate 400 error for no lists
    mockGenerateId.mockReturnValueOnce('defaultListId').mockReturnValueOnce('defaultTaskId');
    mockCreate.mockResolvedValueOnce({ // Mock PocketBase list creation
      id: 'defaultListId',
      name: 'My First List',
      color: 'bg-blue-500',
      createdAt: new Date().toISOString(),
      pinned: false,
      archived: false,
      user_id: 'user123',
    });

    // Mock the Y.Doc's getArray().toJSON() to return the default task after it's added
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [{
        id: 'defaultTaskId',
        text: 'Welcome to Dodolist! Start by adding your first task.',
        completed: false,
        createdAt: new Date().toISOString(),
        listId: 'defaultListId',
        recurring: 'none',
      }]),
      push: vi.fn(),
      toArray: vi.fn(() => [{ id: 'defaultTaskId' }]),
      findIndex: vi.fn(() => 0),
      get: vi.fn(() => ({ id: 'defaultTaskId' })),
      delete: vi.fn(),
      insert: vi.fn(),
    });


    const { result } = renderHook(() => usePersistentTodoLists());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.todoLists.length).toBe(1);
      expect(result.current.todoLists[0].name).toBe('My First List');
      expect(result.current.todoLists[0].todos.length).toBe(1);
      expect(result.current.todoLists[0].todos[0].text).toBe('Welcome to Dodolist! Start by adding your first task.');
      expect(result.current.activeListId).toBe('defaultListId');
    }, { timeout: 2000 }); // Increased timeout for async operations

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'My First List',
      user_id: 'user123',
    }));
    expect(YjsPocketbaseProvider).toHaveBeenCalledWith('defaultListId', mockYDoc, mockPb);
    expect((YjsPocketbaseProvider as any).mock.results[0].value.connect).toHaveBeenCalled();
    expect(mockYDoc.transact).toHaveBeenCalled();
    expect(mockYDoc.getArray().push).toHaveBeenCalledWith([expect.objectContaining({
      text: 'Welcome to Dodolist! Start by adding your first task.',
    })]);
  });

  it('should load existing lists for authenticated user', async () => {
    const mockUser = { id: 'user123', email: 'test@example.com', username: 'testuser' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockPbLists = [
      { id: 'list1', name: 'Work', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' },
      { id: 'list2', name: 'Personal', color: 'green', createdAt: new Date().toISOString(), user_id: 'user123' },
    ];
    mockGetFullList.mockResolvedValue(mockPbLists);

    // Mock Y.Doc to return some todos for existing lists
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [{ id: 'todo1', text: 'Task 1', completed: false, createdAt: new Date().toISOString() }]),
      toArray: vi.fn(() => [{ id: 'todo1' }]),
      findIndex: vi.fn(() => 0),
      get: vi.fn(() => ({ id: 'todo1' })),
      push: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    });

    const { result } = renderHook(() => usePersistentTodoLists());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.todoLists.length).toBe(2);
      expect(result.current.todoLists[0].name).toBe('Work');
      expect(result.current.todoLists[1].name).toBe('Personal');
      expect(result.current.activeListId).toBe('list1');
    });

    expect(mockGetFullList).toHaveBeenCalledWith(expect.objectContaining({
      filter: 'user_id = "user123"',
    }));
    expect(YjsPocketbaseProvider).toHaveBeenCalledTimes(2);
    expect(YjsPocketbaseProvider.mock.results[0].value.connect).toHaveBeenCalled();
    expect(YjsPocketbaseProvider.mock.results[1].value.connect).toHaveBeenCalled();
  });

  it('should handle error during initial data fetch', async () => {
    mockGetCurrentUser.mockReturnValue({ id: 'user123' });
    mockIsAuthenticated.mockReturnValue(true);
    const mockError = new Error('Network error');
    mockGetFullList.mockRejectedValue(mockError);

    const { result } = renderHook(() => usePersistentTodoLists());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(mockError);
      expect(result.current.todoLists).toEqual([]);
    });
  });

  // --- Test createNewList ---
  it('should create a new list and set it as active', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    mockGetFullList.mockResolvedValue([]); // Assume no existing lists initially
    mockGenerateId.mockReturnValueOnce('newListId');
    mockCreate.mockResolvedValueOnce({
      id: 'newListId',
      name: 'New Test List',
      color: 'red',
      createdAt: new Date().toISOString(),
      user_id: 'user123',
    });

    const { result } = renderHook(() => usePersistentTodoLists());

    // Wait for initial load to complete
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newId = await result.current.createNewList('New Test List', 'red');

    expect(newId).toBe('newListId');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Test List',
      color: 'red',
      user_id: 'user123',
    }));
    expect(result.current.todoLists.length).toBe(1);
    expect(result.current.todoLists[0].name).toBe('New Test List');
    expect(result.current.activeListId).toBe('newListId');
    expect(YjsPocketbaseProvider).toHaveBeenCalledWith('newListId', mockYDoc, mockPb);
    expect(YjsPocketbaseProvider.mock.results[YjsPocketbaseProvider.mock.results.length - 1].value.connect).toHaveBeenCalled();
  });

  // --- Test addTodo ---
  it('should add a todo to the active list', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockList = { id: 'activeList123', name: 'Active List', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' };
    mockGetFullList.mockResolvedValue([mockList]);
    mockGenerateId.mockReturnValueOnce('newTodoId');

    // Mock the Y.Doc's getArray().toJSON() to return the new todo after it's added
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [{
        id: 'newTodoId',
        text: 'New Task',
        completed: false,
        createdAt: new Date().toISOString(),
        listId: 'activeList123',
        recurring: 'none',
      }]),
      push: vi.fn(),
      toArray: vi.fn(() => [{ id: 'newTodoId' }]),
      findIndex: vi.fn(() => 0),
      get: vi.fn(() => ({ id: 'newTodoId' })),
      delete: vi.fn(),
      insert: vi.fn(),
    });

    const { result } = renderHook(() => usePersistentTodoLists());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeListId).toBe('activeList123');

    await result.current.addTodo({ text: 'New Task', listId: 'activeList123' });

    expect(mockYDoc.transact).toHaveBeenCalled();
    expect(mockYDoc.getArray().push).toHaveBeenCalledWith([expect.objectContaining({
      text: 'New Task',
      listId: 'activeList123',
      id: 'newTodoId',
    })]);
    // Verify that the todoLists state is updated
    await waitFor(() => {
      expect(result.current.todoLists[0].todos.length).toBe(1);
      expect(result.current.todoLists[0].todos[0].text).toBe('New Task');
    });
  });

  // --- Test updateTodo ---
  it('should update an existing todo', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockList = { id: 'activeList123', name: 'Active List', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' };
    mockGetFullList.mockResolvedValue([mockList]);

    const existingTodo = { id: 'existingTodoId', text: 'Old Task', completed: false, createdAt: new Date().toISOString(), listId: 'activeList123', recurring: 'none' };
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [existingTodo]),
      toArray: vi.fn(() => [existingTodo]),
      findIndex: vi.fn(() => 0),
      get: vi.fn(() => existingTodo),
      push: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    });

    const { result } = renderHook(() => usePersistentTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.updateTodo('existingTodoId', 'activeList123', { text: 'Updated Task' });

    expect(mockYDoc.transact).toHaveBeenCalled();
    expect(mockYDoc.getArray().delete).toHaveBeenCalledWith(0, 1);
    expect(mockYDoc.getArray().insert).toHaveBeenCalledWith(0, [expect.objectContaining({
      text: 'Updated Task',
      id: 'existingTodoId',
    })]);
  });

  // --- Test toggleTodo ---
  it('should toggle the completed status of a todo', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockList = { id: 'activeList123', name: 'Active List', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' };
    mockGetFullList.mockResolvedValue([mockList]);

    const existingTodo = { id: 'existingTodoId', text: 'Task', completed: false, createdAt: new Date().toISOString(), listId: 'activeList123', recurring: 'none' };
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [existingTodo]),
      toArray: vi.fn(() => [existingTodo]),
      findIndex: vi.fn(() => 0),
      get: vi.fn(() => existingTodo),
      push: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    });

    const { result } = renderHook(() => usePersistentTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.toggleTodo('existingTodoId', 'activeList123');

    expect(mockYDoc.transact).toHaveBeenCalled();
    expect(mockYDoc.getArray().delete).toHaveBeenCalledWith(0, 1);
    expect(mockYDoc.getArray().insert).toHaveBeenCalledWith(0, [expect.objectContaining({
      completed: true,
      completedAt: expect.any(String),
    })]);

    // Toggle again
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [{ ...existingTodo, completed: true }]),
      toArray: vi.fn(() => [{ ...existingTodo, completed: true }]),
      findIndex: vi.fn(() => 0),
      get: vi.fn(() => ({ ...existingTodo, completed: true })),
      push: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    });
    await result.current.toggleTodo('existingTodoId', 'activeList123');
    expect(mockYDoc.getArray().insert).toHaveBeenCalledWith(0, [expect.objectContaining({
      completed: false,
      completedAt: null,
    })]);
  });

  // --- Test deleteTodo ---
  it('should delete a todo', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockList = { id: 'activeList123', name: 'Active List', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' };
    mockGetFullList.mockResolvedValue([mockList]);

    const existingTodo = { id: 'existingTodoId', text: 'Task', completed: false, createdAt: new Date().toISOString(), listId: 'activeList123', recurring: 'none' };
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [existingTodo]),
      toArray: vi.fn(() => [existingTodo]),
      findIndex: vi.fn(() => 0),
      get: vi.fn(() => existingTodo),
      push: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    });

    const { result } = renderHook(() => usePersistentTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.deleteTodo('existingTodoId', 'activeList123');

    expect(mockYDoc.transact).toHaveBeenCalled();
    expect(mockYDoc.getArray().delete).toHaveBeenCalledWith(0, 1);
  });

  // --- Test deleteList ---
  it('should delete a list and switch active list if deleted list was active', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockLists = [
      { id: 'list1', name: 'List 1', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' },
      { id: 'list2', name: 'List 2', color: 'green', createdAt: new Date().toISOString(), user_id: 'user123' },
    ];
    mockGetFullList.mockResolvedValue(mockLists);
    mockDelete.mockResolvedValue(undefined); // Mock PocketBase delete

    const { result } = renderHook(() => usePersistentTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Initially activeListId should be 'list1'
    expect(result.current.activeListId).toBe('list1');

    await result.current.deleteList('list1');

    expect(mockDelete).toHaveBeenCalledWith('list1');
    expect(result.current.todoLists.length).toBe(1);
    expect(result.current.todoLists[0].id).toBe('list2');
    expect(result.current.activeListId).toBe('list2'); // Should switch to 'list2'
    expect(YjsPocketbaseProvider.mock.results[0].value.destroy).toHaveBeenCalled(); // Destroy provider for deleted list
  });

  it('should delete a list and set activeListId to empty string if no other lists remain', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockLists = [
      { id: 'list1', name: 'List 1', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' },
    ];
    mockGetFullList.mockResolvedValue(mockLists);
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePersistentTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeListId).toBe('list1');

    await result.current.deleteList('list1');

    expect(mockDelete).toHaveBeenCalledWith('list1');
    expect(result.current.todoLists.length).toBe(0);
    expect(result.current.activeListId).toBe(''); // Should be empty
  });

  // --- Test updateList ---
  it('should update a list name and color', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockLists = [
      { id: 'list1', name: 'Old Name', color: 'oldColor', createdAt: new Date().toISOString(), user_id: 'user123' },
    ];
    mockGetFullList.mockResolvedValue(mockLists);
    mockUpdate.mockResolvedValue(undefined); // Mock PocketBase update

    const { result } = renderHook(() => usePersistentTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.updateList('list1', { name: 'New Name', color: 'newColor' });

    expect(mockUpdate).toHaveBeenCalledWith('list1', { name: 'New Name', color: 'newColor' });
    expect(result.current.todoLists[0].name).toBe('New Name');
    expect(result.current.todoLists[0].color).toBe('newColor');
  });

  // --- Test batchAddTodos ---
  it('should add multiple todos in a batch', async () => {
    const mockUser = { id: 'user123' };
    mockGetCurrentUser.mockReturnValue(mockUser);
    mockIsAuthenticated.mockReturnValue(true);
    const mockList = { id: 'activeList123', name: 'Active List', color: 'blue', createdAt: new Date().toISOString(), user_id: 'user123' };
    mockGetFullList.mockResolvedValue([mockList]);
    mockGenerateId.mockReturnValueOnce('todoId1').mockReturnValueOnce('todoId2');

    // Mock Y.Doc to return the new todos after they are added
    mockYDoc.getArray.mockReturnValue({
      toJSON: vi.fn(() => [
        { id: 'todoId1', text: 'Task 1', completed: false, createdAt: new Date().toISOString(), listId: 'activeList123', recurring: 'none' },
        { id: 'todoId2', text: 'Task 2', completed: false, createdAt: new Date().toISOString(), listId: 'activeList123', recurring: 'none' },
      ]),
      push: vi.fn(),
      toArray: vi.fn(() => [{ id: 'todoId1' }, { id: 'todoId2' }]),
      findIndex: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    });

    const { result } = renderHook(() => usePersistentTodoLists());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const todosToAdd = [
      { text: 'Task 1', listId: 'activeList123' },
      { text: 'Task 2', listId: 'activeList123' },
    ];
    await result.current.batchAddTodos(todosToAdd);

    expect(mockYDoc.transact).toHaveBeenCalled();
    expect(mockYDoc.getArray().push).toHaveBeenCalledWith([
      expect.objectContaining({ text: 'Task 1', id: 'todoId1' }),
      expect.objectContaining({ text: 'Task 2', id: 'todoId2' }),
    ]);
    await waitFor(() => {
      expect(result.current.todoLists[0].todos.length).toBe(2);
      expect(result.current.todoLists[0].todos[0].text).toBe('Task 1');
      expect(result.current.todoLists[0].todos[1].text).toBe('Task 2');
    });
  });
});
