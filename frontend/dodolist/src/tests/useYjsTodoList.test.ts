import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { useYjsTodoList } from '../hooks/useYjsTodoList';

vi.mock('../services/yjsPocketBase', () => {
    const PocketBaseProvider = vi.fn(() => {
        const doc = new Y.Doc();
        const ylist = doc.getMap('list');
        ylist.set('name', new Y.Text());
        ylist.set('todos', new Y.Array());

        // This will store the actual updateState function from the hook
        let updateStateCallback: (() => void) | null = null;

        // Mock the observe method to capture the updateState callback
        const originalObserve = ylist.observe;
        ylist.observe = (callback: any) => {
            updateStateCallback = callback;
            originalObserve.call(ylist, callback);
        };
        const originalTodosObserve = (ylist.get('todos') as Y.Array<any>).observe;
        (ylist.get('todos') as Y.Array<any>).observe = (callback: any) => {
            updateStateCallback = callback;
            originalTodosObserve.call((ylist.get('todos') as Y.Array<any>), callback);
        };

        // Override transact to immediately call the stored callback
        const originalTransact = doc.transact;
        doc.transact = <T>(fn: (transaction: any) => T, origin?: any): T => {
            const result: T = originalTransact.call(doc, fn, origin) as T;
            if (updateStateCallback) {
                updateStateCallback();
            }
            return result;
        };

        return {
            doc: doc,
            persistence: {
                whenSynced: Promise.resolve(), // Resolve immediately
            },
            destroy: vi.fn(),
        };
    });
    return { PocketBaseProvider };
});

describe('useYjsTodoList Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should initialize with an empty list and name', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-1'));
    expect(result.current.listData.name).toBe('');
    expect(result.current.listData.todos).toEqual([]);
  });

  it('should add a todo item', async () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-2'));

    act(() => {
      result.current.addTodo('A new task');
    });

    expect(result.current.listData.todos.length).toBe(1);
    expect(result.current.listData.todos[0].text).toBe('A new task');
  });

  it('should toggle a todo item', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-3'));

    act(() => {
      result.current.addTodo('Task to toggle');
    });
    const todoId = result.current.listData.todos[0].id;

    act(() => {
      result.current.toggleTodo(todoId);
    });
    expect(result.current.listData.todos[0].completed).toBe(true);
  });

  it('should delete a todo item', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-4'));

    act(() => {
      result.current.addTodo('Task to be deleted');
    });
    const todoId = result.current.listData.todos[0].id;

    act(() => {
      result.current.deleteTodo(todoId);
    });

    expect(result.current.listData.todos.length).toBe(0);
  });

  it('should update a todo item', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-5'));

    act(() => {
      result.current.addTodo('Task to be updated');
    });
    const todoId = result.current.listData.todos[0].id;

    act(() => {
      result.current.updateTodo(todoId, { text: 'This task is updated' });
    });

    expect(result.current.listData.todos[0].text).toBe('This task is updated');
  });

  it('should update the list name', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-6'));

    act(() => {
      result.current.updateListName('My Awesome List');
    });

    expect(result.current.listData.name).toBe('My Awesome List');
  });
});