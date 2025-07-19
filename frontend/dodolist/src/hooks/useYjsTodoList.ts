import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { PocketBaseProvider, type SyncStatusInfo } from '@/services/yjsPocketBase';
import type { YListDoc, YTodo } from '@/lib/yjsTypes';

export function useYjsTodoList(listId: string | null) {
    const [listData, setListData] = useState<{
        name: string;
        color: string;
        todos: any[];
        pinned?: boolean;
        archived?: boolean;
        deleted?: boolean;
    }>({ name: '', color: '', todos: [] });
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
        const ylist = doc.getMap('list');

        updateState = () => {
            if (!isMounted) return;
            try {
                const ytodos = ylist.get('todos') as Y.Array<YTodo> | undefined;
                const yname = ylist.get('name') as Y.Text | undefined;
                const ycolor = ylist.get('color') as Y.Text | undefined;
                
                const todos = ytodos instanceof Y.Array ? ytodos.toArray().map(t => t.toJSON()) : [];
                
                const newListData = {
                    name: yname instanceof Y.Text ? yname.toString() : '',
                    color: ycolor instanceof Y.Text ? ycolor.toString() : '',
                    todos,
                    pinned: Boolean(ylist.get('pinned')),
                    archived: Boolean(ylist.get('archived')),
                    deleted: Boolean(ylist.get('deleted')),
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
    
    // --- Todo CRUD ---
    const addTodo = useCallback((text: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        providerRef.current.doc.transact(() => {
            let ytodos = ylist.get('todos') as Y.Array<YTodo>;
            if (!(ytodos instanceof Y.Array)) {
                ytodos = new Y.Array<YTodo>();
                ylist.set('todos', ytodos);
            }
            const newTodo = new Y.Map();
            newTodo.set('id', crypto.randomUUID());
            newTodo.set('text', text);
            newTodo.set('completed', false);
            newTodo.set('createdAt', new Date().toISOString());
            ytodos.push([newTodo as YTodo]);
        });
    }, []);

    const toggleTodo = useCallback((todoId: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!(ytodos instanceof Y.Array)) return;
        const todo = ytodos.toArray().find(t => String(t.get('id')) === todoId);
        if (todo) {
            providerRef.current.doc.transact(() => {
                const completed = Boolean(todo.get('completed'));
                todo.set('completed', !completed);
            });
        }
    }, []);

    const updateTodo = useCallback((todoId: string, updates: Partial<{ text: string; completed: boolean; [key: string]: any }>) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        const ytodos = ylist.get('todos') as Y.Array<YTodo>;
        if (!(ytodos instanceof Y.Array)) return;
        const todo = ytodos.toArray().find(t => String(t.get('id')) === todoId);
        if (todo) {
            providerRef.current.doc.transact(() => {
                for (const key in updates) {
                    if (Object.prototype.hasOwnProperty.call(updates, key)) {
                        let value = updates[key as keyof typeof updates];
                        if (value instanceof Date) value = value.toISOString();
                        if (value !== undefined) {
                            (todo as Y.Map<any>).set(key, value);
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
        if (!(ytodos instanceof Y.Array)) return;
        const todoIndex = ytodos.toArray().findIndex(t => String(t.get('id')) === todoId);
        if (todoIndex > -1) {
            providerRef.current.doc.transact(() => {
                ytodos.delete(todoIndex, 1);
            });
        }
    }, []);

    const updateListName = useCallback((newName: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        providerRef.current.doc.transact(() => {
            let yName = ylist.get('name') as Y.Text;
            if (!(yName instanceof Y.Text)) {
                yName = new Y.Text();
                ylist.set('name', yName);
            }
            yName.delete(0, yName.length);
            yName.insert(0, newName);
        });
    }, []);

    const updateListColor = useCallback((newColor: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        providerRef.current.doc.transact(() => {
            let yColor = ylist.get('color') as Y.Text;
            if (!(yColor instanceof Y.Text)) {
                yColor = new Y.Text();
                ylist.set('color', yColor);
            }
            yColor.delete(0, yColor.length);
            yColor.insert(0, newColor);
        });
    }, []);

    // Add a generic metadata update method
    const updateListMetadata = useCallback((updates: Partial<{ name: string; color: string; pinned: boolean; archived: boolean; deleted: boolean }>) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        providerRef.current.doc.transact(() => {
            Object.entries(updates).forEach(([key, value]) => {
                if (key === 'name' || key === 'color') {
                    let yText = ylist.get(key) as Y.Text;
                    if (!(yText instanceof Y.Text)) {
                        yText = new Y.Text();
                        ylist.set(key, yText);
                    }
                    yText.delete(0, yText.length);
                    yText.insert(0, value as string);
                } else {
                    ylist.set(key, value);
                }
            });
        });
    }, []);

    return {
        listData,
        addTodo,
        toggleTodo,
        deleteTodo,
        updateTodo,
        updateListName,
        updateListColor,
        updateListMetadata,
        isConnected: syncStatus.isConnected,
        syncStatus,
    };
}