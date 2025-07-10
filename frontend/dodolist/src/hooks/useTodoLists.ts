import { useState, useEffect, useCallback } from 'react';
import PocketBase from 'pocketbase';
import { PB_URL } from '@/config';
import { useYjsTodoList } from './useYjsTodoList';
import AuthService from '@/services/authService';

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

export function useTodoLists() {
  const [pb] = useState(() => new PocketBase(PB_URL));
  const [authService] = useState(() => new AuthService());
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Queue for PocketBase operations
  const [pocketBaseQueue, setPocketBaseQueue] = useState<(() => Promise<void>)[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Use the Yjs hook for the active list
  const {
    listData: activeListData,
    isConnected,
    addTodo: addTodoToYjs,
    toggleTodo: toggleTodoInYjs,
    updateTodo: updateTodoInYjs,
    deleteTodo: deleteTodoInYjs,
    updateListName: updateListNameInYjs,
  } = useYjsTodoList(activeListId);

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
      const timeoutId = setTimeout(processPocketBaseQueue, 1000); // Process after 1 second
      return () => clearTimeout(timeoutId);
    }
  }, [pocketBaseQueue.length, isProcessingQueue, authService, processPocketBaseQueue]);

  // Initialize Yjs document with PocketBase data when switching lists
  useEffect(() => {
    if (activeListId && activeListData !== null && updateListNameInYjs) {
      const currentList = todoLists.find(list => list.id === activeListId);
      if (currentList && currentList.name && !activeListData.name) {
        // Initialize Yjs document with the name from PocketBase if it's empty
        console.log(`Initializing Yjs document with name: ${currentList.name}`);
        updateListNameInYjs(currentList.name);
      }
    }
  }, [activeListId, activeListData, updateListNameInYjs, todoLists]);

  // Fetch all lists for the user on initial load
  const fetchLists = useCallback(async () => {
    if (!authService.isAuthenticated() || !authService.getCurrentUser()) {
      setLoading(false);
      return;
    }
    
    // Prevent multiple simultaneous requests
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
      
      const records = await freshPb.collection('task_lists').getFullList<TodoList>({
        filter: `user_id = "${userId}"`,
        sort: 'createdAt',
        requestKey: null, // Disable auto-cancellation for this request
      });
      
      setTodoLists(records);
      
      // Only set active list if we don't have one already
      if (records.length > 0 && !activeListId) {
        setActiveListId(records[0].id);
      }
      
      console.log(`Successfully fetched ${records.length} lists from PocketBase`);
      
      setIsInitialized(true);
    } catch (err: any) {
      // Don't set error for auto-cancelled requests
      if (err.status !== 0) {
        setError(err);
        console.error("Failed to fetch lists:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [pb, authService, activeListId, loading, isInitialized]);

  useEffect(() => {
    // Only fetch once when the component mounts or auth state changes
    if (!isInitialized) {
      fetchLists();
    }
  }, [fetchLists, isInitialized]);

  // --- List Management (via PocketBase REST API) ---

  const createNewList = async (name: string, color: string) => {
    const userId = authService.getCurrentUser()?.id;
    if (!userId) throw new Error("User not authenticated");

    // Generate a unique ID for the new list
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create the list locally first (optimistic update)
    const newList: TodoList = {
      id: newId,
      user_id: userId,
      name: name,
      color: color,
      createdAt: now,
      pinned: false,
      archived: false,
      deleted: false,
    };

    // Update local state immediately
    setTodoLists(prev => [newList, ...prev]);
    setActiveListId(newId);

    // Queue sync to PocketBase in the background (will be handled by the sync queue)
    queuePocketBaseOperation(async () => {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      
      const data = {
        id: newId, // Use our generated ID to ensure consistency
        user_id: userId,
        name: name,
        color: color,
        createdAt: now,
        pinned: false,
        archived: false,
        deleted: false,
      };
      
      await freshPb.collection('task_lists').create<TodoList>(data, {
        requestKey: null, // Disable auto-cancellation
      });
      
      console.log(`Successfully synced new list ${newId} to PocketBase`);
    });

    return newId;
  };

  const deleteList = async (listId: string) => {
    // Update local state immediately (optimistic update)
    const remainingLists = todoLists.filter(list => list.id !== listId);
    setTodoLists(remainingLists);
    
    // Handle active list switching
    if (activeListId === listId) {
      if (remainingLists.length > 0) {
        setActiveListId(remainingLists[0].id);
      } else {
        // If all lists were deleted, create a new one locally
        setTodoLists([]);
        const newId = await createNewList("Default List", "bg-stone-400");
        setActiveListId(newId);
        return; // Early return since createNewList handles its own sync
      }
    }

    // Queue sync deletion to PocketBase in the background
    queuePocketBaseOperation(async () => {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      
      await freshPb.collection('task_lists').delete(listId, {
        requestKey: null, // Disable auto-cancellation
      });
      
      console.log(`Successfully synced list deletion ${listId} to PocketBase`);
    });
  };

  const updateList = async (listId: string, data: Partial<TodoList>) => {
    // Update local state immediately (optimistic update)
    setTodoLists(prev => prev.map(list => 
      list.id === listId ? { ...list, ...data } : list
    ));
    
    // Update Yjs document if name is being changed
    if (data.name && listId === activeListId) {
      updateListNameInYjs(data.name);
    }

    // Queue sync to PocketBase in the background
    queuePocketBaseOperation(async () => {
      const freshPb = new PocketBase(PB_URL);
      freshPb.authStore.save(pb.authStore.token, pb.authStore.model);
      
      await freshPb.collection('task_lists').update<TodoList>(listId, data, {
        requestKey: null, // Disable auto-cancellation
      });
      
      console.log(`Successfully synced list update ${listId} to PocketBase`);
    });
  };

  // Combine the fetched lists with the real-time data for the active list
  const listsWithTodos = todoLists.map(list => {
    if (list.id === activeListId && activeListData) {
      console.log(`[useTodoLists] Merging Yjs data for active list ${activeListId}:`, activeListData);
      return { 
        ...list, 
        todos: activeListData.todos || [],
        // Preserve the original list name if Yjs name is empty
        name: activeListData.name || list.name
      };
    }
    return { ...list, todos: [] }; // Default empty todos for non-active lists
  });

  return {
    todoLists: listsWithTodos,
    loading,
    error,
    activeListId,
    setActiveListId,
    createNewList,
    deleteList,
    updateList,
    addTodo: (text: string) => addTodoToYjs(text),
    toggleTodo: (todoId: string) => toggleTodoInYjs(todoId),
    updateTodo: (todoId: string, updates: any) => updateTodoInYjs(todoId, updates),
    deleteTodo: (todoId: string) => deleteTodoInYjs(todoId),
    isPocketBaseConnected: isConnected,
  };
}
