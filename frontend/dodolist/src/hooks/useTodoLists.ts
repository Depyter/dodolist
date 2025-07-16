import type { Todo } from '@/lib/types';
import * as Y from 'yjs';
import PocketBase from 'pocketbase';
import { useState, useEffect, useCallback, useRef } from 'react';
import { PB_URL } from '@/config';
import AuthService from '@/services/authService';

// This interface should match the simplified PocketBase collection schema
// Metadata (name, color, pinned, archived) is now stored in Yjs documents
export interface TodoList {
  id: string;
  user_id: string;
  createdAt: string;
  yjsUpdate?: string;
  deleted?: boolean;
}

// This interface extends TodoList to include the array of todos and computed metadata from Yjs
export interface TodoListWithTodos extends TodoList {
  todos: Todo[];
  // Computed metadata from Yjs documents
  name: string;
  color: string;
  pinned: boolean;
  archived: boolean;
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

// Helper function to get metadata from a yjsUpdate
const getMetadataFromYjsUpdate = (yjsUpdate: string): {
  name: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  deleted: boolean;
} => {
  const defaultMetadata = {
    name: 'Untitled List',
    color: 'bg-stone-400',
    pinned: false,
    archived: false,
    deleted: false
  };

  if (!yjsUpdate) return defaultMetadata;
  
  try {
    const doc = new Y.Doc();
    const update = base64ToUint8Array(yjsUpdate);
    if (update.length === 0) return defaultMetadata;
    Y.applyUpdate(doc, update);
    const ylist = doc.getMap('list');
    
    const yname = ylist.get('name') as Y.Text;
    const ycolor = ylist.get('color') as Y.Text;
    const ypinned = ylist.get('pinned') as Y.Map<boolean>;
    const yarchived = ylist.get('archived') as Y.Map<boolean>;
    const ydeleted = ylist.get('deleted') as Y.Map<boolean>;
    
    return {
      name: yname ? yname.toString() : defaultMetadata.name,
      color: ycolor ? ycolor.toString() : defaultMetadata.color,
      pinned: ypinned ? ypinned.get('value') ?? false : false,
      archived: yarchived ? yarchived.get('value') ?? false : false,
      deleted: ydeleted ? ydeleted.get('value') ?? false : false
    };
  } catch (error) {
    console.error("Failed to extract metadata from yjsUpdate:", error);
    return defaultMetadata;
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
  const subscribedRef = useRef(false);

  const fetchLists = useCallback(async () => {
    if (!authService.isAuthenticated() || !authService.getCurrentUser()) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const userId = authService.getCurrentUser()?.id;
      if (!userId) {
        throw new Error("No user ID available");
      }
      
      const records = await pb.collection('task_lists').getFullList<TodoList>({filter: `user_id = "${userId}"`,sort: 'createdAt',requestKey: null});
      
      const listsWithTodos: TodoListWithTodos[] = records.map(list => {
        const todos = getTodosFromYjsUpdate(list.yjsUpdate || '');
        const metadata = getMetadataFromYjsUpdate(list.yjsUpdate || '');
        return {
          ...list,
          todos,
          ...metadata
        };
      });

      setTodoLists(listsWithTodos);
      
      setActiveListId(prevActiveListId => {
        if (listsWithTodos.length > 0 && !prevActiveListId) {
          return listsWithTodos[0].id;
        }
        return prevActiveListId;
      });
      
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
  }, [pb, authService]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!isInitialized) {
      fetchLists();
    }
  }, [fetchLists, isInitialized]);

  // --- List Management (via PocketBase REST API) ---

  const createNewList = useCallback(async (name: string, color: string) => {
    const userId = authService.getCurrentUser()?.id;
    if (!userId) throw new Error("User not authenticated");

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newList: TodoListWithTodos = {
      id: newId,
      user_id: userId,
      createdAt: now,
      deleted: false,
      todos: [],
      name: name,
      color: color,
      pinned: false,
      archived: false,
    };

    setTodoLists(prev => [newList, ...prev]);
    setActiveListId(newId);

    try {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      const data = { 
        id: newId, 
        user_id: userId, 
        createdAt: now, 
        deleted: false 
      };
      await freshPb.collection('task_lists').create<TodoList>(data, { requestKey: null });
      console.log(`Successfully synced new list ${newId} to PocketBase`);
    } catch (error) {
      console.error("Failed to create new list:", error);
      // Optionally handle the error, e.g., by removing the optimistic update
    }

    return newId;
  }, [authService, pb.authStore.token, pb.authStore.model]);

  const deleteList = useCallback(async (listId: string) => {
    const remainingLists = todoLists.filter(list => list.id !== listId);
    setTodoLists(remainingLists);

    try {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      await freshPb.collection('task_lists').delete(listId, { requestKey: null });
      console.log(`Successfully synced list deletion ${listId} to PocketBase`);
    } catch (error) {
      console.error("Failed to delete list:", error);
      // Optionally handle the error, e.g., by restoring the deleted list
    }

    if (activeListId === listId) {
      if (remainingLists.length > 0) {
        setActiveListId(remainingLists[0].id);
      } else {
        const newId = await createNewList("Default List", "bg-stone-400");
        setActiveListId(newId);
      }
    }
  }, [todoLists, activeListId, createNewList, pb.authStore.token, pb.authStore.model]);

  const cloneList = useCallback(async (listId: string) => {
    const listToClone = todoLists.find(list => list.id === listId);
    if (!listToClone) {
      throw new Error("List not found");
    }

    const newName = `${listToClone.name} (Copy)`;
    const newId = await createNewList(newName, listToClone.color);

    const yjsUpdate = listToClone.yjsUpdate;

    if (yjsUpdate) {
      try {
        const freshPb = new PocketBase(PB_URL);
        freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
        await freshPb.collection('task_lists').update(newId, { yjsUpdate });
        console.log(`Successfully synced cloned list data ${newId} to PocketBase`);
      } catch (error) {
        console.error("Failed to clone list:", error);
      }

      const todos = getTodosFromYjsUpdate(yjsUpdate);
      const clonedMetadata = getMetadataFromYjsUpdate(yjsUpdate);
      
      setTodoLists(prev => prev.map(list =>
        list.id === newId
          ? { 
              ...list, 
              yjsUpdate, 
              todos,
              name: newName, // Override name for the clone
              color: clonedMetadata.color,
              pinned: false, // Reset pinned status for clone
              archived: false, // Reset archived status for clone
            }
          : list
      ));
    }

    return newId;
  }, [todoLists, createNewList, pb.authStore.token, pb.authStore.model]);

  return {
    todoLists,
    loading,
    error,
    activeListId,
    setActiveListId,
    createNewList,
    deleteList,
    cloneList,
  };
}
