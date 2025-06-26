import { describe, it, expect, beforeEach } from 'vitest';
import { usePersistentTodoLists } from '../services/todoService';
import { act, renderHook } from '@testing-library/react';

// Simple test for basic CRUD operations on todo lists

describe('todoService basic CRUD', () => {
  it('should create, update, and delete a todo list', async () => {
    const { result } = renderHook(() => usePersistentTodoLists());

    // Create a new list
    await act(async () => {
      await result.current.createNewList('Test List', 'bg-blue-500');
    });
    expect(result.current.todoLists.some(l => l.name === 'Test List')).toBe(true);
    const createdList = result.current.todoLists.find(l => l.name === 'Test List');
    expect(createdList).toBeDefined();

    // Update the list name
    await act(async () => {
      await result.current.updateList(createdList!.id, { name: 'Updated List' });
    });
    expect(result.current.todoLists.some(l => l.name === 'Updated List')).toBe(true);

    // Delete the list
    await act(async () => {
      await result.current.deleteList(createdList!.id);
    });
    expect(result.current.todoLists.some(l => l.id === createdList!.id)).toBe(false);
  });
});
