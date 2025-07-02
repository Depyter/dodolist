import { useState, useEffect, useRef } from 'react';
import AuthService from './authService';
import * as Y from 'yjs';
import { YjsPocketbaseProvider } from '@/services/YjsPocketbaseProvider';
import { generateId } from '@/lib/utils';
import PocketBaseRealtimeManager, { ConnectionStatus } from '@/services/PocketBaseRealtimeManager';
import PocketBase from 'pocketbase';
import { PB_URL } from '@/config';

// Initialize PocketBase and AuthService
const pb = new PocketBase(PB_URL);
const pbRealtimeManager = new PocketBaseRealtimeManager(pb);
const authService = new AuthService();

// --- Helper functions for storing list IDs ---
const LIST_IDS_KEY = 'yjs-list-ids';

const getStoredStringArray = (key: string): string[] => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(key);
    try {
        const items = stored ? JSON.parse(stored) : [];
        return Array.isArray(items) ? items.filter(item => typeof item === 'string') : [];
    } catch (e) {
        console.warn(`[todoService] Could not parse items from localStorage key: ${key}`, e);
        return [];
    }
};

const setStoredStringArray = (key: string, items: string[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(items))));
};

const getAllYjsDocKeys = (): string[] => getStoredStringArray(LIST_IDS_KEY);
const setAllYjsDocKeys = (ids: string[]) => setStoredStringArray(LIST_IDS_KEY, ids);

const addYjsDocKey = (id: string) => {
    const ids = new Set(getAllYjsDocKeys());
    ids.add(id);
    setAllYjsDocKeys(Array.from(ids));
};

const removeYjsDocKey = (id: string) => {
    const ids = new Set(getAllYjsDocKeys());
    ids.delete(id);
    setAllYjsDocKeys(Array.from(ids));
};

// --- Types ---
export interface Todo {
  id: string;
  text: string;
  description?: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  deadline?: Date;
  reminder?: Date;
  recurring: "none" | "daily" | "weekly" | "monthly";
  listId: string;
}

export interface TodoList {
  id: string;
  name: string;
  color: string;
  todos: Todo[];
  createdAt: Date;
  pinned: boolean;
  archived: boolean;
  deleted?: boolean;
}

// --- Helper Functions ---
const yjsToTodo = (yjsTodo: any): Todo => {
  const parseValidDate = (val: any): Date | undefined => {
    if (!val || val === 'null' || val === '') return undefined;
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  };
  return {
    ...yjsTodo,
    createdAt: parseValidDate(yjsTodo.createdAt)!,
    completedAt: parseValidDate(yjsTodo.completedAt),
    deadline: parseValidDate(yjsTodo.deadline),
    reminder: parseValidDate(yjsTodo.reminder),
  };
};

