import { useState, useEffect } from 'react';
import dbService from './dbService';
import PocketBase from 'pocketbase';
import AuthService from './authService';
import { PB_URL } from '@/config';
import * as Y from 'yjs';
import { YjsTodoListProvider } from './yjsProvider';

// Initialize PocketBase and AuthService
const pb = new PocketBase(PB_URL);
const authService = new AuthService();

// Helper: convert Todo for PocketBase
const todoToPbFormat = (todo: Todo) => {
  // For create, do not send id
  return {
    task_list_id: todo.listId,
    text: todo.text,
    description: todo.description || '',
    createdAt: todo.createdAt.toISOString(),
    completedAt: todo.completedAt ? todo.completedAt.toISOString() : null,
    deadline: todo.deadline ? todo.deadline.toISOString() : null,
    reminder: todo.reminder ? todo.reminder.toISOString() : null,
    completed: !!todo.completed,
  };
};
const pbToTodo = (pbTodo: any): Todo => ({
  id: pbTodo.id,
  text: pbTodo.text,
  description: pbTodo.description,
  completed: Boolean(pbTodo.completed),
  createdAt: new Date(pbTodo.createdAt),
  completedAt: pbTodo.completedAt ? new Date(pbTodo.completedAt) : undefined,
  deadline: pbTodo.deadline ? new Date(pbTodo.deadline) : undefined,
  reminder: pbTodo.reminder ? new Date(pbTodo.reminder) : undefined,
  recurring: pbTodo.recurring as "none" | "daily" | "weekly" | "monthly",
  listId: pbTodo.task_list_id,
});

const todoListToPbFormat = (list: TodoList, userId: string) => {
  // Only include fields allowed by PocketBase schema
  return {
    user_id: userId, // required
    name: list.name, // required
    color: typeof list.color === 'string' ? list.color : 'test', // always a string, fallback to 'test'
    createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : list.createdAt, // required, string
    pinned: !!list.pinned, // optional, boolean
    archived: !!list.archived, // optional, boolean
    // yjsUpdate: handled elsewhere if needed
  };
};
const pbToTodoList = (pbList: any, todos: Todo[] = []): TodoList => ({
  id: pbList.id,
  name: pbList.name,
  color: pbList.color,
  todos,
  createdAt: new Date(pbList.createdAt),
  pinned: Boolean(pbList.pinned),
  archived: Boolean(pbList.archived),
});

// Export interfaces to be used across the application
export interface Todo {
  id: string;
  text: string;
  description?: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  deadline?: Date;
  reminder?: Date;
  recurring?: "none" | "daily" | "weekly" | "monthly";
  listId: string;
}

export interface TodoList {
  id: string;
  name: string;
  color: string;
  todos: Todo[];
  createdAt: Date;
  pinned?: boolean;
  archived?: boolean;
}

