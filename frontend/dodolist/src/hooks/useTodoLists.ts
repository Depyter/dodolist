import type { TodoListWithTodos } from '@/lib/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { GlobalPocketBaseProvider } from '@/services/yjsPocketBase';
import { getAllLocalYjsTodoLists, decodeYjsListDocFromMemory } from '@/lib/utils';

export function useTodoLists() {
  const [todoLists, setTodoLists] = useState<TodoListWithTodos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const yjsUnsubRefs = useRef<Record<string, () => void>>({});

  useEffect(() => {
    const provider = GlobalPocketBaseProvider.getInstance();

    // Helper to subscribe to Yjs updates for all lists
    const subscribeToAllYjsDocs = (lists: TodoListWithTodos[]) => {
      // Unsubscribe from previous
      Object.values(yjsUnsubRefs.current).forEach(unsub => unsub());
      yjsUnsubRefs.current = {};
      lists.forEach(list => {
        const ydoc = provider.getDocument(list.id);
        if (ydoc) {
          const handler = () => {
            // On any Yjs update, update this list in state
            const updated = decodeYjsListDocFromMemory(list.id);
            if (updated) {
              setTodoLists(prev => prev.map(l => l.id === list.id ? { ...updated, readOnly: provider.getReadOnlyStatus(list.id) } : l));
            }
          };
          ydoc.on('update', handler);
          yjsUnsubRefs.current[list.id] = () => ydoc.off('update', handler);
        }
      });
    };

    // Remove readOnlyStatus argument
    const handleListChange = (listId?: string) => {
      console.log(`[useTodoLists] List change detected for listId: ${listId}, updating state.`);
      try {
        if (listId) {
          // Update a single list
          const baseList = decodeYjsListDocFromMemory(listId);
          if (baseList) {
            // Always get readOnly from provider
            const updatedList = { ...baseList, readOnly: provider.getReadOnlyStatus(listId) };
            setTodoLists(prevLists => {
              const listExists = prevLists.some(l => l.id === listId);
              if (updatedList && !updatedList.deleted) {
                // If list exists, update it, otherwise add it
                return listExists 
                  ? prevLists.map(l => l.id === listId ? updatedList : l)
                  : [...prevLists, updatedList];
              } else {
                // If list is deleted or doesn't exist anymore, remove it
                return prevLists.filter(l => l.id !== listId);
              }
            });
            // Subscribe to Yjs updates for this list
            const listsNow = getAllLocalYjsTodoLists().filter(l => !l.deleted);
            subscribeToAllYjsDocs(listsNow);
          }
        } else {
          // Full refresh
          const lists = getAllLocalYjsTodoLists().filter(l => !l.deleted);
          // Always get readOnly from provider for all lists
          const listsWithReadOnly = lists.map(list => {
            return { ...list, readOnly: provider.getReadOnlyStatus(list.id) };
          });
          setTodoLists(listsWithReadOnly);
          subscribeToAllYjsDocs(listsWithReadOnly);

          setActiveListId(prevActiveListId => {
              const currentActiveList = listsWithReadOnly.find(l => l.id === prevActiveListId);
              if (!prevActiveListId || !currentActiveList) {
                  const nextList = listsWithReadOnly.find(l => !l.archived) || listsWithReadOnly[0];
                  return nextList ? nextList.id : null;
              }
              return prevActiveListId;
          });
        }
        setLoading(false);
      } catch (e: any) {
        console.error("[useTodoLists] Error handling list change:", e);
        setError(e);
        setLoading(false);
      }
    };

    // Initial load
    handleListChange();

    // Remove readOnlyStatus from listener
    const unsubscribe = provider.onDocumentListChange((listId) => handleListChange(listId));
    return () => {
      unsubscribe();
      // Unsubscribe from all Yjs doc listeners
      Object.values(yjsUnsubRefs.current).forEach(unsub => unsub());
      yjsUnsubRefs.current = {};
    };
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


