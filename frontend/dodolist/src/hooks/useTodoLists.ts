import type { Todo } from '@/lib/types';
import * as Y from 'yjs';
import PocketBase from 'pocketbase';
import { useState, useEffect, useCallback } from 'react';
import { PB_URL } from '@/config';
import AuthService from '@/services/authService';
import { GlobalPocketBaseProvider } from '@/services/yjsPocketBase';

// This interface should match your PocketBase collection schema
export interface TodoList {
  id: string;
  user_id: string;
  name: string;
  color: string;
  createdAt: string;
  pinned?: boolean;
  archived?: boolean;
  yjsUpdate?: string;
  deleted?: boolean;
}

// This interface extends TodoList to include the array of todos
export interface TodoListWithTodos extends TodoList {
  todos: Todo[];
}

// Helper function to convert a base64 string to a Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    console.error("Failed to decode base64 string:", error);
    return new Uint8Array();
  }
}

// Helper function to get todos from a yjsUpdate
const getTodosFromYjsUpdate = (yjsUpdate: string): Todo[] => {
  if (!yjsUpdate) return [];
  try {
    const doc = new Y.Doc();
    const update = base64ToUint8Array(yjsUpdate);
    if (update.length === 0) return [];
    Y.applyUpdate(doc, update);
    const ylist = doc.getMap('list');
    const ytodos = ylist.get('todos') as Y.Array<Y.Map<any>>;
    return ytodos ? ytodos.toArray().map(t => t.toJSON() as Todo) : [];
  } catch (error) {
    console.error("Failed to decode yjsUpdate:", error);
    return [];
  }
};

