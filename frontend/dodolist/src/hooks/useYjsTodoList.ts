import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { PocketBaseProvider, type SyncStatusInfo } from '@/services/yjsPocketBase';

// Define the structure of a Todo item within Yjs
export type YTodo = Y.Map<any>;

// Define the structure of the entire list document
export interface YListDoc {
    name: Y.Text;
    color: Y.Text;
    pinned: Y.Map<boolean>; // Using Y.Map for complex types
    archived: Y.Map<boolean>;
    deleted: Y.Map<boolean>; // Soft delete flag
    createdAt: Y.Text;
    todos: Y.Array<YTodo>;
    metadataVersion: Y.Map<number>;
}

export function useYjsTodoList(listId: string | null) {
    const [listData, setListData] = useState<{ 
        name: string; 
        color: string; 
        pinned: boolean;
        archived: boolean;
        deleted: boolean;
        createdAt: string;
        metadataVersion: number;
        todos: any[] 
    }>({ 
        name: '', 
        color: '', 
        pinned: false,
        archived: false,
        deleted: false,
        createdAt: '',
        metadataVersion: 0,
        todos: [] 
    });
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
            setListData({ 
                name: '', 
                color: '', 
                pinned: false,
                archived: false,
                deleted: false,
                createdAt: '',
                metadataVersion: 0,
                todos: [] 
            });
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
                const ypinned = ylist.get('pinned') as Y.Map<boolean>;
                const yarchived = ylist.get('archived') as Y.Map<boolean>;
                const ydeleted = ylist.get('deleted') as Y.Map<boolean>;
                const ycreatedAt = ylist.get('createdAt') as Y.Text;
                const ymetadataVersion = ylist.get('metadataVersion') as Y.Map<number>;

                // Initialize missing fields with defaults
                if (!yname) ylist.set('name', new Y.Text());
                if (!ycolor) ylist.set('color', new Y.Text());
                if (!ytodos) ylist.set('todos', new Y.Array());
                if (!ypinned) {
                    const pinnedMap = new Y.Map();
                    pinnedMap.set('value', false);
                    ylist.set('pinned', pinnedMap);
                }
                if (!yarchived) {
                    const archivedMap = new Y.Map();
                    archivedMap.set('value', false);
                    ylist.set('archived', archivedMap);
                }
                if (!ydeleted) {
                    const deletedMap = new Y.Map();
                    deletedMap.set('value', false);
                    ylist.set('deleted', deletedMap);
                }
                if (!ycreatedAt) {
                    const createdAtText = new Y.Text();
                    createdAtText.insert(0, new Date().toISOString());
                    ylist.set('createdAt', createdAtText);
                }
                if (!ymetadataVersion) {
                    const versionMap = new Y.Map();
                    versionMap.set('value', 1);
                    ylist.set('metadataVersion', versionMap);
                }

                const todos = ytodos ? ytodos.toArray().map(t => t.toJSON()) : [];
                
                const newListData = {
                    name: yname ? yname.toString() : '',
                    color: ycolor ? ycolor.toString() : '',
                    pinned: ypinned ? ypinned.get('value') ?? false : false,
                    archived: yarchived ? yarchived.get('value') ?? false : false,
                    deleted: ydeleted ? ydeleted.get('value') ?? false : false,
                    createdAt: ycreatedAt ? ycreatedAt.toString() : new Date().toISOString(),
                    metadataVersion: ymetadataVersion ? ymetadataVersion.get('value') ?? 1 : 1,
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

    const updateListPinned = useCallback((pinned: boolean) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');

        if (!ylist.has('pinned')) {
            const pinnedMap = new Y.Map();
            pinnedMap.set('value', false);
            ylist.set('pinned', pinnedMap);
        }

        const yPinned = ylist.get('pinned') as Y.Map<boolean>;
        if (yPinned) {
            providerRef.current.doc.transact(() => {
                yPinned.set('value', pinned);
            });
        }
    }, []);

    const updateListArchived = useCallback((archived: boolean) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');

        if (!ylist.has('archived')) {
            const archivedMap = new Y.Map();
            archivedMap.set('value', false);
            ylist.set('archived', archivedMap);
        }

        const yArchived = ylist.get('archived') as Y.Map<boolean>;
        if (yArchived) {
            providerRef.current.doc.transact(() => {
                yArchived.set('value', archived);
            });
        }
    }, []);

    const updateListDeleted = useCallback((deleted: boolean) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');

        if (!ylist.has('deleted')) {
            const deletedMap = new Y.Map();
            deletedMap.set('value', false);
            ylist.set('deleted', deletedMap);
        }

        const yDeleted = ylist.get('deleted') as Y.Map<boolean>;
        if (yDeleted) {
            providerRef.current.doc.transact(() => {
                yDeleted.set('value', deleted);
            });
        }
    }, []);

    const initializeListMetadata = useCallback((metadata: { name?: string; color?: string; pinned?: boolean; archived?: boolean }) => {
        if (!providerRef.current) return;
        const ylist = providerRef.current.doc.getMap('list');

        providerRef.current.doc.transact(() => {
            // Always set name
            if (metadata.name) {
                let nameText = ylist.get('name') as Y.Text;
                if (!nameText) {
                    nameText = new Y.Text();
                    ylist.set('name', nameText);
                }
                nameText.delete(0, nameText.length);
                nameText.insert(0, metadata.name);
            }

            // Always set color
            if (metadata.color) {
                let colorText = ylist.get('color') as Y.Text;
                if (!colorText) {
                    colorText = new Y.Text();
                    ylist.set('color', colorText);
                }
                colorText.delete(0, colorText.length);
                colorText.insert(0, metadata.color);
            }

            // Always set pinned
            if (metadata.pinned !== undefined) {
                let pinnedMap = ylist.get('pinned') as Y.Map<boolean>;
                if (!pinnedMap) {
                    pinnedMap = new Y.Map();
                    ylist.set('pinned', pinnedMap);
                }
                pinnedMap.set('value', metadata.pinned);
            }

            // Always set archived
            if (metadata.archived !== undefined) {
                let archivedMap = ylist.get('archived') as Y.Map<boolean>;
                if (!archivedMap) {
                    archivedMap = new Y.Map();
                    ylist.set('archived', archivedMap);
                }
                archivedMap.set('value', metadata.archived);
            }
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
        updateListPinned,
        updateListArchived,
        updateListDeleted,
        initializeListMetadata,
        isConnected: syncStatus.isConnected,
        syncStatus,
    };
}
