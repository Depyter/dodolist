import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { PocketBaseProvider } from '../services/yjsPocketBase';

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
    const [provider, setProvider] = useState<PocketBaseProvider | null>(null);
    const [listData, setListData] = useState<{ name: string; todos: any[] }>({ name: '', todos: [] });
    const [isConnected, setIsConnected] = useState(false);
    
    // Use refs to avoid stale closure issues in cleanup
    const providerRef = useRef<PocketBaseProvider | null>(null);
    const updateStateRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        console.log(`[useYjsTodoList] Effect triggered for listId: ${listId}`);
        
        if (!listId) {
            // Clean up if there's no active list
            if (providerRef.current) {
                console.log('[useYjsTodoList] Cleaning up provider for null listId');
                providerRef.current.destroy();
                providerRef.current = null;
                setProvider(null);
                setIsConnected(false);
            }
            setListData({ name: '', todos: [] });
            return;
        }

        // Create provider for local-first operations with IndexedDB persistence
        const newProvider = new PocketBaseProvider(listId);
        setProvider(newProvider);
        providerRef.current = newProvider;

        const ylist = newProvider.doc.getMap('list') as Y.Map<any>;
        
        // Initialize the document structure if it doesn't exist
        console.log('[useYjsTodoList] Initializing Yjs document structure');
        if (!ylist.has('name')) {
            ylist.set('name', new Y.Text());
        }
        if (!ylist.has('todos')) {
            ylist.set('todos', new Y.Array());
        }
        if (!ylist.has('color')) {
            ylist.set('color', new Y.Text());
        }

        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        const yname = ylist.get('name') as Y.Text;

        const updateState = () => {
            try {
                console.log('[useYjsTodoList] Updating state from Yjs document');
                const todos = ytodos ? ytodos.toArray().map(t => {
                    try {
                        const todo = t.toJSON();
                        console.log('[useYjsTodoList] Converting todo:', todo);
                        return {
                            ...todo,
                            createdAt: todo.createdAt ? new Date(todo.createdAt) : undefined,
                            completedAt: todo.completedAt ? new Date(todo.completedAt) : undefined,
                            deadline: todo.deadline ? new Date(todo.deadline) : undefined,
                            reminder: todo.reminder ? new Date(todo.reminder) : undefined,
                        };
                    } catch (error) {
                        console.error('[useYjsTodoList] Error converting todo:', error);
                        return null;
                    }
                }).filter(Boolean) : [];
                
                const newListData = {
                    name: yname.toString() || '',
                    todos,
                };
                
                console.log(`[useYjsTodoList] State updated - name: "${newListData.name}", todos count: ${newListData.todos.length}`, newListData.todos);
                setListData(newListData);
            } catch (error) {
                console.error('[useYjsTodoList] Error in updateState:', error);
            }
        };
        
        updateStateRef.current = updateState;

        // Subscribe to local Yjs changes
        console.log('[useYjsTodoList] Setting up Yjs observers');
        if (ytodos) {
            ytodos.observe(updateState);
        }
        ylist.observe(updateState);
        
        // Wait for IndexedDB to sync before updating state
        newProvider.persistence.whenSynced.then(() => {
            console.log('[useYjsTodoList] IndexedDB synced, updating state');
            updateState(); // Load from local storage first
            setIsConnected(true); // Mark as ready for operations
        }).catch((error) => {
            console.error('[useYjsTodoList] Error waiting for IndexedDB sync:', error);
            setIsConnected(true); // Still mark as connected even if there's an error
        });

        return () => {
            console.log(`[useYjsTodoList] Cleanup for listId: ${listId}`);
            
            if (providerRef.current) {
                try {
                    const ylist = providerRef.current.doc.getMap('list');
                    const ytodos = ylist.get('todos') as Y.Array<YTodo>;
                    
                    if (ytodos && updateStateRef.current) {
                        ytodos.unobserve(updateStateRef.current);
                    }
                    if (updateStateRef.current) {
                        ylist.unobserve(updateStateRef.current);
                    }
                    
                    providerRef.current.destroy();
                    providerRef.current = null;
                } catch (error) {
                    console.error('[useYjsTodoList] Error during cleanup:', error);
                }
            }
            
            setProvider(null);
            setIsConnected(false);
            updateStateRef.current = null;
        };
    }, [listId]);

    // --- Functions to modify the Yjs document ---
    
    const addTodo = (text: string) => {
        if (!provider) return;
        const ylist = provider.doc.getMap('list');
        
        // Ensure todos array exists
        if (!ylist.has('todos')) {
            ylist.set('todos', new Y.Array());
        }
        
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        
        const newTodo = new Y.Map();
        newTodo.set('id', crypto.randomUUID());
        newTodo.set('text', text);
        newTodo.set('completed', false);
        newTodo.set('createdAt', new Date().toISOString());

        provider.doc.transact(() => {
            ytodos.push([newTodo]);
        });
    };

    const toggleTodo = (todoId: string) => {
        if (!provider) return;
        const ylist = provider.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!ytodos) return;
        
        const todo = ytodos.toArray().find(t => t.get('id') === todoId);
        if (todo) {
            provider.doc.transact(() => {
                todo.set('completed', !todo.get('completed'));
            });
        }
    };

    const updateTodo = (todoId: string, updates: Partial<{ text: string; completed: boolean; [key: string]: any }>) => {
        if (!provider) return;
        const ylist = provider.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!ytodos) return;
        
        const todo = ytodos.toArray().find(t => t.get('id') === todoId);
        if (todo) {
            provider.doc.transact(() => {
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
    };

    const deleteTodo = (todoId: string) => {
        if (!provider) return;
        const ylist = provider.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!ytodos) return;
        
        const todoIndex = ytodos.toArray().findIndex(t => t.get('id') === todoId);
        if (todoIndex > -1) {
            provider.doc.transact(() => {
                ytodos.delete(todoIndex, 1);
            });
        }
    };

    const updateListName = (newName: string) => {
        if (!provider) return;
        const ylist = provider.doc.getMap('list');
        
        // Ensure name exists
        if (!ylist.has('name')) {
            ylist.set('name', new Y.Text());
        }
        
        const yName = ylist.get('name') as Y.Text;
        if (yName) {
            provider.doc.transact(() => {
                yName.delete(0, yName.length);
                yName.insert(0, newName);
            });
        }
    };

    return { listData, isConnected, addTodo, toggleTodo, updateTodo, deleteTodo, updateListName };
}