export function useTodoLists() {
  const [pb] = useState(() => new PocketBase(PB_URL));
  const [authService] = useState(() => new AuthService());
  const [todoLists, setTodoLists] = useState<TodoListWithTodos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Queue for PocketBase operations
  const [pocketBaseQueue, setPocketBaseQueue] = useState<(() => Promise<void>)[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Queue PocketBase operations for background processing
  const queuePocketBaseOperation = useCallback((operation: () => Promise<void>) => {
    setPocketBaseQueue(prev => [...prev, operation]);
  }, []);

  // Process PocketBase operations queue
  const processPocketBaseQueue = useCallback(async () => {
    if (isProcessingQueue || pocketBaseQueue.length === 0) {
      return;
    }

    setIsProcessingQueue(true);
    
    const currentQueue = [...pocketBaseQueue];
    setPocketBaseQueue([]);

    for (const operation of currentQueue) {
      try {
        await operation();
      } catch (error) {
        console.error('PocketBase operation failed:', error);
        // Re-queue failed operations for retry
        setPocketBaseQueue(prev => [...prev, operation]);
      }
    }

    setIsProcessingQueue(false);
  }, [isProcessingQueue, pocketBaseQueue]);

  // Process queue periodically and when conditions change
  useEffect(() => {
    if (pocketBaseQueue.length > 0 && !isProcessingQueue && authService.isAuthenticated()) {
      processPocketBaseQueue();
    }
  }, [pocketBaseQueue.length, isProcessingQueue, authService, processPocketBaseQueue]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!pb || !authService.isAuthenticated()) return;

    const handleCreate = (record: TodoList) => {
      const newList = { ...record, todos: getTodosFromYjsUpdate(record.yjsUpdate || '') };
      setTodoLists(prevLists => {
        // Avoid adding a duplicate if the list already exists
        if (prevLists.some(list => list.id === record.id)) {
          return prevLists;
        }
        return [newList, ...prevLists];
      });
    };

    const handleUpdate = (record: TodoList) => {
      setTodoLists(prevLists => prevLists.map(list =>
        list.id === record.id
          ? { ...list, ...record, todos: getTodosFromYjsUpdate(record.yjsUpdate || '') }
          : list
      ));
    };

    const handleDelete = (record: { id: string }) => {
      setTodoLists(prevLists => prevLists.filter(list => list.id !== record.id));
      setActiveListId(prevActiveId => prevActiveId === record.id ? null : prevActiveId);
    };

    const subscribe = async () => {
      try {
        await pb.collection('task_lists').subscribe('*', (e) => {
          const record = e.record as unknown as TodoList;
          if (e.action === 'create') {
            handleCreate(record);
          } else if (e.action === 'update') {
            handleUpdate(record);
          } else if (e.action === 'delete') {
            handleDelete(e.record as { id: string });
          }
        });
      } catch (error) {
        console.error("Failed to subscribe to real-time updates:", error);
      }
    };

    subscribe();

    return () => {
      pb.collection('task_lists').unsubscribe('*');
    };
  }, [pb, authService]);

  // Fetch all lists for the user on initial load
  const fetchLists = useCallback(async () => {
    if (!authService.isAuthenticated() || !authService.getCurrentUser()) {
      setLoading(false);
      return;
    }
    
    if (loading && isInitialized) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const userId = authService.getCurrentUser()?.id;
      if (!userId) {
        throw new Error("No user ID available");
      }
      
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      
      const records = await freshPb.collection('task_lists').getFullList<TodoList>({filter: `user_id = "${userId}"`,sort: 'createdAt',requestKey: null});
      
      const listsWithTodos: TodoListWithTodos[] = records.map(list => ({
        ...list,
        todos: getTodosFromYjsUpdate(list.yjsUpdate || ''),
      }));

      setTodoLists(listsWithTodos);
      
      if (listsWithTodos.length > 0 && !activeListId) {
        setActiveListId(listsWithTodos[0].id);
      }
      
      console.log(`Successfully fetched ${listsWithTodos.length} lists from PocketBase`);
      
      setIsInitialized(true);
    } catch (err: any) {
      if (err.status !== 0) {
        setError(err);
        console.error("Failed to fetch lists:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [pb, authService, activeListId, loading, isInitialized]);

  useEffect(() => {
    if (!isInitialized) {
      fetchLists();
    }
  }, [fetchLists, isInitialized]);

  // --- List Management (via PocketBase REST API) ---

  const createNewList = useCallback((name: string, color: string) => {
    const userId = authService.getCurrentUser()?.id;
    if (!userId) throw new Error("User not authenticated");

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    // --- Yjs metadata initialization (local-first) ---
    try {
      const yjsProvider = GlobalPocketBaseProvider.getInstance().getDocumentProvider(newId);
      const ylist = yjsProvider.doc.getMap('list');
      if (!ylist.has('name')) ylist.set('name', new Y.Text());
      if (!ylist.has('color')) ylist.set('color', new Y.Text());
      (ylist.get('name') as Y.Text).delete(0, (ylist.get('name') as Y.Text).length);
      (ylist.get('name') as Y.Text).insert(0, name);
      (ylist.get('color') as Y.Text).delete(0, (ylist.get('color') as Y.Text).length);
      (ylist.get('color') as Y.Text).insert(0, color);
      ylist.set('pinned', false);
      ylist.set('archived', false);
      ylist.set('deleted', false);
      if (!ylist.has('todos')) ylist.set('todos', new Y.Array());
    } catch (e) {
      console.error('[createNewList] Failed to initialize Yjs metadata for new list', e);
    }
    // --- End Yjs metadata initialization ---

    // Add to local UI state (Yjs is source of truth for metadata)
    const newList: TodoListWithTodos = {
      id: newId,
      user_id: userId,
      name: name, // Will be replaced by Yjs state in UI
      color: color, // Will be replaced by Yjs state in UI
      createdAt: now,
      pinned: false,
      archived: false,
      deleted: false,
      todos: [],
    };
    setTodoLists(prev => [newList, ...prev]);
    setActiveListId(newId);

    // Do NOT create the PocketBase record here. The Yjs provider will sync/upload when online.
    // This is now a local-first, Yjs-centric approach.

    return newId;
  }, [authService]);

  const deleteList = useCallback((listId: string) => {
    // Soft-delete via Yjs. The provider will sync this change.
    const yjsProvider = GlobalPocketBaseProvider.getInstance().getDocumentProvider(listId);
    const ylist = yjsProvider.doc.getMap('list');
    ylist.set('deleted', true);

    // Update UI immediately
    const remainingLists = todoLists.filter(list => list.id !== listId);
    setTodoLists(remainingLists);

    if (activeListId === listId) {
      if (remainingLists.length > 0) {
        setActiveListId(remainingLists[0].id);
      } else {
        // Create a new list if the last one was deleted
        const newId = createNewList("Default List", "bg-stone-400");
        setActiveListId(newId);
      }
    }
  }, [todoLists, activeListId, createNewList]);

  const updateList = useCallback(async (listId: string, data: Partial<TodoList>) => {
    // If the update is for metadata fields, warn and encourage using Yjs instead
    const metaFields = ["name", "color", "pinned", "archived", "deleted"];
    if (Object.keys(data).some(key => metaFields.includes(key))) {
      console.warn("[useTodoLists] updateList called for metadata fields. Use updateListMetadata from useYjsTodoList instead for offline/online sync.");
      // Do not update local state for metadata fields
      queuePocketBaseOperation(async () => {
        const freshPb = new PocketBase(PB_URL);
        freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
        await freshPb.collection('task_lists').update<TodoList>(listId, data, { requestKey: null });
        console.log(`Successfully synced list update ${listId} to PocketBase`);
      });
      return;
    }
    // Only update local state for non-metadata fields
    setTodoLists(prev => prev.map(list => 
      list.id === listId ? { ...list, ...data } : list
    ) as TodoListWithTodos[]);
    queuePocketBaseOperation(async () => {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      await freshPb.collection('task_lists').update<TodoList>(listId, data, { requestKey: null });
      console.log(`Successfully synced list update ${listId} to PocketBase`);
    });
  }, [queuePocketBaseOperation, pb.authStore.token, pb.authStore.model]);

  const cloneList = useCallback((listId: string) => {
    const listToClone = todoLists.find(list => list.id === listId);
    if (!listToClone) {
      throw new Error("List not found");
    }

    const newName = `${listToClone.name} (Copy)`;
    const newId = createNewList(newName, listToClone.color);

    // The yjsUpdate is a base64 string. We can just copy it.
    const yjsUpdate = listToClone.yjsUpdate;

    if (yjsUpdate) {
      // Update the newly created list with the cloned yjsUpdate
      queuePocketBaseOperation(async () => {
        const freshPb = new PocketBase(PB_URL);
        freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
        await freshPb.collection('task_lists').update(newId, { yjsUpdate });
        console.log(`Successfully synced cloned list data ${newId} to PocketBase`);
      });


      // Also update the local state immediately for better UX
      const yjsData = getTodosFromYjsUpdate(yjsUpdate);
      setTodoLists(prev => prev.map(list =>
        list.id === newId
          ? { ...list, yjsUpdate, ...yjsData }
          : list
      ));
    }

    return newId;
  }, [todoLists, createNewList, queuePocketBaseOperation, pb.authStore.token, pb.authStore.model]);

  return {
    todoLists,
    loading,
    error,
    activeListId,
    setActiveListId,
    createNewList,
    deleteList,
    updateList,
    cloneList,
  };
}
