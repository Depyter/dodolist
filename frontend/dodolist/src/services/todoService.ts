import { useState, useEffect, useCallback, useRef } from 'react';
import { generateId } from './dbService';
import PocketBase, { ClientResponseError } from 'pocketbase';
import AuthService from './authService';
import { PB_URL } from '@/config';
import * as Y from 'yjs';
import { YjsPocketbaseProvider } from '@/services/YjsPocketbaseProvider';

// Initialize PocketBase and AuthService
const pb = new PocketBase(PB_URL);
const authService = new AuthService();

// --- Type Definitions ---
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
  createdAt: string;
  pinned?: boolean;
  archived?: boolean;
}

// --- Helper Functions ---
const yjsToTodo = (yjsTodo: any): Todo => ({
  ...yjsTodo,
  createdAt: new Date(yjsTodo.createdAt),
  completedAt: yjsTodo.completedAt ? new Date(yjsTodo.completedAt) : undefined,
  deadline: yjsTodo.deadline ? new Date(yjsTodo.deadline) : undefined,
  reminder: yjsTodo.reminder ? new Date(yjsTodo.reminder) : undefined,
});

const todoToYjsFormat = (todo: Todo) => ({
  ...todo,
  createdAt: todo.createdAt.toISOString(),
  completedAt: todo.completedAt?.toISOString() || null,
  deadline: todo.deadline?.toISOString() || null,
  reminder: todo.reminder?.toISOString() || null,
});

