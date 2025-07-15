import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { PocketBaseProvider, type SyncStatusInfo } from '@/services/yjsPocketBase';

// Define the structure of a Todo item within Yjs
export type YTodo = Y.Map<any>;

// Define the structure of the entire list document
export interface YListDoc {
    name: Y.Text;
    color: Y.Text;
    todos: Y.Array<YTodo>;
    // other metadata fields can be Y.Text, Y.Number etc.
}

export function useYjsTodoList(listId: string | null) {
    const [listData, setListData] = useState<{ name: string; color: string; todos: any[] }>({ name: '', color: '', todos: [] });
    const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>({
        status: 'offline',
        isConnected: false,
        queueLength: 0,
        isSyncing: false,
        lastSyncTime: null,
        hasError: false
    });
    
    const providerRef = useRef<PocketBaseProvider | null>(null);

    useEffect(() => {
        console.log(`[useYjsTodoList] Effect triggered for listId: ${listId}`);
        
        let isMounted = true;
        let doc: Y.Doc | null = null;
        let statusUnsubscribe: (() => void) | null = null;
        let updateState: (() => void) | null = null;

        const cleanup = () => {
            console.log(`[useYjsTodoList] Cleanup for listId: ${listId}`);
            if (statusUnsubscribe) {
                statusUnsubscribe();
            }
            if (doc && updateState) {
                doc.off('update', updateState);
            }
            if (providerRef.current) {
                // The global provider will manage the actual document lifecycle.
                // This just signals that this hook instance is no longer using it.
                providerRef.current.destroy();
                providerRef.current = null;
            }
        };

        if (!listId) {
            cleanup();
            setListData({ name: '', color: '', todos: [] });
            setSyncStatus({
                status: 'offline',
                isConnected: false,
                queueLength: 0,
                isSyncing: false,
                lastSyncTime: null,
                hasError: false
            });
            return;
        }

        const newProvider = new PocketBaseProvider(listId);
        providerRef.current = newProvider;
        
        doc = newProvider.doc;
        const ylist = doc.getMap('list') as Y.Map<any>;

        updateState = () => {
            if (!isMounted) return;
            
            try {
                const ytodos = ylist.get('todos') as Y.Array<YTodo>;
                const yname = ylist.get('name') as Y.Text;
                const ycolor = ylist.get('color') as Y.Text;

                if (!yname) ylist.set('name', new Y.Text());
                if (!ycolor) ylist.set('color', new Y.Text());
                if (!ytodos) ylist.set('todos', new Y.Array());

                const todos = ytodos ? ytodos.toArray().map(t => t.toJSON()) : [];
                
                const newListData = {
                    name: yname ? yname.toString() : '',
                    color: ycolor ? ycolor.toString() : '',
                    todos,
                };
                
                setListData(newListData);
            } catch (error) {
                console.error('[useYjsTodoList] Error in updateState:', error);
            }
        };

        updateState();

        doc.on('update', updateState);
        
        statusUnsubscribe = newProvider.onStatusChange((status) => {
            if (isMounted) {
                setSyncStatus(status);
            }
        });

        return () => {
            isMounted = false;
            cleanup();
        };
    }, [listId]);
    
    const addTodo = useCallback((text: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        
        if (!ylist.has('todos')) {
            ylist.set('todos', new Y.Array());
        }
        
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        
        const newTodo = new Y.Map();
        newTodo.set('id', crypto.randomUUID());
        newTodo.set('text', text);
        newTodo.set('completed', false);
        newTodo.set('createdAt', new Date().toISOString());

        providerRef.current.doc.transact(() => {
            ytodos.push([newTodo]);
        });
    }, []);

    const toggleTodo = useCallback((todoId: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!ytodos) return;
        
        const todo = ytodos.toArray().find(t => t.get('id') === todoId);
        if (todo) {
            providerRef.current.doc.transact(() => {
                todo.set('completed', !todo.get('completed'));
            });
        }
    }, []);

    const updateTodo = useCallback((todoId: string, updates: Partial<{ text: string; completed: boolean; [key: string]: any }>) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!ytodos) return;
        
        const todo = ytodos.toArray().find(t => t.get('id') === todoId);
        if (todo) {
            providerRef.current.doc.transact(() => {
                for (const key in updates) {
                    if (Object.prototype.hasOwnProperty.call(updates, key)) {
                        const value = updates[key as keyof typeof updates];
                        if (value !== undefined) {
                            todo.set(key, value);
                        }
                    }
                }
            });
        }
    }, []);

    const deleteTodo = useCallback((todoId: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!ytodos) return;
        
        const todoIndex = ytodos.toArray().findIndex(t => t.get('id') === todoId);
        if (todoIndex > -1) {
            providerRef.current.doc.transact(() => {
                ytodos.delete(todoIndex, 1);
            });
        }
    }, []);

    const updateListName = useCallback((newName: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        
        if (!ylist.has('name')) {
            ylist.set('name', new Y.Text());
        }
        
        const yName = ylist.get('name') as Y.Text;
        if (yName) {
            providerRef.current.doc.transact(() => {
                yName.delete(0, yName.length);
                yName.insert(0, newName);
            });
        }
    }, []);

    const updateListColor = useCallback((newColor: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');

        if (!ylist.has('color')) {
          ylist.set('color', new Y.Text());
        }

        const yColor = ylist.get('color') as Y.Text;
        if (yColor) {
            providerRef.current.doc.transact(() => {
            yColor.delete(0, yColor.length);
            yColor.insert(0, newColor);
          });
        }
      }, []);

    return {
        listData,
        addTodo,
        toggleTodo,
        deleteTodo,
        updateTodo,
        updateListName,
        updateListColor,
        isConnected: syncStatus.isConnected,
        syncStatus,
    };
}