export const usePersistentTodoLists = (isCollaborative: boolean) => {
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [loadedLists, setLoadedLists] = useState<Set<string>>(new Set());
  const user = authService.getCurrentUser();

  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<YjsTodoListProvider | null>(null);

  // --- Hybrid: Use PocketBase if authenticated, else fallback to local dbService ---
  const isOnline = !!user && pb.authStore.isValid;

  useEffect(() => {
    loadInitialLists();
  }, [user?.id, isOnline]);

  useEffect(() => {
    if (activeListId && !loadedLists.has(activeListId)) {
      loadTodosForList(activeListId);
    }
  }, [activeListId, loadedLists, isOnline]);

  useEffect(() => {
    if (isCollaborative && activeListId) {
      const doc = new Y.Doc();
      const yProvider = new YjsTodoListProvider(activeListId, doc, PB_URL);
      setYdoc(doc);
      setProvider(yProvider);

      // Bind Yjs doc to React state
      const yTodos = doc.getArray<any>('todos'); // Use any for Yjs data structure
      const updateReactState = () => {
        // Convert Yjs data to Todo interface, handling Date objects
        const todos: Todo[] = yTodos.toArray().map(yTodo => ({
          id: yTodo.id,
          text: yTodo.text,
          description: yTodo.description,
          completed: yTodo.completed,
          createdAt: new Date(yTodo.createdAt), // Convert string back to Date
          completedAt: yTodo.completedAt ? new Date(yTodo.completedAt) : undefined, // Convert string back to Date
          deadline: yTodo.deadline ? new Date(yTodo.deadline) : undefined, // Convert string back to Date
          reminder: yTodo.reminder ? new Date(yTodo.reminder) : undefined, // Convert string back to Date
          recurring: yTodo.recurring,
          listId: yTodo.listId,
        }));
        setTodoLists(current =>
          current.map(list => (list.id === activeListId ? { ...list, todos } : list))
        );
      };

      yTodos.observe(() => updateReactState());

      // Initial sync from Yjs doc
      updateReactState();

      return () => {
        // Cleanup Yjs provider and doc
        yProvider.destroy();
        setYdoc(null);
        setProvider(null);
      };
    } else if (ydoc || provider) {
      // Cleanup if switching away from collaborative mode or list
      provider?.destroy();
      ydoc?.destroy();
      setYdoc(null);
      setProvider(null);
    }
  }, [activeListId, isCollaborative, isOnline]); // Added isOnline dependency

  const loadTodosForList = async (listId: string) => {
    try {
      let todos: Todo[] = [];
      if (isOnline) {
        const pbTodos = await pb.collection('tasks').getFullList({
          filter: `task_list_id = "${listId}"`,
          sort: '-createdAt',
        });
        todos = pbTodos.map(pbToTodo);
      } else {
        const dbTodos = await dbService.getTodosForList(listId);
        todos = dbTodos.map((t: any) => ({ ...t, createdAt: new Date(t.createdAt) }));
      }
      setTodoLists(current =>
        current.map(list => (list.id === listId ? { ...list, todos } : list))
      );
      setLoadedLists(current => new Set(current).add(listId));
    } catch (err) {
      console.error(`Failed to load todos for list ${listId}:`, err);
    }
  };

  const loadInitialLists = async () => {
    try {
      setLoading(true);
      let lists: TodoList[] = [];
      if (isOnline && user) {
        const pbLists = await pb.collection('task_lists').getFullList({
          filter: `user_id = "${user.id}"`,
          sort: '-createdAt',
        });
        lists = pbLists.map(pbList => pbToTodoList(pbList, []));
      } else {
        await dbService.ready();
        const dbLists = await dbService.getAllLists();
        lists = dbLists.map((dbList: any) => ({ ...dbList, createdAt: new Date(dbList.createdAt), todos: [] }));
      }
      setTodoLists(lists);
      if (lists.length > 0) {
        setActiveListId(lists[0].id);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load todo lists:', err);
      setError(err instanceof Error ? err : new Error('Failed to load todo lists'));
    } finally {
      setLoading(false);
    }
  };

  const loadTodoLists = async () => {
    setLoadedLists(new Set());
    await loadInitialLists();
  };

  const addTodo = async (text: string, listId: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const newTodo: Todo = {
      id: Date.now().toString(), // Always generate an id
      text: text.trim(),
      completed: false,
      createdAt: now,
      recurring: 'none',
      listId,
    } as Todo;

    // 1. Always update Yjs doc if collaborative
    if (isCollaborative && ydoc) {
      const yTodos = ydoc.getArray<any>('todos');
      const yjsCompatibleTodo = {
        ...newTodo,
        createdAt: newTodo.createdAt.toISOString(),
        completedAt: newTodo.completedAt?.toISOString() || null,
        deadline: newTodo.deadline?.toISOString() || null,
        reminder: newTodo.reminder?.toISOString() || null,
      };
      yTodos.push([yjsCompatibleTodo]);
    }

    // 2. Always update local dbService
    await dbService.createTodo({
      ...newTodo,
      createdAt: newTodo.createdAt.toISOString(),
      completedAt: newTodo.completedAt ? newTodo.completedAt.toISOString() : undefined,
      deadline: newTodo.deadline ? newTodo.deadline.toISOString() : undefined,
      reminder: newTodo.reminder ? newTodo.reminder.toISOString() : undefined,
    });

    // 3. If online, update PocketBase
    if (isOnline) {
      try {
        const data = todoToPbFormat(newTodo);
        const created = await pb.collection('tasks').create(data);
        // Optionally update local dbService with PB id
        await dbService.updateTodo({
          ...newTodo,
          id: created.id,
          createdAt: newTodo.createdAt.toISOString(),
          completedAt: newTodo.completedAt ? newTodo.completedAt.toISOString() : undefined,
          deadline: newTodo.deadline ? newTodo.deadline.toISOString() : undefined,
          reminder: newTodo.reminder ? newTodo.reminder.toISOString() : undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add todo to PocketBase'));
      }
    }

    // 4. Optimistic UI update
    setTodoLists(current =>
      current.map(list =>
        list.id === listId ? { ...list, todos: [...list.todos, newTodo] } : list
      )
    );
  };

  const updateTodo = async (todoId: string, listId: string, updates: Partial<Todo>) => {
    const list = todoLists.find(l => l.id === listId);
    const oldTodo = list?.todos.find(t => t.id === todoId);
    if (!oldTodo) return;
    const updatedTodo: Todo = { ...oldTodo, ...updates };

    // 1. Always update Yjs doc if collaborative
    if (isCollaborative && ydoc) {
      const yTodos = ydoc.getArray<any>('todos');
      const index = yTodos.toArray().findIndex(t => t.id === todoId);
      if (index !== -1) {
        const yjsCompatibleUpdates: any = {};
        for (const key in updates) {
          const value = (updates as any)[key];
          yjsCompatibleUpdates[key] = value instanceof Date ? value.toISOString() : value;
        }
        const updatedYjsTodo = { ...yTodos.get(index), ...yjsCompatibleUpdates };
        yTodos.delete(index, 1);
        yTodos.insert(index, [updatedYjsTodo]);
      }
    }

    // 2. Always update local dbService
    await dbService.updateTodo({
      ...updatedTodo,
      createdAt: updatedTodo.createdAt.toISOString(),
      completedAt: updatedTodo.completedAt ? updatedTodo.completedAt.toISOString() : undefined,
      deadline: updatedTodo.deadline ? updatedTodo.deadline.toISOString() : undefined,
      reminder: updatedTodo.reminder ? updatedTodo.reminder.toISOString() : undefined,
    });

    // 3. If online, update PocketBase
    if (isOnline) {
      try {
        await pb.collection('tasks').update(todoId, updates);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update todo in PocketBase'));
      }
    }

    // 4. Optimistic UI update
    setTodoLists(current =>
      current.map(list =>
        list.id === listId
          ? { ...list, todos: list.todos.map(t => (t.id === todoId ? updatedTodo : t)) }
          : list
      )
    );
  };

  const deleteTodo = async (todoId: string, listId: string) => {
    // 1. Always update Yjs doc if collaborative
    if (isCollaborative && ydoc) {
      const yTodos = ydoc.getArray<any>('todos');
      const index = yTodos.toArray().findIndex(t => t.id === todoId);
      if (index !== -1) {
        yTodos.delete(index, 1);
      }
    }

    // 2. Always update local dbService
    await dbService.deleteTodo(todoId);

    // 3. If online, update PocketBase
    if (isOnline) {
      try {
        await pb.collection('tasks').delete(todoId);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete todo in PocketBase'));
      }
    }

    // 4. Optimistic UI update
    setTodoLists(current =>
      current.map(list =>
        list.id === listId ? { ...list, todos: list.todos.filter(t => t.id !== todoId) } : list
      )
    );
  };

  const toggleTodo = async (todoId: string, listId: string) => {
    const list = todoLists.find((list) => list.id === listId);
    const todo = list?.todos.find((todo) => todo.id === todoId);
    if (!todo) return;
    const updates = {
      completed: !todo.completed,
      completedAt: !todo.completed ? new Date() : undefined,
    };
    await updateTodo(todoId, listId, updates);
  };

  const deleteList = async (listId: string) => {
    try {
      if (isOnline) {
        await pb.collection('task_lists').delete(listId);
      } else {
        await dbService.deleteList(listId);
      }
      setTodoLists(current => current.filter(l => l.id !== listId));
      if (activeListId === listId) {
        const nextActiveList = todoLists.find(l => l.id !== listId);
        setActiveListId(nextActiveList?.id || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete list'));
    }
  };

  // Dual write for creating a new list
  const createNewList = async (name: string, color: string) => {
    if (!name.trim()) return;
    const now = new Date();
    let newListId = Date.now().toString();
    let pbCreatedId: string | undefined = undefined;
    const newList: TodoList = {
      id: newListId,
      name: name.trim(),
      color: color || 'test',
      todos: [],
      createdAt: now,
      pinned: false,
      archived: false,
    };
    // 1. Always update Yjs doc if collaborative (optional: sync list metadata)
    // 2. Always update local dbService
    await dbService.createList({
      ...newList,
      createdAt: now.toISOString(),
    });
    // 3. If online, update PocketBase and use PB id as canonical id
    if (isOnline && user) {
      try {
        // Only send allowed fields
        const data = todoListToPbFormat(newList, user.id);
        const created = await pb.collection('task_lists').create(data);
        pbCreatedId = created.id;
        // Update local/Yjs/dbService with PB id
        if (pbCreatedId !== newListId) {
          // Update dbService
          await dbService.updateList({
            ...newList,
            id: pbCreatedId,
            createdAt: now.toISOString(),
          });
          newListId = pbCreatedId;
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create list in PocketBase'));
      }
    }
    setTodoLists(current => [...current, { ...newList, id: newListId }]);
    setActiveListId(newListId);
  };

  // Dual write for updating a list
  const updateList = async (listId: string, updates: Partial<TodoList>) => {
    const list = todoLists.find(l => l.id === listId);
    if (!list) return;
    const updatedList: TodoList = { ...list, ...updates };
    // 1. Always update Yjs doc if collaborative (optional: sync list metadata)
    // 2. Always update local dbService
    await dbService.updateList({
      ...updatedList,
      createdAt: updatedList.createdAt.toISOString(),
    });
    // 3. If online, update PocketBase
    if (isOnline) {
      try {
        await pb.collection('task_lists').update(listId, updates);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update list in PocketBase'));
      }
    }
    setTodoLists(current => current.map(l => (l.id === listId ? updatedList : l)));
  };

  // Optionally: Listen for PocketBase realtime changes and update state (not shown here)

  return {
    todoLists,
    activeListId,
    setActiveListId,
    loading,
    error,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    createNewList,
    updateList,
    deleteList,
    loadTodoLists,
  };
};