// --- Main Hook ---
export const usePersistentTodoLists = () => {
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine && authService.isAuthenticated());

  const providers = useRef<Map<string, YjsPocketbaseProvider>>(new Map());
  const ydocs = useRef<Map<string, Y.Doc>>(new Map());
  const isFetching = useRef(false); // New ref to prevent concurrent fetches

  // --- List Management (moved up for use in loadInitialData) ---
  // --- Core Data Loading and Syncing Logic ---
  const loadInitialData = useCallback(async () => {
    if (isFetching.current) {
      console.log("[todoService] loadInitialData already in progress, skipping.");
      return;
    }
    isFetching.current = true; // Set flag to true

    console.log("[todoService] loadInitialData called");
    setLoading(true);
    setError(null); // Clear any previous errors
    try {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            console.log("[todoService] No current user, stopping loadInitialData.");
            setLoading(false);
            return;
        }

        let pbLists: any[] = []; // Declare and initialize here
        try {
            pbLists = await pb.collection('task_lists').getFullList({
                filter: `user_id = "${currentUser.id}"`,
                sort: '-createdAt',
            });
            console.log(`[todoService] Fetched ${pbLists.length} lists from PocketBase.`);
        } catch (err: any) {
            if (err instanceof ClientResponseError && err.status === 400 && err.message.includes("Invalid filter")) {
                console.warn("[todoService] PocketBase returned 400 'Invalid filter'. Treating as empty lists.");
                pbLists = []; // Treat as empty list
            } else {
                // Re-throw other errors
                throw err;
            }
        }

        const loadedLists: TodoList[] = [];
        let initialActiveListId = '';

        if (pbLists.length === 0) {
            console.log("[todoService] No lists found for user. Attempting to create default list and task.");
            try {
                // Create a default list if none exist
                const defaultListName = "My First List";
                const defaultColor = "bg-blue-500";
                const newId = generateId();

                // Create the PocketBase record for the default list
                const pbRecord = await pb.collection('task_lists').create({
                    id: newId,
                    user_id: currentUser.id,
                    name: defaultListName,
                    color: defaultColor,
                    createdAt: new Date().toISOString(),
                    pinned: false,
                    archived: false,
                    yjsUpdate: null,
                });
                console.log(`[todoService] Successfully created default list record in PocketBase: ${defaultListName} (ID: ${newId})`);

                // Setup Yjs for the new list
                const doc = new Y.Doc();
                ydocs.current.set(newId, doc);
                const provider = new YjsPocketbaseProvider(newId, doc, pb);
                providers.current.set(newId, provider);
                await provider.connect(); // Connect the provider immediately

                // Add a default task to the new list's Y.Doc
                const defaultTaskText = "Welcome to Dodolist! Start by adding your first task.";
                doc.transact(() => {
                    doc.getArray('todos').push([todoToYjsFormat({
                        id: generateId(),
                        text: defaultTaskText,
                        completed: false,
                        createdAt: new Date(),
                        listId: newId,
                        recurring: 'none',
                    })]);
                });
                console.log(`[todoService] Added default task to Yjs doc for list ${newId}: "${defaultTaskText}"`);

                // Listen for Yjs doc changes to update React state for this new list
                doc.on('update', () => {
                    const yTodos = doc.getArray<any>('todos').toJSON();
                    const todos = yTodos.map(yjsToTodo);
                    setTodoLists(currentLists =>
                        currentLists.map(l => (l.id === newId ? { ...l, todos } : l))
                    );
                    console.log(`[todoService] Yjs doc updated for default list ${newId}. Current todos:`, todos);
                });

                // Get initial todos from Yjs doc (should now include the default task)
                const initialTodos = doc.getArray<any>('todos').toJSON().map(yjsToTodo);
                loadedLists.push({
                    id: pbRecord.id,
                    name: pbRecord.name,
                    color: pbRecord.color,
                    createdAt: pbRecord.createdAt,
                    pinned: pbRecord.pinned,
                    archived: pbRecord.archived,
                    todos: initialTodos,
                });
                initialActiveListId = newId;
                console.log(`[todoService] Default list and task prepared for UI. loadedLists count: ${loadedLists.length}`);

            } catch (createError) {
                console.error("[todoService] Error creating default list or task:", createError);
                setError(createError instanceof Error ? createError : new Error("Failed to create default list."));
            }

        } else {
            // Process existing lists
            console.log("[todoService] Existing lists found. Processing them.");
            for (const pbList of pbLists) {
                const doc = new Y.Doc();
                ydocs.current.set(pbList.id, doc);
                const provider = new YjsPocketbaseProvider(pbList.id, doc, pb);
                providers.current.set(pbList.id, provider);
                await provider.connect();

                doc.on('update', () => {
                    const yTodos = doc.getArray<any>('todos').toJSON();
                    const todos = yTodos.map(yjsToTodo);
                    setTodoLists(currentLists =>
                        currentLists.map(l => (l.id === pbList.id ? { ...l, todos } : l))
                    );
                });

                const initialTodos = doc.getArray<any>('todos').toJSON().map(yjsToTodo);
                loadedLists.push({
                    id: pbList.id,
                    name: pbList.name,
                    color: pbList.color,
                    createdAt: pbList.createdAt,
                    pinned: pbList.pinned,
                    archived: pbList.archived,
                    todos: initialTodos,
                });
            }
            if (loadedLists.length > 0) {
                initialActiveListId = loadedLists[0].id;
            }
        }

        setTodoLists(loadedLists);
        if (initialActiveListId && !activeListId) {
            setActiveListId(initialActiveListId);
        } else if (activeListId && !loadedLists.some(l => l.id === activeListId)) {
            // If the previously active list was deleted, set to the first available
            if (loadedLists.length > 0) {
                setActiveListId(loadedLists[0].id);
            } else {
                setActiveListId(''); // No lists left
            }
        }
        console.log("[todoService] loadInitialData completed.");

    } catch (err) {
        console.error('[todoService] Failed to load initial data:', err);
        setError(err instanceof Error ? err : new Error('Failed to load data'));
    } finally {
        setLoading(false);
        isFetching.current = false; // Reset flag after completion (success or error)
    }
  }, []);

  // --- List Management ---
  const createNewList = async (name: string, color: string): Promise<string> => {
    const user = authService.getCurrentUser();
    if (!name.trim() || !user) return '';

    const newId = generateId(); // Use your custom ID generator from dbService

    // 1. Create the list record in PocketBase first
    const pbRecord = await pb.collection('task_lists').create({
        id: newId,
        user_id: user.id, // Link to the current user
        name: name.trim(),
        color: color,
        createdAt: new Date().toISOString(),
        pinned: false,
        archived: false,
        yjsUpdate: null, // Initial empty Yjs state (will be updated by provider)
    });

    // 2. Setup Yjs for the new list
    const doc = new Y.Doc();
    ydocs.current.set(newId, doc);
    const provider = new YjsPocketbaseProvider(newId, doc, pb); // Use new provider
    providers.current.set(newId, provider);
    await provider.connect();

    // Listen for Yjs doc changes to update React state for this new list
    doc.on('update', () => {
        const yTodos = doc.getArray<any>('todos').toJSON();
        const todos = yTodos.map(yjsToTodo);
        setTodoLists(currentLists =>
            currentLists.map(l => (l.id === newId ? { ...l, todos } : l))
        );
    });

    // Add the new list to the local React state
    const tempList: TodoList = {
        id: newId,
        name: name.trim(),
        color,
        todos: [], // Initially empty, will be populated by Yjs
        createdAt: pbRecord.createdAt, // Use PocketBase's createdAt
        pinned: false,
        archived: false,
    };

    setTodoLists(current => [...current, tempList]);
    setActiveListId(newId);

    return newId;
  };

  useEffect(() => {
    loadInitialData();

    // Keep online/offline listeners if you want to manage UI state based on network
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        // Destroy all Yjs providers and their IndexedDB instances
        providers.current.forEach(p => p.destroy());
        providers.current.clear();
        ydocs.current.clear();
    };
  }, [loadInitialData]);

  const updateList = async (listId: string, updates: Partial<Omit<TodoList, 'id' | 'todos'>>) => {
    setTodoLists(current =>
      current.map(l => (l.id === listId ? { ...l, ...updates } : l))
    );
    // Update metadata in PocketBase
    await pb.collection('task_lists').update(listId, updates);
  };

  const deleteList = async (listId: string) => {
    setTodoLists(current => current.filter(l => l.id !== listId));
    if (activeListId === listId) {
      const nextList = todoLists.find(l => l.id !== listId);
      setActiveListId(nextList?.id || '');
    }
    // Delete from PocketBase
    await pb.collection('task_lists').delete(listId);
    
    // Destroy Yjs provider and its IndexedDB instance
    providers.current.get(listId)?.destroy();
    providers.current.delete(listId);
    ydocs.current.delete(listId);
  };

  // --- Todo Management (delegated to Yjs) ---
  const getActiveYDoc = () => ydocs.current.get(activeListId);

  const addTodo = useCallback((todoData: Partial<Todo> & { text: string; listId: string }) => {
    const doc = getActiveYDoc();
    if (!doc || !todoData.text.trim()) return;

    const newTodo: Todo = {
      id: generateId(),
      completed: false,
      createdAt: new Date(),
      recurring: 'none',
      ...todoData,
      text: todoData.text.trim(),
    };

    doc.transact(() => {
      doc.getArray('todos').push([todoToYjsFormat(newTodo)]);
    });
  }, [activeListId]);

  const updateTodo = useCallback((todoId: string, listId: string, updates: Partial<Todo>) => {
    const doc = ydocs.current.get(listId);
    if (!doc) return;

    doc.transact(() => {
      const yTodos = doc.getArray<any>('todos');
      const index = yTodos.toArray().findIndex(t => t.id === todoId);
      if (index > -1) {
        const oldTodo = yTodos.get(index);
        const updatedTodo = { ...oldTodo, ...updates };
        yTodos.delete(index, 1);
        yTodos.insert(index, [updatedTodo]);
      }
    });
  }, []);

  const toggleTodo = useCallback((todoId: string, listId: string) => {
    const doc = ydocs.current.get(listId);
    if (!doc) return;

    doc.transact(() => {
      const yTodos = doc.getArray<any>('todos');
      const index = yTodos.toArray().findIndex(t => t.id === todoId);
      if (index > -1) {
        const oldTodo = yTodos.get(index);
        const newCompleted = !oldTodo.completed;
        const updatedTodo = { 
            ...oldTodo, 
            completed: newCompleted,
            completedAt: newCompleted ? new Date().toISOString() : null
        };
        yTodos.delete(index, 1);
        yTodos.insert(index, [updatedTodo]);
      }
    });
  }, []);

  const deleteTodo = useCallback((todoId: string, listId: string) => {
    const doc = ydocs.current.get(listId);
    if (!doc) return;

    doc.transact(() => {
      const yTodos = doc.getArray<any>('todos');
      const index = yTodos.toArray().findIndex(t => t.id === todoId);
      if (index > -1) {
        yTodos.delete(index, 1);
      }
    });
  }, []);

  const batchAddTodos = useCallback((todosData: (Partial<Todo> & { text: string; listId: string })[]) => {
    if (todosData.length === 0) return;
    const doc = ydocs.current.get(todosData[0].listId);
    if (!doc) return;

    const newTodos = todosData.map(data => todoToYjsFormat({
        id: generateId(),
        completed: false,
        createdAt: new Date(),
        recurring: 'none',
        ...data,
        text: data.text.trim(),
    }));

    doc.transact(() => {
        doc.getArray('todos').push(newTodos);
    });
  }, []);

  const loadTodoLists = useCallback(() => {
    loadInitialData();
  }, [loadInitialData]);

  return {
    todoLists,
    activeListId,
    setActiveListId,
    loading,
    error,
    createNewList,
    updateList,
    deleteList,
    addTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    batchAddTodos,
  };
};


