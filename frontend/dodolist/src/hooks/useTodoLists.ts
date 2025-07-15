import type { Todo } from '@/lib/types';
import * as Y from 'yjs';
import PocketBase from 'pocketbase';
import { useState, useEffect, useCallback } from 'react';
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

  // Queue for PocketBase operations with retry tracking
  const [pocketBaseQueue, setPocketBaseQueue] = useState<Array<{operation: () => Promise<void>, retryCount: number}>>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Queue PocketBase operations for background processing
  const queuePocketBaseOperation = useCallback((operation: () => Promise<void>) => {
    // Only queue if we're online or if it's a critical operation
    if (!navigator.onLine) {
      console.warn('[useTodoLists] Offline - operation will be queued for when back online');
    }
    setPocketBaseQueue(prev => [...prev, { operation, retryCount: 0 }]);
  }, []);

  // Check if we're online and can reach PocketBase
  const isOnlineAndConnected = useCallback(() => {
    return navigator.onLine && authService.isAuthenticated();
  }, [authService]);

  // Check if an error is due to being offline or network issues
  const isNetworkError = useCallback((error: any): boolean => {
    // Check various indicators of network/offline errors
    if (!navigator.onLine) return true;
    if (error.status === 0) return true;
    if (error.code === 'NETWORK_ERROR') return true;
    if (error.name === 'TypeError' && error.message?.includes('fetch')) return true;
    if (error.message?.toLowerCase().includes('network')) return true;
    if (error.message?.toLowerCase().includes('failed to fetch')) return true;
    if (error.message?.toLowerCase().includes('connection')) return true;
    
    // PocketBase specific offline errors
    if (error.status === 500 && error.message?.includes('Something went wrong')) return true;
    
    return false;
  }, []);

  // Process PocketBase operations queue
  const processPocketBaseQueue = useCallback(async () => {
    if (isProcessingQueue || pocketBaseQueue.length === 0 || !isOnlineAndConnected()) {
      return;
    }

    setIsProcessingQueue(true);
    
    const currentQueue = [...pocketBaseQueue];
    setPocketBaseQueue([]);
    const failedOperations: Array<{operation: () => Promise<void>, retryCount: number}> = [];

    for (const queueItem of currentQueue) {
      try {
        await queueItem.operation();
        console.log('[useTodoLists] PocketBase operation completed successfully');
      } catch (error: any) {
        console.error('[useTodoLists] PocketBase operation failed:', error);
        
        const isNetworkIssue = isNetworkError(error);
        const maxRetries = 3;
        
        if (isNetworkIssue && queueItem.retryCount < maxRetries) {
          // Re-queue network errors up to max retries
          console.warn(`[useTodoLists] Network error detected, will retry (attempt ${queueItem.retryCount + 1}/${maxRetries})`);
          failedOperations.push({ 
            operation: queueItem.operation, 
            retryCount: queueItem.retryCount + 1 
          });
        } else if (!isNetworkIssue && queueItem.retryCount < maxRetries) {
          // Re-queue other errors up to max retries (but fewer retries)
          console.warn(`[useTodoLists] Operation error, will retry (attempt ${queueItem.retryCount + 1}/${maxRetries})`);
          failedOperations.push({ 
            operation: queueItem.operation, 
            retryCount: queueItem.retryCount + 1 
          });
        } else {
          // Max retries reached or unrecoverable error
          console.error(`[useTodoLists] Operation failed permanently after ${queueItem.retryCount} retries:`, error);
        }
      }
    }

    // Re-queue failed operations that should be retried
    if (failedOperations.length > 0) {
      setPocketBaseQueue(prev => [...prev, ...failedOperations]);
    }

    setIsProcessingQueue(false);
  }, [isProcessingQueue, pocketBaseQueue, isOnlineAndConnected, isNetworkError]);

  // Process queue periodically and when conditions change
  useEffect(() => {
    if (pocketBaseQueue.length > 0 && !isProcessingQueue && authService.isAuthenticated()) {
      // Add a small delay to prevent excessive processing
      const timeoutId = setTimeout(() => {
        processPocketBaseQueue();
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [pocketBaseQueue.length, isProcessingQueue, authService, processPocketBaseQueue]);

  // Listen for online/offline events to process queue when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      console.log('[useTodoLists] Back online, processing queued operations');
      
      // Clear the offline queue timeout if it exists
      const offlineTimeout = (window as any).__offlineQueueTimeout;
      if (offlineTimeout) {
        clearTimeout(offlineTimeout);
        delete (window as any).__offlineQueueTimeout;
      }
      
      if (pocketBaseQueue.length > 0 && !isProcessingQueue && authService.isAuthenticated()) {
        // Add a delay before processing to allow connection to stabilize
        setTimeout(() => {
          processPocketBaseQueue();
        }, 2000);
      }
    };

    const handleOffline = () => {
      console.log('[useTodoLists] Gone offline, operations will be queued');
      
      // Clear the queue if we've been offline for too long to prevent memory issues
      // This timeout will be cleared when we come back online
      const clearQueueTimeout = setTimeout(() => {
        console.warn('[useTodoLists] Clearing queue due to extended offline period');
        setPocketBaseQueue([]);
      }, 5 * 60 * 1000); // 5 minutes
      
      // Store timeout ID to clear it when online
      (window as any).__offlineQueueTimeout = clearQueueTimeout;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      // Clean up any pending offline timeout
      const offlineTimeout = (window as any).__offlineQueueTimeout;
      if (offlineTimeout) {
        clearTimeout(offlineTimeout);
        delete (window as any).__offlineQueueTimeout;
      }
    };
  }, [pocketBaseQueue.length, isProcessingQueue, authService, processPocketBaseQueue]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!pb || !authService.isAuthenticated()) return;

    const handleCreate = (record: TodoList) => {
      const todos = getTodosFromYjsUpdate(record.yjsUpdate || '');
      const metadata = getMetadataFromYjsUpdate(record.yjsUpdate || '');
      const newList: TodoListWithTodos = { 
        ...record, 
        todos, 
        ...metadata 
      };
      setTodoLists(prevLists => {
        // Avoid adding a duplicate if the list already exists
        if (prevLists.some(list => list.id === record.id)) {
          return prevLists;
        }
        return [newList, ...prevLists];
      });
    };

    const handleUpdate = (record: TodoList) => {
      setTodoLists(prevLists => prevLists.map(list => {
        if (list.id === record.id) {
          const todos = getTodosFromYjsUpdate(record.yjsUpdate || '');
          const metadata = getMetadataFromYjsUpdate(record.yjsUpdate || '');
          return { 
            ...list, 
            ...record, 
            todos, 
            ...metadata 
          };
        }
        return list;
      }));
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

  const createNewList = useCallback(async (name: string, color: string) => {
    const userId = authService.getCurrentUser()?.id;
    if (!userId) throw new Error("User not authenticated");

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create the initial list with metadata from Yjs default values
    const newList: TodoListWithTodos = {
      id: newId,
      user_id: userId,
      createdAt: now,
      deleted: false,
      todos: [],
      // Computed metadata (these will be stored in Yjs, not PocketBase)
      name: name,
      color: color,
      pinned: false,
      archived: false,
    };

    setTodoLists(prev => [newList, ...prev]);
    setActiveListId(newId);

    queuePocketBaseOperation(async () => {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      
      // Only create with essential fields - metadata will be in Yjs
      const data = { 
        id: newId, 
        user_id: userId, 
        createdAt: now, 
        deleted: false 
      };
      
      await freshPb.collection('task_lists').create<TodoList>(data, { requestKey: null });
      
      console.log(`Successfully synced new list ${newId} to PocketBase`);
    });

    // Initialize Yjs document with the provided metadata
    // This should be done by accessing the useYjsTodoList hook for this list
    // The initialization will happen automatically when the Yjs document is first accessed

    return newId;
  }, [authService, pb, queuePocketBaseOperation]);

  const deleteList = useCallback(async (listId: string) => {
    const remainingLists = todoLists.filter(list => list.id !== listId);
    setTodoLists(remainingLists);
    
    if (activeListId === listId) {
      if (remainingLists.length > 0) {
        setActiveListId(remainingLists[0].id);
      } else {
        const newId = await createNewList("Default List", "bg-stone-400");
        setActiveListId(newId);
        return;
      }
    }

    queuePocketBaseOperation(async () => {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      await freshPb.collection('task_lists').delete(listId, { requestKey: null });
      console.log(`Successfully synced list deletion ${listId} to PocketBase`);
    });
  }, [todoLists, activeListId, createNewList, queuePocketBaseOperation, pb.authStore]);

  // Legacy function removed - metadata updates now handled by Yjs
  // All list metadata operations (name, color, pinned, archived) should use useYjsTodoList hook functions

  const cloneList = useCallback(async (listId: string) => {
    const listToClone = todoLists.find(list => list.id === listId);
    if (!listToClone) {
      throw new Error("List not found");
    }

    const newName = `${listToClone.name} (Copy)`;
    const newId = await createNewList(newName, listToClone.color);

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
  }, [todoLists, createNewList, queuePocketBaseOperation, pb.authStore, getTodosFromYjsUpdate, getMetadataFromYjsUpdate]);

  // Function to update metadata for a specific list in local state
  // This is used to sync Yjs metadata changes to the local todoLists state
  const updateListMetadata = useCallback((listId: string, metadata: Partial<{
    name: string;
    color: string;
    pinned: boolean;
    archived: boolean;
    deleted: boolean;
  }>) => {
    setTodoLists(prevLists => prevLists.map(list => 
      list.id === listId ? { ...list, ...metadata } : list
    ));
  }, []);

  return {
    todoLists,
    loading,
    error,
    activeListId,
    setActiveListId,
    createNewList,
    deleteList,
    cloneList,
    updateListMetadata,
  };
}
