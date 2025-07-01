import { useState, useEffect, useCallback, useRef } from 'react';
import AuthService from './authService';
import * as Y from 'yjs';
import { YjsPocketbaseProvider } from '@/services/YjsPocketbaseProvider';
import { generateId, uint8ArrayToBase64, base64ToUint8Array } from '@/lib/utils';
import PocketBaseRealtimeManager, { ConnectionStatus } from '@/services/PocketBaseRealtimeManager';
import { ClientResponseError } from 'pocketbase';
import PocketBase from 'pocketbase';

// Initialize PocketBase and AuthService
const pb = new PocketBase(import.meta.env.VITE_API_URL || '');
const pbRealtimeManager = new PocketBaseRealtimeManager(pb);
const authService = new AuthService();

// --- Helper functions for storing list IDs and pending deletions ---
const LIST_IDS_KEY = 'yjs-list-ids';
const PENDING_DELETIONS_KEY = 'yjs-pending-deletions';

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

const getPendingDeletions = (): string[] => getStoredStringArray(PENDING_DELETIONS_KEY);

const addPendingDeletion = (id: string) => {
    const deletions = new Set(getPendingDeletions());
    deletions.add(id);
    setStoredStringArray(PENDING_DELETIONS_KEY, Array.from(deletions));
};

