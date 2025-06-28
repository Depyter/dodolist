import { useState, useEffect, useCallback, useRef } from 'react';
import PocketBase, { ClientResponseError } from 'pocketbase';
import AuthService from './authService';
import { PB_URL } from '@/config';
import * as Y from 'yjs'
import { YjsPocketbaseProvider } from '@/services/YjsPocketbaseProvider';
import { generateId, uint8ArrayToBase64 } from '@/lib/utils';

// Initialize PocketBase and AuthService
const pb = new PocketBase(PB_URL);
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
  createdAt: string;
  pinned: boolean;
  archived: boolean;
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPocketBaseConnected, setIsPocketBaseConnected] = useState(false);

  const providers = useRef<Map<string, YjsPocketbaseProvider>>(new Map());
  const ydocs = useRef<Map<string, Y.Doc>>(new Map());
  const isSyncing = useRef(false);

  const checkPocketBaseConnectivity = useCallback(async () => {
    try {
      await pb.health.check();
      setIsPocketBaseConnected(true);
      // console.log("[todoService] PocketBase is reachable.");
    } catch (err) {
      setIsPocketBaseConnected(false);
      console.warn("[todoService] PocketBase is unreachable.", err);
    }
  }, []);

  const attachDocUpdateListener = (doc: Y.Doc, listId: string) => {
    const updateHandler = (yjsUpdate: Uint8Array, origin: any) => {
        // console.log(`[todoService] Y.Doc update detected for list ${listId}. Origin: ${origin}`);
        const yTodos = doc.getArray<any>('todos').toJSON();
        const todos = yTodos.map(yjsToTodo);
        const metadata = doc.getMap('metadata').toJSON();
        setTodoLists(currentLists => {
            const newLists = currentLists.map(l => {
                if (l.id === listId) {
                    return {
                        ...l,
                        todos: todos,
                        name: metadata.name || l.name,
                        color: metadata.color || l.color,
                        pinned: typeof metadata.pinned === 'boolean' ? metadata.pinned : l.pinned,
                        archived: typeof metadata.archived === 'boolean' ? metadata.archived : l.archived,
                    };
                }
                return l;
            });
            // console.log(`[todoService] setTodoLists called for list ${listId}. New state:`, newLists);
            return newLists;
        });
    };

    doc.on('update', updateHandler);
  };

  const synchronizeWithPocketBase = useCallback(async () => {
    if (isSyncing.current) {
        // console.log("[todoService] Sync check: Another sync is already in progress, skipping.");
        return;
    }
    if (!isPocketBaseConnected) {
        // console.log("[todoService] Sync check: PocketBase is not connected, skipping server sync.");
        return;
    }
    isSyncing.current = true;
    // console.log("[todoService] Starting synchronization with PocketBase.");

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
        // console.log("[todoService] No current user, skipping sync.");
        isSyncing.current = false;
        return;
    }

    try {
        // 1. Process pending deletions
        const pendingDeletions = getPendingDeletions();
        if (pendingDeletions.length > 0) {
            // console.log(`[todoService] Syncing ${pendingDeletions.length} pending deletions.`);
            const successfullyDeleted: string[] = [];
            for (const listId of pendingDeletions) {
                try {
                    await pb.collection('task_lists').delete(listId);
                    successfullyDeleted.push(listId);
                } catch (err) {
                    if (err instanceof ClientResponseError && err.status === 404) {
                        successfullyDeleted.push(listId); // Already deleted on server
                    } else {
                        console.error(`[todoService] Failed to sync deletion for list ${listId}:`, err);
                    }
                }
            }
            if (successfullyDeleted.length > 0) {
                removePendingDeletions(successfullyDeleted);
            }
        }

        // 2. Fetch all lists from server
        const pbLists = await pb.collection('task_lists').getFullList({
            filter: `user_id = "${currentUser.id}"`,
            sort: '-createdAt',
        });
        const serverIds = new Set(pbLists.map(l => l.id));
        const localIds = getAllYjsDocKeys();

        // 3. Process local-only lists (created offline)
        for (const listId of localIds) {
            if (!serverIds.has(listId)) {
                // console.log(`[todoService] Found local-only list ${listId}. Syncing to PocketBase.`);
                const doc = ydocs.current.get(listId);
                if (!doc) continue;

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
                    pbLists.push(newRecord); // Add to list for further processing
                    serverIds.add(newRecord.id);
                } catch (err) {
                    console.error(`[todoService] Failed to create local-only list ${listId} in PocketBase.`, err);
                }
            }
        }
        
        // 4. Synchronize all lists
        const allIds = Array.from(new Set([...localIds, ...serverIds]));
        setAllYjsDocKeys(allIds);

        for (const listId of allIds) {
            if (getPendingDeletions().includes(listId)) continue; // Skip if just marked for deletion

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

            if (!provider.isConnected()) {
                await provider.connect();
            }
        }

        // console.log("[todoService] Synchronization with PocketBase completed.");

        // 5. Send accumulated local changes to PocketBase for all managed lists
        // This ensures offline changes are pushed when connection is restored.
        for (const [listId, doc] of ydocs.current.entries()) {
            const provider = providers.current.get(listId);
            if (provider && provider.isConnected()) {
                try {
                    // Encode only the changes since the last synced state vector
                    const updateToSend = Y.encodeStateAsUpdate(doc);
                    if (updateToSend.byteLength > 0) { // Only send if there are actual changes
                        const base64Update = uint8ArrayToBase64(updateToSend);
                        await pb.collection('task_lists').update(listId, {
                            yjsUpdate: base64Update,
                        });
                        // console.log(`[todoService] Pushed accumulated changes for list: ${listId}`);
                    } else {
                        // console.log(`[todoService] No accumulated changes to push for list: ${listId}`);
                    }
                } catch (err) {
                    console.error(`[todoService] Failed to push accumulated changes for list ${listId}:`, err);
                }
            }
        }
    } catch (err) {
        console.error('[todoService] Failed to synchronize with PocketBase:', err);
        
    } finally {
        isSyncing.current = false;
    }
  }, [isPocketBaseConnected]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    console.log("[todoService] Starting to load initial data from IndexedDB.");

    try {
        const initialLists: TodoList[] = [];
        const allListIds = getAllYjsDocKeys();
        const pendingDeletions = new Set(getPendingDeletions());
        const validListIds = allListIds.filter(id => !pendingDeletions.has(id));

        for (const listId of validListIds) {
            let doc = ydocs.current.get(listId);
            if (!doc) {
                doc = new Y.Doc();
                ydocs.current.set(listId, doc);
            }

            let provider = providers.current.get(listId);
            if (!provider) {
                provider = new YjsPocketbaseProvider(listId, doc, pb);
                providers.current.set(listId, provider);
            }

            attachDocUpdateListener(doc, listId); // Attach listener here

            await provider.persistence.whenSynced;

            const yTodos = doc.getArray<any>('todos').toJSON();
            const todos = yTodos.map(yjsToTodo);
            const metadata = doc.getMap('metadata').toJSON();

            initialLists.push({
                id: listId,
                name: metadata.name || 'Unnamed List',
                color: metadata.color || '#000000',
                createdAt: metadata.createdAt || new Date().toISOString(),
                pinned: typeof metadata.pinned === 'boolean' ? metadata.pinned : false,
                archived: typeof metadata.archived === 'boolean' ? metadata.archived : false,
                todos: todos,
            });
        }

        setTodoLists(initialLists);
        console.log(`[todoService] Loaded ${initialLists.length} lists from IndexedDB.`);

        if (initialLists.length > 0 && !activeListId) {
            setActiveListId(initialLists[0].id);
        }

    } catch (err) {
        console.error('[todoService] Failed to load initial data from IndexedDB:', err);
        setError(err instanceof Error ? err : new Error('Failed to load data from local storage'));
    } finally {
        setLoading(false);
    }
  }, [activeListId]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log("[todoService] Network status: ONLINE");
      checkPocketBaseConnectivity();
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log("[todoService] Network status: OFFLINE");
      setIsPocketBaseConnected(false);
      // Disconnect all providers when going offline
      providers.current.forEach(provider => provider.disconnect());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const init = async () => {
        await loadInitialData();
        setIsOnline(navigator.onLine);
        if (navigator.onLine) {
            checkPocketBaseConnectivity();
        }
    };
    init();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadInitialData, checkPocketBaseConnectivity]);

  useEffect(() => {
    if (isPocketBaseConnected) {
        synchronizeWithPocketBase();
    }
  }, [isPocketBaseConnected, synchronizeWithPocketBase]);

  useEffect(() => {
    // Regular background sync when connected
    const syncIntervalId = setInterval(() => {
        if (isPocketBaseConnected) {
            console.log("[todoService] Performing periodic background sync.");
            synchronizeWithPocketBase();
        }
    }, 30000); // Sync every 30 seconds

    // Occasional check to restore connection if lost
    const reconnectIntervalId = setInterval(() => {
        if (isOnline && !isPocketBaseConnected) {
            console.log("[todoService] Attempting to reconnect to PocketBase...");
            checkPocketBaseConnectivity();
        }
    }, 10000); // Try to reconnect every 10 seconds

    return () => {
        clearInterval(syncIntervalId);
        clearInterval(reconnectIntervalId);
    };
  }, [isOnline, isPocketBaseConnected, checkPocketBaseConnectivity, synchronizeWithPocketBase]);

  const createNewList = async (name: string, color: string): Promise<string> => {
    const user = authService.getCurrentUser();
    if (!name.trim() || !user) return '';

    const newId = generateId();
    const doc = new Y.Doc();
    const creationDate = new Date().toISOString();
    const trimmedName = name.trim();

    addYjsDocKey(newId);
    ydocs.current.set(newId, doc);

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
        createdAt: creationDate, pinned: false, archived: false,
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

  const getActiveYDoc = () => ydocs.current.get(activeListId);

  const addTodo = useCallback((todoData: Partial<Todo> & { text: string; listId: string }) => {
    const doc = ydocs.current.get(todoData.listId);
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
  }, []);

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
