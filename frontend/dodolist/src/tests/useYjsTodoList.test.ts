import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { useYjsTodoList } from '../hooks/useYjsTodoList';

// Mock the PocketBaseProvider
vi.mock('../services/yjsPocketBase', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/yjsPocketBase')>();
  const mockProvider = {
    doc: new Y.Doc(),
    onStatusChange: vi.fn(() => () => {}),
    destroy: vi.fn(),
  };

  return {
    ...original,
    PocketBaseProvider: vi.fn(() => mockProvider),
    __mockProvider: mockProvider,
  };
});

describe('useYjsTodoList Hook', () => {
  let mockProvider: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import the mock to get a fresh instance for each test
    const mod = await import('../services/yjsPocketBase');
    mockProvider = (mod as any).__mockProvider;
    // Reset the document for each test to ensure isolation
    mockProvider.doc = new Y.Doc();
  });

  it('should initialize with default data when listId is provided', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-1'));
    expect(result.current.listData.name).toBe('');
    expect(result.current.listData.todos).toEqual([]);
    expect(result.current.listData.pinned).toBe(false);
  });

  it('should add a todo item and update the state', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-2'));

    act(() => {
      result.current.addTodo('A new task');
    });

    // Check immediately - Yjs updates are synchronous
    expect(result.current.listData.todos.length).toBe(1);
    expect(result.current.listData.todos[0].text).toBe('A new task');
    expect(result.current.listData.todos[0].completed).toBe(false);
  });

  it('should toggle a todo item', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-3'));

    act(() => {
      result.current.addTodo('Task to toggle');
    });

    // Get todo ID immediately after adding
    const todoId = result.current.listData.todos[0].id;
    expect(result.current.listData.todos[0].completed).toBe(false);

    act(() => {
      result.current.toggleTodo(todoId);
    });

    // Check immediately after toggle
    expect(result.current.listData.todos[0].completed).toBe(true);
  });

  it('should delete a todo item', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-4'));

    act(() => {
      result.current.addTodo('Task to be deleted');
    });

    // Check immediately after adding
    expect(result.current.listData.todos.length).toBe(1);

    const todoId = result.current.listData.todos[0].id;

    act(() => {
      result.current.deleteTodo(todoId);
    });

    // Check immediately after deletion
    expect(result.current.listData.todos.length).toBe(0);
  });

  it('should update list metadata like name, color, pinned, and archived status', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-5'));

    // Update name
    act(() => {
      result.current.updateListName('My Awesome List');
    });
    expect(result.current.listData.name).toBe('My Awesome List');

    // Update color
    act(() => {
      result.current.updateListColor('bg-blue-500');
    });
    expect(result.current.listData.color).toBe('bg-blue-500');

    // Update pinned status
    act(() => {
      result.current.updateListPinned(true);
    });
    expect(result.current.listData.pinned).toBe(true);

    // Update archived status
    act(() => {
      result.current.updateListArchived(true);
    });
    expect(result.current.listData.archived).toBe(true);
  });

  it('should initialize list metadata correctly', () => {
    const { result } = renderHook(() => useYjsTodoList('test-list-6'));

    const initialMetadata = {
      name: 'Initial Name',
      color: 'bg-green-500',
      pinned: true,
      archived: false,
    };

    act(() => {
      result.current.initializeListMetadata(initialMetadata);
    });

    // Check immediately after initialization
    expect(result.current.listData.name).toBe('Initial Name');
    expect(result.current.listData.color).toBe('bg-green-500');
    expect(result.current.listData.pinned).toBe(true);
    expect(result.current.listData.archived).toBe(false);
  });
});