const removePendingDeletions = (idsToRemove: string[]) => {
    const deletions = new Set(getPendingDeletions());
    idsToRemove.forEach(id => deletions.delete(id));
    setStoredStringArray(PENDING_DELETIONS_KEY, Array.from(deletions));
};


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

  // Effect to manage PocketBase connection status - SIMPLIFIED
  useEffect(() => {
    console.log('[todoService] Setting up connection status subscription...');
    
    const subscription = pbRealtimeManager.connectionStatus$.subscribe(status => {
      const wasConnected = isPocketBaseConnectedRef.current;
      const isNowConnected = status === 'connected';
      
      console.log(`[todoService] Connection status update:`);
      console.log(`  - Previous: ${wasConnected}`);
      console.log(`  - New: ${isNowConnected}`);
      console.log(`  - Raw status: ${status}`);
      
      setIsPocketBaseConnected(isNowConnected);
      isPocketBaseConnectedRef.current = isNowConnected;
      setConnectionDebug(`${status} at ${new Date().toLocaleTimeString()}`);
      
      // Trigger sync immediately if we just connected
      if (!wasConnected && isNowConnected) {
        console.log('[todoService] Just connected! Triggering immediate sync...');
        setTimeout(() => {
          performSync('connection_established');
        }, 100);
      }
    });

    // Get initial status
    const initialStatus = pbRealtimeManager.getCurrentStatus ? pbRealtimeManager.getCurrentStatus() : 'unknown';
    console.log(`[todoService] Initial connection status: ${initialStatus}`);
    setIsPocketBaseConnected(initialStatus === 'connected');
    isPocketBaseConnectedRef.current = initialStatus === 'connected';
    
    return () => {
      console.log('[todoService] Cleaning up connection subscription');
      subscription.unsubscribe();
    };
  }, []); // Only run once on mount

  // --- Add: Effect to subscribe to PocketBase realtime events and trigger sync ---
  useEffect(() => {
    // Helper: check if event is newer than local
    function isEventNewerThanLocal(record: any): boolean {
      const doc = ydocs.current.get(record.id);
      if (!doc) return true;
      const metadata = doc.getMap('metadata').toJSON();
      // Prefer updatedAt, fallback to createdAt
      return !metadata.updatedAt || new Date(record.updatedAt) > new Date(metadata.updatedAt || metadata.createdAt || 0);
    }

    // Helper: sync a single list from PocketBase
    async function syncSingleList(listId: string) {
      try {
        const pbList = await pb.collection('task_lists').getOne(listId);
        let doc = ydocs.current.get(listId);
        let provider = providers.current.get(listId);

        if (!doc) {
          doc = new Y.Doc();
          ydocs.current.set(listId, doc);
        }
        if (!provider) {
          provider = new YjsPocketbaseProvider(listId, doc, pb);
          providers.current.set(listId, provider);
          attachDocUpdateListener(doc, listId);
        }

        if (pbList.yjsUpdate) {
          const remoteUpdate = base64ToUint8Array(pbList.yjsUpdate);
          Y.applyUpdate(doc, remoteUpdate, 'pocketbase');
        }
        if (isPocketBaseConnectedRef.current && !provider.isConnected()) {
          await provider.connect();
        }
      } catch (err) {
        console.error(`[todoService] Failed to sync list ${listId}:`, err);
      }
    }

    const handleRealtimeEvent = (e: any) => {
      const { action, record } = e;
      if (!record || !record.id) return;

      const localIds = getAllYjsDocKeys();
      const isLocal = localIds.includes(record.id);

      if (action === 'delete') {
        if (isLocal) {
          setTodoLists(lists => lists.filter(l => l.id !== record.id));
          providers.current.get(record.id)?.destroy();
          providers.current.delete(record.id);
          ydocs.current.delete(record.id);
          removeYjsDocKey(record.id);
          removePendingDeletions([record.id]);
        }
        return;
      }

      if (action === 'create' || action === 'update') {
        // Only sync if the event is newer than local
        if (!isLocal || isEventNewerThanLocal(record)) {
          syncSingleList(record.id);
        }
      }
    };

    pbRealtimeManager.subscribe('task_lists', handleRealtimeEvent);
    return () => {
      pbRealtimeManager.unsubscribe('task_lists');
    };
  }, []);

  const providers = useRef<Map<string, YjsPocketbaseProvider>>(new Map());
  const ydocs = useRef<Map<string, Y.Doc>>(new Map());
  const isSyncing = useRef(false);

  const attachDocUpdateListener = (doc: Y.Doc, listId: string) => {
    // Always update UI state when Yjs doc changes (local or remote)
    const updateHandler = () => {
      const yTodos = doc.getArray<any>('todos').toJSON();
      const todos = yTodos.map(yjsToTodo);
      const metadata = doc.getMap('metadata').toJSON();
      setTodoLists(currentLists => {
        // Update or insert the list in the UI state
        const idx = currentLists.findIndex(l => l.id === listId);
        const updatedList: TodoList = {
          id: listId,
          name: metadata.name || 'Unnamed List',
          color: metadata.color || '#000000',
          todos,
          createdAt: metadata.createdAt || new Date().toISOString(),
          pinned: !!metadata.pinned,
          archived: !!metadata.archived,
        };
        if (idx === -1) return [...currentLists, updatedList];
        const newLists = [...currentLists];
        newLists[idx] = updatedList;
        return newLists;
      });
    };
    doc.on('update', updateHandler);
  };

  // Simplified sync function - moved outside useCallback to avoid dependency issues
  const performSync = async (trigger: string = 'unknown') => {
    console.log(`[todoService] performSync called by: ${trigger}`);
    console.log(`[todoService] Current state: connected=${isPocketBaseConnectedRef.current}, syncing=${isSyncing.current}`);
    
    if (isSyncing.current) {
      console.log('[todoService] Already syncing, skipping');
      return;
    }
    
    if (!isPocketBaseConnectedRef.current) {
      console.log('[todoService] Not connected, skipping sync');
      return;
    }

    isSyncing.current = true;
    console.log('[todoService] Starting sync process...');

    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        console.log('[todoService] No current user, aborting sync');
        return;
      }

      console.log('[todoService] User found, proceeding with sync');

      // 1. Process pending deletions
      const pendingDeletions = getPendingDeletions();
      if (pendingDeletions.length > 0) {
        console.log(`[todoService] Processing ${pendingDeletions.length} pending deletions`);
        const successfullyDeleted: string[] = [];
        
        for (const listId of pendingDeletions) {
          try {
            await pb.collection('task_lists').delete(listId);
            successfullyDeleted.push(listId);
            console.log(`[todoService] Successfully deleted list ${listId} from server`);
          } catch (err) {
            if (err instanceof ClientResponseError && err.status === 404) {
              successfullyDeleted.push(listId); // Already deleted on server
              console.log(`[todoService] List ${listId} already deleted on server`);
            } else {
              console.error(`[todoService] Failed to delete list ${listId}:`, err);
            }
          }
        }
        
        if (successfullyDeleted.length > 0) {
          removePendingDeletions(successfullyDeleted);
          console.log(`[todoService] Removed ${successfullyDeleted.length} items from pending deletions`);
        }
      }

      // 2. Fetch all lists from server
      console.log('[todoService] Fetching lists from server...');
      const pbLists = await pb.collection('task_lists').getFullList({
        filter: `user_id = "${currentUser.id}"`,
        sort: '-createdAt',
      });
      console.log(`[todoService] Fetched ${pbLists.length} lists from server`);

      const serverIds = new Set(pbLists.map(l => l.id));
      const localIds = getAllYjsDocKeys();
      console.log(`[todoService] Local IDs: ${localIds.length}, Server IDs: ${serverIds.size}`);

      // 3. Process local-only lists (created offline)
      for (const listId of localIds) {
        if (!serverIds.has(listId)) {
          console.log(`[todoService] Found local-only list ${listId}. Syncing to server...`);
          const doc = ydocs.current.get(listId);
          if (!doc) {
            console.warn(`[todoService] No doc found for local list ${listId}`);
            continue;
          }

          const metadata = doc.getMap('metadata').toJSON();
          const yjsUpdate = Y.encodeStateAsUpdate(doc);
          const base64Update = uint8ArrayToBase64(yjsUpdate);

          try {
            const newRecord = await pb.collection('task_lists').create({
              id: listId,
              user_id: currentUser.id,
              createdAt: metadata.createdAt || new Date().toISOString(),
              name: metadata.name || 'Unnamed List',
              color: metadata.color || '#000000',
              pinned: metadata.pinned || false,
              archived: metadata.archived || false,
              yjsUpdate: base64Update,
            });
            pbLists.push(newRecord);
            serverIds.add(newRecord.id);
            console.log(`[todoService] Successfully created list ${listId} on server`);
          } catch (err) {
            console.error(`[todoService] Failed to create local-only list ${listId}:`, err);
          }
        }
      }

      // 4. Update stored IDs
      const allIds = Array.from(new Set([...localIds, ...Array.from(serverIds)]));
      setAllYjsDocKeys(allIds);
      console.log(`[todoService] Updated stored IDs to ${allIds.length} total`);

      // 5. Send accumulated local changes to server
      console.log('[todoService] Pushing local changes to server...');
      for (const [listId, doc] of ydocs.current.entries()) {
        if (getPendingDeletions().includes(listId)) continue;
        
        try {
          const updateToSend = Y.encodeStateAsUpdate(doc);
          if (updateToSend.byteLength > 0) {
            const base64Update = uint8ArrayToBase64(updateToSend);
            const metadata = doc.getMap('metadata').toJSON();
            
            await pb.collection('task_lists').update(listId, {
              yjsUpdate: base64Update,
              name: metadata.name,
              color: metadata.color,
              pinned: metadata.pinned,
              archived: metadata.archived,
            });
            console.log(`[todoService] Pushed changes for list ${listId}`);
          }
        } catch (err) {
          console.error(`[todoService] Failed to push changes for list ${listId}:`, err);
        }
      }

      // 6. Connect providers and pull remote changes
      console.log('[todoService] Connecting providers and pulling remote changes...');
      for (const listId of allIds) {
        if (getPendingDeletions().includes(listId)) continue;

        let doc = ydocs.current.get(listId);
        let provider = providers.current.get(listId);

        if (!doc) {
          doc = new Y.Doc();
          ydocs.current.set(listId, doc);
        }
        if (!provider) {
          provider = new YjsPocketbaseProvider(listId, doc, pb);
          providers.current.set(listId, provider);
          attachDocUpdateListener(doc, listId);
        }

        // Apply remote updates
        const pbListRecord = pbLists.find(l => l.id === listId);
        if (pbListRecord && pbListRecord.yjsUpdate) {
          const remoteUpdate = base64ToUint8Array(pbListRecord.yjsUpdate);
          Y.applyUpdate(doc, remoteUpdate, 'pocketbase');
          console.log(`[todoService] Applied remote update for list ${listId}`);
        }

        // Connect provider for real-time updates
        if (isPocketBaseConnected) {
          await provider.connect();
          console.log(`[todoService] Connected provider for list ${listId}`);
        }
      }

      console.log('[todoService] Sync completed successfully');
      
    } catch (err) {
      console.error('[todoService] Sync failed:', err);
      setError(err instanceof Error ? err : new Error('Sync failed'));
    } finally {
      isSyncing.current = false;
      console.log('[todoService] Sync process finished');
    }
  };

  // Manual sync trigger for testing
  const triggerManualSync = () => {
    console.log('[todoService] Manual sync triggered');
    performSync('manual_trigger');
  };

  // Effect to load initial data from local storage (IndexedDB) and set up Yjs docs
  useEffect(() => {
    const loadLocalData = async () => {
      const localIds = getAllYjsDocKeys();
      const loadedLists: TodoList[] = [];

      for (const listId of localIds) {
        let doc = ydocs.current.get(listId);
        let provider = providers.current.get(listId);

        if (!doc) {
          doc = new Y.Doc();
          ydocs.current.set(listId, doc);
        }
        if (!provider) {
          provider = new YjsPocketbaseProvider(listId, doc, pb);
          providers.current.set(listId, provider);
        }

        // Wait for IndexedDB persistence to sync before reading metadata
        await provider.persistence.whenSynced;

        // Attach listener to update React state when doc changes (e.g., loads from IndexedDB)
        attachDocUpdateListener(doc, listId);

        const metadata = doc.getMap('metadata').toJSON();
        const yTodos = doc.getArray<any>('todos').toJSON();

        console.log(`[todoService] Loaded local data for list ${listId}: Name='${metadata.name}', Color='${metadata.color}'`);

        loadedLists.push({
          id: listId,
          name: metadata.name || 'Unnamed List',
          color: metadata.color || '#000000',
          todos: yTodos.map(yjsToTodo),
          createdAt: metadata.createdAt || new Date().toISOString(),
          pinned: typeof metadata.pinned === 'boolean' ? metadata.pinned : false,
          archived: typeof metadata.archived === 'boolean' ? metadata.archived : false,
        });
      }
      setTodoLists(loadedLists);
      setLoading(false);
    };

    loadLocalData();
  }, []); // Run only once on mount

  // --- CRUD and batch functions (restored, correct Yjs usage) ---
  const createNewList = async (name: string, color: string): Promise<string> => {
    const user = authService.getCurrentUser();
    if (!name.trim() || !user) return '';

    const newId = generateId();
    const doc = new Y.Doc();
    const creationDate = new Date().toISOString();
    const trimmedName = name.trim();

    addYjsDocKey(newId);
    ydocs.current.set(newId, doc);

    // Instantiate YjsPocketbaseProvider immediately to ensure IndexedDB persistence is active
    const provider = new YjsPocketbaseProvider(newId, doc, pb);
    providers.current.set(newId, provider);

    // Initialize Y.Doc metadata
    doc.transact(() => {
      const metadataMap = doc.getMap('metadata');
      metadataMap.set('name', trimmedName);
      metadataMap.set('color', color);
      metadataMap.set('createdAt', creationDate);
      metadataMap.set('pinned', false);
      metadataMap.set('archived', false);
    });

    setTodoLists(current => [...current, {
        id: newId, name: trimmedName, color, todos: [],
        createdAt: new Date(creationDate), pinned: false, archived: false,
    }]);
    setActiveListId(newId);

    attachDocUpdateListener(doc, newId);

    console.log(`[todoService] List ${newId} created locally. Global sync will handle server update.`);

    return newId;
  };

  const updateList = async (listId: string, updates: Partial<Omit<TodoList, 'id' | 'todos'>>) => {
    const doc = ydocs.current.get(listId);
    if (!doc) return;

    doc.transact(() => {
      const metadataMap = doc.getMap('metadata');
      for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
          metadataMap.set(key, (updates as any)[key]);
        }
      }
    });
  };

  const deleteList = async (listId: string) => {
    const originalLists = todoLists;
    setTodoLists(current => current.filter(l => l.id !== listId));
    if (activeListId === listId) {
      const listIndex = originalLists.findIndex(l => l.id === listId);
      const nextList = originalLists[listIndex + 1] || originalLists[listIndex - 1];
      setActiveListId(nextList?.id || '');
    }

    providers.current.get(listId)?.destroy();
    providers.current.delete(listId);
    ydocs.current.delete(listId);
    removeYjsDocKey(listId);
    addPendingDeletion(listId);

    console.log(`[todoService] List ${listId} deleted locally. Global sync will handle server update.`);
  };

  const addTodo = (todoData: Partial<Todo> & { text: string; listId: string }) => {
    const doc = ydocs.current.get(todoData.listId);
    if (!doc || !todoData.text.trim()) return;

    const newTodo: Todo = {
      completed: false,
      createdAt: new Date(),
      recurring: 'none',
      ...todoData,
      text: todoData.text.trim(),
      id: generateId(),
    };

    // Convert the Todo to the right format with proper date handling
    const formattedTodo = todoToYjsFormat(newTodo);

    doc.transact(() => {
      doc.getArray('todos').push([formattedTodo]);
    });
  };

  const updateTodo = (todoId: string, listId: string, updates: Partial<Todo>) => {
    const doc = ydocs.current.get(listId);
    if (!doc) return;

    doc.transact(() => {
      const yTodos = doc.getArray<any>('todos');
      const arr = yTodos.toArray();
      const index = arr.findIndex((t: any) => t.id === todoId);
      if (index > -1) {
        const oldTodo = arr[index];
        // Create a complete Todo object with the updates
        const completeTodo = { ...oldTodo, ...updates } as Todo;
        // Use todoToYjsFormat to ensure dates are properly converted to strings
        const formattedTodo = todoToYjsFormat(completeTodo);
        yTodos.delete(index, 1);
        yTodos.insert(index, [formattedTodo]);
      }
    });
  };

  const toggleTodo = (todoId: string, listId: string) => {
    const doc = ydocs.current.get(listId);
    if (!doc) return;

    doc.transact(() => {
      const yTodos = doc.getArray<any>('todos');
      const arr = yTodos.toArray();
      const index = arr.findIndex((t: any) => t.id === todoId);
      if (index > -1) {
        const oldTodo = arr[index];
        const newCompleted = !oldTodo.completed;
        
        // Create complete Todo object with updated values
        const updatedTodoObject: Todo = {
          ...oldTodo,
          completed: newCompleted,
          completedAt: newCompleted ? new Date() : undefined
        } as Todo;
        
        // Format with proper date handling
        const formattedTodo = todoToYjsFormat(updatedTodoObject);
        
        yTodos.delete(index, 1);
        yTodos.insert(index, [formattedTodo]);
      }
    });
  };

  const deleteTodo = (todoId: string, listId: string) => {
    const doc = ydocs.current.get(listId);
    if (!doc) return;

    doc.transact(() => {
      const yTodos = doc.getArray<any>('todos');
      const arr = yTodos.toArray();
      const index = arr.findIndex((t: any) => t.id === todoId);
      if (index > -1) {
        yTodos.delete(index, 1);
      }
    });
  };

  const batchAddTodos = (todosData: (Partial<Todo> & { text: string; listId: string })[]) => {
    if (todosData.length === 0) return;
    const doc = ydocs.current.get(todosData[0].listId);
    if (!doc) return;

    const newTodos = todosData.map(data => {
      const todo: Todo = {
        completed: false,
        createdAt: new Date(),
        recurring: 'none',
        ...data,
        text: data.text.trim(),
        id: generateId(),
      };
      // Properly format each todo to ensure dates are stored correctly
      return todoToYjsFormat(todo);
    });

    doc.transact(() => {
        doc.getArray('todos').push(newTodos);
    });
  };

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
    
    // Debug helpers
    isPocketBaseConnected,
    connectionDebug,
    triggerManualSync,
    currentConnectionStatus: () => pbRealtimeManager.getCurrentStatus(),
  };
};
