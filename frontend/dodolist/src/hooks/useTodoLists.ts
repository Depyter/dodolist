import type { TodoListWithTodos } from '@/lib/types';
import { useState, useEffect, useCallback } from 'react';
import { GlobalPocketBaseProvider } from '@/services/yjsPocketBase';
import { getAllLocalYjsTodoLists } from '@/lib/utils';

export function useTodoLists() {
  const [todoLists, setTodoLists] = useState<TodoListWithTodos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);

  useEffect(() => {
    const provider = GlobalPocketBaseProvider.getInstance();

    const handleListChange = () => {
      console.log('[useTodoLists] List change detected, updating state.');
      try {
        const lists = getAllLocalYjsTodoLists();
        setTodoLists(lists);

        setActiveListId(prevActiveListId => {
            const currentActiveList = lists.find(l => l.id === prevActiveListId);
            // If there's no active list, or the active one was deleted/archived, find a new one.
            if (!prevActiveListId || (currentActiveList && (currentActiveList.deleted || currentActiveList.archived))) {
                const nextList = lists.find(l => !l.deleted && !l.archived) || lists.find(l => !l.deleted);
                if (nextList) {
                  return nextList.id;
                } else if (lists.length > 0) {
                  // Fallback to any list if all are archived/deleted
                  return lists[0].id;
                } else {
                  // No lists exist at all
                  return null;
                }
            }
            return prevActiveListId;
        });
        
        setLoading(false);
      } catch (e: any) {
        console.error("[useTodoLists] Error handling list change:", e);
        setError(e);
        setLoading(false);
      }
    };

    // Initial load
    handleListChange();

    const unsubscribe = provider.onDocumentListChange(handleListChange);
    return () => unsubscribe();
  }, []); // No dependency on activeListId, it's handled by functional update

  const createNewList = useCallback((name: string, color: string): string => {
    const provider = GlobalPocketBaseProvider.getInstance();
    const newId = provider.createNewList(name, color);
    setActiveListId(newId);
    return newId;
  }, []);

  const deleteList = useCallback((listId: string) => {
    const provider = GlobalPocketBaseProvider.getInstance();
    provider.deleteList(listId);
    // The UI will update reactively via the onDocumentListChange listener.
  }, []);

  const cloneList = useCallback((listId: string): string => {
    const provider = GlobalPocketBaseProvider.getInstance();
    const newId = provider.cloneList(listId);
    setActiveListId(newId);
    return newId;
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
  };
}


