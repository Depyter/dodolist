import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { PocketBaseProvider, type SyncStatusInfo } from '@/services/yjsPocketBase';
import type { YTodo, YListDoc } from '@/lib/yjsTypes';
import type { Todo } from '@/lib/types';

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
        const ylist = doc.getMap('list') as unknown as YListDoc;

        function extractBool(val: any): boolean {
            if (typeof val === 'boolean') return val;
            if (val && typeof val.get === 'function') return val.get('value') ?? false;
            return false;
        }

        updateState = () => {
            if (!isMounted) return;
            try {
                // Always use Yjs Map API to get/set types
                let ytodos = ylist.todos;
                let yname = ylist.name;
                let ycolor = ylist.color;
                let pinned = ylist.pinned;
                let archived = ylist.archived;
                let deleted = ylist.deleted;

                // Ensure Yjs types are initialized
                if (!(ytodos instanceof Y.Array)) {
                    ytodos = new Y.Array();
                    (ylist as any).todos = ytodos;
                }
                if (!(yname instanceof Y.Text)) {
                    yname = new Y.Text();
                    (ylist as any).name = yname;
                }
                if (!(ycolor instanceof Y.Text)) {
                    ycolor = new Y.Text();
                    (ylist as any).color = ycolor;
                }

                // Deserialize todos, converting date strings to Date objects
                const todos = ytodos
                  ? ytodos.toArray().map(t => {
                        const obj = t.toJSON() as Todo;
                        return {
                            ...obj,
                            createdAt: obj.createdAt ? new Date(obj.createdAt) : undefined,
                            completedAt: obj.completedAt ? new Date(obj.completedAt) : undefined,
                            deadline: obj.deadline ? new Date(obj.deadline) : undefined,
                            reminder: obj.reminder ? new Date(obj.reminder) : undefined,
                        };
                    })
                  : [];
                const newListData = {
                    name: yname ? yname.toString() : '',
                    color: ycolor ? ycolor.toString() : '',
                    todos,
                    pinned: extractBool(pinned),
                    archived: extractBool(archived),
                    deleted: extractBool(deleted),
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
        const ylist = providerRef.current.doc.getMap('list') as unknown as YListDoc;
        // Ensure todos is a Y.Array
        let ytodos = ylist.todos;
        if (!(ytodos instanceof Y.Array)) {
            ytodos = new Y.Array<YTodo>();
            (ylist as any).todos = ytodos;
        }
        const todoObj: Todo = {
            id: crypto.randomUUID(),
            text,
            completed: false,
            createdAt: new Date(),
            listId: providerRef.current ? providerRef.current.doc.guid : '',
        };
        // Serialize Date fields to ISO strings for Yjs
        const yTodoObj: Record<string, any> = {
            ...todoObj,
            createdAt: todoObj.createdAt.toISOString(),
        };
        const newTodo = new Y.Map<any>(Object.entries(yTodoObj));
        providerRef.current.doc.transact(() => {
            ytodos.push([newTodo as YTodo]);
        });
    }, []);

    const toggleTodo = useCallback((todoId: string) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list') as unknown as YListDoc;
        let ytodos = ylist.todos;
        if (!(ytodos instanceof Y.Array)) {
            ytodos = new Y.Array<YTodo>();
            (ylist as any).todos = ytodos;
        }
        const todo = ytodos.toArray().find(t => String(t.get('id')) === todoId);
        if (todo) {
            providerRef.current.doc.transact(() => {
                const completed = Boolean(todo.get('completed'));
                todo.set('completed', !completed);
            });
        }
    }, []);

    const updateTodo = useCallback((todoId: string, updates: Partial<Todo>) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list') as unknown as YListDoc;
        let ytodos = ylist.todos;
        if (!(ytodos instanceof Y.Array)) {
            ytodos = new Y.Array<YTodo>();
            (ylist as any).todos = ytodos;
        }
        const todo = ytodos.toArray().find(t => String(t.get('id')) === todoId);
        if (todo) {
            providerRef.current.doc.transact(() => {
                for (const key in updates) {
                    if (Object.prototype.hasOwnProperty.call(updates, key)) {
                        let value = updates[key as keyof Todo];
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
        const ylist = providerRef.current.doc.getMap('list') as unknown as YListDoc;
        let ytodos = ylist.todos;
        if (!(ytodos instanceof Y.Array)) {
            ytodos = new Y.Array<YTodo>();
            (ylist as any).todos = ytodos;
        }
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

    // Add a generic metadata update method
    const updateListMetadata = useCallback((updates: Partial<{ name: string; color: string; pinned: boolean; archived: boolean; deleted: boolean }>) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');
        providerRef.current.doc.transact(() => {
            Object.entries(updates).forEach(([key, value]) => {
                if (key === 'name' || key === 'color') {
                    if (!ylist.has(key)) ylist.set(key, new Y.Text());
                    const yText = ylist.get(key) as Y.Text;
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
        updateListMetadata, // <-- Expose the new method
        isConnected: syncStatus.isConnected,
        syncStatus,
    };
}