const todoToYjsFormat = (todo: Todo) => {
  // Helper to ensure we always store a valid ISO string or null
  const toISOStringOrNull = (val: any) => {
    if (!val || val === 'null' || val === '') return null;
    if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString();
    if (typeof val === 'string') {
      // Check if it's a valid ISO string
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  };
  return {
    ...todo,
    createdAt: todo.createdAt instanceof Date && !isNaN(todo.createdAt.getTime()) ? todo.createdAt.toISOString() : (typeof todo.createdAt === 'string' ? todo.createdAt : new Date().toISOString()),
    completedAt: toISOStringOrNull(todo.completedAt),
    deadline: toISOStringOrNull(todo.deadline),
    reminder: toISOStringOrNull(todo.reminder),
  };
};

// --- Main Hook ---
export const usePersistentTodoLists = () => {
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isPocketBaseConnected, setIsPocketBaseConnected] = useState(false);
  const isPocketBaseConnectedRef = useRef(false);

  // Add debugging state
  const [connectionDebug, setConnectionDebug] = useState<string>('initializing');

  const providers = useRef<Map<string, YjsPocketbaseProvider>>(new Map());
  const ydocs = useRef<Map<string, Y.Doc>>(new Map());
  const undoManagers = useRef<Map<string, Y.UndoManager>>(new Map());

  // Helper to set up Yjs document and providers for a list
  const setupList = (listId: string, initialData?: Partial<Omit<TodoList, 'todos'>> & { todos?: Todo[] }) => {
    // Skip if already set up
    if (ydocs.current.has(listId)) return;

    console.log(`[todoService] Setting up list: ${listId}`);
    const doc = new Y.Doc();
    ydocs.current.set(listId, doc);

    // Initialize with provided data if any
    if (initialData) {
      const metadata = doc.getMap('metadata');
      Object.entries(initialData).forEach(([key, value]) => {
        if (key !== 'todos' && value !== undefined) {
          metadata.set(key, value instanceof Date ? value.toISOString() : value);
        }
      });

      if (initialData.todos?.length) {
        const todosArray = doc.getArray('todos');
        todosArray.insert(0, initialData.todos.map(todoToYjsFormat));
      }
    }

    // Create a provider to handle persistence and sync
    const provider = new YjsPocketbaseProvider(listId, doc, pb);
    providers.current.set(listId, provider);

    // Create an undo manager for this document
    const undoManager = new Y.UndoManager([
      doc.getMap('metadata'),
      doc.getArray('todos')
    ]);
    undoManagers.current.set(listId, undoManager);

    // Set up a listener to update React state when the doc changes
    attachDocUpdateListener(doc, listId);

    // Add to local storage for persistence
    addYjsDocKey(listId);

    // Connect the provider if we're online
    if (isPocketBaseConnectedRef.current) {
      provider.connect();
    }
  };

  const attachDocUpdateListener = (doc: Y.Doc, listId: string) => {
    // Always update UI state when Yjs doc changes (local or remote)
    const updateState = () => {
      const metadata = doc.getMap('metadata').toJSON();
      const todos = doc.getArray<any>('todos').toJSON().map(yjsToTodo);
      
      const listData: TodoList = {
        id: listId,
        name: metadata.name as string || 'Unnamed List',
        color: metadata.color as string || '#000000',
        pinned: metadata.pinned as boolean || false,
        archived: metadata.archived as boolean || false,
        deleted: metadata.deleted as boolean || false,
        todos: todos,
        createdAt: new Date(metadata.createdAt as string || new Date().toISOString()),
      };

      // Handle soft delete (deleted or archived flag)
      if (metadata.deleted === true || listData.archived) {
        console.log(`[todoService] List ${listId} was ${metadata.deleted ? 'deleted' : 'archived'}. Cleaning up.`);
        setTodoLists(prev => prev.filter(l => l.id !== listId));
        
        // Clean up resources
        providers.current.get(listId)?.destroy();
        providers.current.delete(listId);
        ydocs.current.delete(listId);
        undoManagers.current.delete(listId);
        removeYjsDocKey(listId);

        // Update active list if needed
        if (activeListId === listId) {
          const remainingLists = getAllYjsDocKeys().filter(id => {
            const doc = ydocs.current.get(id);
            if (!doc) return false;
            const metadata = doc.getMap('metadata');
            return !metadata.get('archived') && metadata.get('deleted') !== true;
          });
          if (remainingLists.length > 0) {
            setActiveListId(remainingLists[0]);
          } else {
            setActiveListId('');
          }
        }
      } else {
        // Update or add the list in state
        setTodoLists(prevLists => {
          const existingListIndex = prevLists.findIndex(l => l.id === listId);
          if (existingListIndex > -1) {
            const newLists = [...prevLists];
            newLists[existingListIndex] = listData;
            return newLists;
          } else {
            return [...prevLists, listData];
          }
        });
      }
    };

    doc.on('update', updateState);
    // Run once to initialize
    updateState();
  };

  // Effect to manage PocketBase connection status
  useEffect(() => {
    console.log('[todoService] Setting up connection status subscription...');
    
    const subscription = pbRealtimeManager.connectionStatus$.subscribe((status: ConnectionStatus) => {
      const wasConnected = isPocketBaseConnectedRef.current;
      const isNowConnected = status === 'connected';
      
      console.log(`[todoService] Connection status changed: ${wasConnected} -> ${isNowConnected}`);
      
      setIsPocketBaseConnected(isNowConnected);
      isPocketBaseConnectedRef.current = isNowConnected;
      setConnectionDebug(`${status} at ${new Date().toLocaleTimeString()}`);
    });

    // Get initial status
    const initialStatus = pbRealtimeManager.getCurrentStatus();
    setIsPocketBaseConnected(initialStatus === 'connected');
    isPocketBaseConnectedRef.current = initialStatus === 'connected';
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Effect to connect/disconnect providers based on connection status
  useEffect(() => {
    if (isPocketBaseConnected) {
      console.log('[todoService] Connected to PocketBase, connecting providers and syncing lists');
      
      // Connect all providers to start syncing
      for (const [id, provider] of providers.current.entries()) {
        if (!provider.isConnected()) {
          console.log(`[todoService] Connecting provider for list: ${id}`);
          provider.connect();
        }
      }
      
      // Discover new lists from server
      syncFromServer();
      
      // Subscribe to realtime events for task_lists
      const setupRealtimeSubscription = async () => {
        try {
          await pbRealtimeManager.subscribe('task_lists', handleRealtimeListEvent);
          console.log('[todoService] Subscribed to global list events');
        } catch (err) {
          console.error('[todoService] Failed to subscribe to realtime events:', err);
          // This is non-critical - local functionality continues
        }
      };
      
      setupRealtimeSubscription();
      
      return () => {
        pbRealtimeManager.unsubscribe('task_lists').catch(err => {
          console.warn('[todoService] Error unsubscribing from task_lists:', err);
        });
      };
    } else {
      console.log('[todoService] Disconnected from PocketBase, disconnecting providers');
      
      // Disconnect all providers to prevent sync attempts while offline
      for (const [id, provider] of providers.current.entries()) {
        if (provider.isConnected()) {
          console.log(`[todoService] Disconnecting provider for list: ${id}`);
          provider.disconnect();
        }
      }
    }
  }, [isPocketBaseConnected]);

  // Effect to load initial data from local storage (IndexedDB)
  useEffect(() => {
    setLoading(true);
    
    try {
      const storedListIds = getAllYjsDocKeys();
      console.log(`[todoService] Loading ${storedListIds.length} lists from local storage`);
      
      // Set up each list from storage
      storedListIds.forEach(id => {
        setupList(id);
      });
      
      // Set active list if we have any and none is selected
      if (storedListIds.length > 0 && !activeListId) {
        setActiveListId(storedListIds[0]);
      }
    } catch (err) {
      console.error('[todoService] Error loading initial data:', err);
      setError(err instanceof Error ? err : new Error('Unknown error loading data'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Helper to handle realtime events for task_lists collection
  const handleRealtimeListEvent = (e: { action: string; record: any }) => {
    console.log('[todoService] Received realtime event:', e.action, e.record.id);
    
    // Ensure this event is for the current user
    const currentUser = authService.getCurrentUser();
    if (!currentUser || e.record.user_id !== currentUser.id) {
      return;
    }
    
    const { action, record } = e;
    
    switch (action) {
      case 'create':
        // New list created on another client
        if (!ydocs.current.has(record.id)) {
          console.log(`[todoService] New list created on another client: ${record.id}`);
          setupList(record.id);
        }
        break;
        
      case 'update':
        // List updated on another client - this is handled by the YjsPocketbaseProvider
        // If the list was archived, the doc update listener will handle cleanup
        break;
        
      case 'delete':
        // List hard-deleted on another client
        if (ydocs.current.has(record.id)) {
          console.log(`[todoService] List deleted on another client: ${record.id}`);
          
          // Clean up resources
          setTodoLists(prev => prev.filter(l => l.id !== record.id));
          providers.current.get(record.id)?.destroy();
          providers.current.delete(record.id);
          ydocs.current.delete(record.id);
          undoManagers.current.delete(record.id);
          removeYjsDocKey(record.id);
          
          // Update active list if needed
          if (activeListId === record.id) {
            const remainingLists = getAllYjsDocKeys();
            if (remainingLists.length > 0) {
              setActiveListId(remainingLists[0]);
            } else {
              setActiveListId('');
            }
          }
        }
        break;
    }
  };

  // Helper to sync lists from server - discovers new lists
  const syncFromServer = async () => {
    if (!isPocketBaseConnectedRef.current) {
      console.log('[todoService] Not connected, skipping server sync');
      return;
    }
    
    console.log('[todoService] Syncing lists from server');
    setLoading(true);
    
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        console.log('[todoService] No current user, skipping server sync');
        return;
      }
      
      // Fetch all lists from server
      const remoteLists = await pb.collection('task_lists').getFullList({
        filter: `user_id = "${currentUser.id}" && archived = false`,
        sort: '-created',
      });
      
      console.log(`[todoService] Found ${remoteLists.length} lists on server`);
      
      // Set up any lists that exist on server but not locally
      for (const list of remoteLists) {
        if (!ydocs.current.has(list.id)) {
          console.log(`[todoService] Setting up server list: ${list.id}`);
          setupList(list.id);
        }
      }
    } catch (err) {
      console.error('[todoService] Error syncing from server:', err);
      // Non-critical error - local functionality continues
    } finally {
      setLoading(false);
    }
  };

  // --- CRUD functions ---
  const createNewList = async (name: string, color: string): Promise<string> => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      throw new Error("User not authenticated");
    }
    
    const listId = generateId();
    console.log(`[todoService] Creating new list "${name}" with id ${listId}`);

    const initialData = {
      id: listId,
      name,
      color,
      createdAt: new Date(),
      pinned: false,
      archived: false,
      deleted: false,
      todos: [],
    };

    setupList(listId, initialData);
    setActiveListId(listId);
    
    return listId;
  };

  const updateList = async (listId: string, updates: Partial<Omit<TodoList, 'id' | 'todos'>>) => {
    const doc = ydocs.current.get(listId);
    if (doc) {
      const metadata = doc.getMap('metadata');
      Object.entries(updates).forEach(([key, value]) => {
        metadata.set(key, value instanceof Date ? value.toISOString() : value);
      });
    }
  };

  const deleteList = async (listId: string) => {
    console.log(`[todoService] Soft-deleting list: ${listId}`);
    const doc = ydocs.current.get(listId);
    if (doc) {
      // Set deleted flag to true - the doc update listener will handle cleanup
      doc.getMap('metadata').set('deleted', true);
    }
  };

  const addTodo = (todoData: Partial<Todo> & { text: string; listId: string }) => {
    const { listId } = todoData;
    const doc = ydocs.current.get(listId);
    if (doc) {
      const todosArray = doc.getArray<any>('todos');
      const newTodo: Todo = {
        id: generateId(),
        completed: false,
        recurring: 'none',
        createdAt: new Date(),
        ...todoData,
      };
      todosArray.insert(0, [todoToYjsFormat(newTodo)]);
    }
  };

  const updateTodo = (todoId: string, listId: string, updates: Partial<Todo>) => {
    const doc = ydocs.current.get(listId);
    if (doc) {
      const todosArray = doc.getArray<any>('todos');
      const todoIndex = todosArray.toArray().findIndex(t => t.get('id') === todoId);
      if (todoIndex > -1) {
        const todoMap = todosArray.get(todoIndex) as Y.Map<any>;
        doc.transact(() => {
          Object.entries(updates).forEach(([key, value]) => {
            if (key === 'id' || key === 'listId') return;
            const yjsValue = (value instanceof Date) ? value.toISOString() : value;
            todoMap.set(key, yjsValue);
          });
        });
      }
    }
  };

  const toggleTodo = (todoId: string, listId: string) => {
    const doc = ydocs.current.get(listId);
    if (doc) {
      const todosArray = doc.getArray<any>('todos');
      const todoIndex = todosArray.toArray().findIndex(t => t.get('id') === todoId);
      if (todoIndex > -1) {
        const todoMap = todosArray.get(todoIndex) as Y.Map<any>;
        const currentCompleted = todoMap.get('completed');
        todoMap.set('completed', !currentCompleted);
        todoMap.set('completedAt', !currentCompleted ? new Date().toISOString() : null);
      }
    }
  };

  const deleteTodo = (todoId: string, listId: string) => {
    const doc = ydocs.current.get(listId);
    if (doc) {
      const todosArray = doc.getArray<any>('todos');
      const todoIndex = todosArray.toArray().findIndex(t => t.get('id') === todoId);
      if (todoIndex > -1) {
        todosArray.delete(todoIndex, 1);
      }
    }
  };

  const batchAddTodos = (todosData: (Partial<Todo> & { text: string; listId: string })[]) => {
    // Group todos by list ID for efficient processing
    const todosByList = todosData.reduce((acc, todo) => {
      if (!acc[todo.listId]) acc[todo.listId] = [];
      acc[todo.listId].push(todo);
      return acc;
    }, {} as Record<string, typeof todosData>);

    // Process each list's todos in a single transaction
    Object.entries(todosByList).forEach(([listId, todos]) => {
      const doc = ydocs.current.get(listId);
      if (doc) {
        doc.transact(() => {
          const todosArray = doc.getArray<any>('todos');
          const newTodos = todos.map(todoData => ({
            id: generateId(),
            completed: false,
            recurring: 'none' as const,
            createdAt: new Date(),
            ...todoData,
          })).map(todo => todoToYjsFormat(todo as Todo));
          
          todosArray.insert(0, newTodos);
        });
      }
    });
  };

  const undo = (listId: string) => {
    const undoManager = undoManagers.current.get(listId);
    if (undoManager) {
      undoManager.undo();
    }
  };

  const redo = (listId: string) => {
    const undoManager = undoManagers.current.get(listId);
    if (undoManager) {
      undoManager.redo();
    }
  };

  // Manual sync trigger for debugging/testing
  const triggerManualSync = () => {
    console.log('[todoService] Manual sync triggered');
    syncFromServer();
  };

  return {
    todoLists: todoLists.filter(list => !list.archived && !(list as any).deleted),
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
    isPocketBaseConnected,
    connectionDebug,
    triggerManualSync,
    undo,
    redo,
    currentConnectionStatus: () => pbRealtimeManager.getCurrentStatus(),
  };
};
