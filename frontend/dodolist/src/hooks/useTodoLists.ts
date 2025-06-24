import { useState, useEffect, useCallback } from 'react';
import dbService, { type Todo, type TodoList } from '../services/dbService';

interface TodoWithTimeDates extends Omit<Todo, 'createdAt' | 'completedAt' | 'deadline' | 'reminder'> {
  createdAt: Date;
  completedAt?: Date;
  deadline?: Date;
  reminder?: Date;
}

interface TodoListWithTodos extends Omit<TodoList, 'createdAt'> {
  createdAt: Date;
  todos: TodoWithTimeDates[];
}

export function useTodoLists() {
  const [todoLists, setTodoLists] = useState<TodoListWithTodos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeListId, setActiveListId] = useState<string>('');

  const convertStringDatesToDate = (todo: Todo): TodoWithTimeDates => {
    return {
      ...todo,
      createdAt: new Date(todo.createdAt),
      completedAt: todo.completedAt ? new Date(todo.completedAt) : undefined,
      deadline: todo.deadline ? new Date(todo.deadline) : undefined,
      reminder: todo.reminder ? new Date(todo.reminder) : undefined,
    };
  };

  const convertDateToISOString = (todo: TodoWithTimeDates): Todo => {
    return {
      ...todo,
      createdAt: todo.createdAt.toISOString(),
      completedAt: todo.completedAt?.toISOString(),
      deadline: todo.deadline?.toISOString(),
      reminder: todo.reminder?.toISOString(),
    };
  };

  // Load all todo lists and their todos
  const loadTodoLists = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get all lists from database
      const lists = await dbService.getAllLists();
      
      // Transform lists and fetch todos for each list
      const listsWithTodos: TodoListWithTodos[] = await Promise.all(
        lists.map(async (list) => {
          const todos = await dbService.getTodosForList(list.id);
          return {
            ...list,
            createdAt: new Date(list.createdAt),
            todos: todos.map(convertStringDatesToDate)
          };
        })
      );
      
      setTodoLists(listsWithTodos);
      
      // Set active list to the first non-archived list or create a default one
      if (listsWithTodos.length > 0) {
        const firstNonArchivedList = listsWithTodos.find(list => !list.archived);
        if (firstNonArchivedList) {
          setActiveListId(firstNonArchivedList.id);
        } else {
          setActiveListId(listsWithTodos[0].id);
        }
      } else {
        // If no lists exist, we'll initialize with default data
        await dbService.initializeDefaultData();
        loadTodoLists(); // Reload after initializing
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to load todo lists:', err);
      setError(err instanceof Error ? err : new Error('Failed to load todo lists'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize data loading
  useEffect(() => {
    loadTodoLists();
  }, [loadTodoLists]);

  // Create a new todo list
  const createTodoList = useCallback(async (name: string, color: string) => {
    try {
      const newList: TodoList = {
        id: Date.now().toString(),
        name,
        color,
        createdAt: new Date().toISOString(),
        pinned: false,
        archived: false,
      };
      
      await dbService.createList(newList);
      
      // Reload lists after creating a new one
      await loadTodoLists();
      
      // Set the new list as active
      setActiveListId(newList.id);
      
      return newList.id;
    } catch (err) {
      console.error('Failed to create todo list:', err);
      throw err;
    }
  }, [loadTodoLists]);

  // Update a todo list
  const updateTodoList = useCallback(async (list: TodoListWithTodos) => {
    try {
      await dbService.updateList({
        ...list,
        createdAt: list.createdAt.toISOString(),
      });
      
      // Update the local state to avoid full reload
      setTodoLists(current => 
        current.map(l => l.id === list.id ? list : l)
      );
    } catch (err) {
      console.error('Failed to update todo list:', err);
      throw err;
    }
  }, []);

  // Delete a todo list
  const deleteTodoList = useCallback(async (listId: string) => {
    try {
      await dbService.deleteList(listId);
      
      // Update local state
      setTodoLists(current => current.filter(list => list.id !== listId));
      
      // If the active list was deleted, set a new active list
      if (activeListId === listId && todoLists.length > 1) {
        const remainingLists = todoLists.filter(list => list.id !== listId);
        if (remainingLists.length > 0) {
          setActiveListId(remainingLists[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to delete todo list:', err);
      throw err;
    }
  }, [activeListId, todoLists]);

  // Add a new todo to a list
  const addTodo = useCallback(async (listId: string, text: string) => {
    try {
      const newTodo: Todo = {
        id: Date.now().toString(),
        listId,
        text,
        completed: false,
        createdAt: new Date().toISOString(),
        recurring: 'none',
      };
      
      await dbService.createTodo(newTodo);
      
      // Update local state
      setTodoLists(current => 
        current.map(list => {
          if (list.id === listId) {
            return {
              ...list,
              todos: [...list.todos, convertStringDatesToDate(newTodo)]
            };
          }
          return list;
        })
      );
      
      return newTodo.id;
    } catch (err) {
      console.error('Failed to add todo:', err);
      throw err;
    }
  }, []);

  // Update a todo
  const updateTodo = useCallback(async (listId: string, todo: TodoWithTimeDates) => {
    try {
      const todoForDb = convertDateToISOString(todo);
      await dbService.updateTodo(todoForDb);
      
      // Update local state
      setTodoLists(current => 
        current.map(list => {
          if (list.id === listId) {
            return {
              ...list,
              todos: list.todos.map(t => t.id === todo.id ? todo : t)
            };
          }
          return list;
        })
      );
    } catch (err) {
      console.error('Failed to update todo:', err);
      throw err;
    }
  }, []);

  // Toggle todo completion status
  const toggleTodo = useCallback(async (listId: string, todoId: string) => {
    try {
      // Find the todo in the current state
      const list = todoLists.find(l => l.id === listId);
      const todo = list?.todos.find(t => t.id === todoId);
      
      if (list && todo) {
        const updatedTodo = {
          ...todo,
          completed: !todo.completed,
          completedAt: !todo.completed ? new Date() : undefined,
        };
        
        // Handle recurring todos
        if (!todo.completed && todo.recurring && todo.recurring !== 'none') {
          // Create a new recurring task
          const newTodo: TodoWithTimeDates = {
            id: Date.now().toString(),
            listId,
            text: todo.text,
            description: todo.description,
            completed: false,
            createdAt: new Date(),
            recurring: todo.recurring,
          };
          
          // Calculate next deadline if original had one
          if (todo.deadline) {
            const nextDeadline = new Date(todo.deadline);
            switch (todo.recurring) {
              case 'daily':
                nextDeadline.setDate(nextDeadline.getDate() + 1);
                break;
              case 'weekly':
                nextDeadline.setDate(nextDeadline.getDate() + 7);
                break;
              case 'monthly':
                nextDeadline.setMonth(nextDeadline.getMonth() + 1);
                break;
            }
            newTodo.deadline = nextDeadline;
          }
          
          // Calculate next reminder if original had one
          if (todo.reminder) {
            const nextReminder = new Date(todo.reminder);
            switch (todo.recurring) {
              case 'daily':
                nextReminder.setDate(nextReminder.getDate() + 1);
                break;
              case 'weekly':
                nextReminder.setDate(nextReminder.getDate() + 7);
                break;
              case 'monthly':
                nextReminder.setMonth(nextReminder.getMonth() + 1);
                break;
            }
            newTodo.reminder = nextReminder;
          }
          
          // Save the new recurring todo
          await dbService.createTodo(convertDateToISOString(newTodo));
          
          // Update the completed todo
          await dbService.updateTodo(convertDateToISOString(updatedTodo));
          
          // Update local state
          setTodoLists(current => 
            current.map(l => {
              if (l.id === listId) {
                return {
                  ...l,
                  todos: [...l.todos.map(t => t.id === todoId ? updatedTodo : t), newTodo]
                };
              }
              return l;
            })
          );
        } else {
          // Just update the existing todo
          await dbService.updateTodo(convertDateToISOString(updatedTodo));
          
          // Update local state
          setTodoLists(current => 
            current.map(l => {
              if (l.id === listId) {
                return {
                  ...l,
                  todos: l.todos.map(t => t.id === todoId ? updatedTodo : t)
                };
              }
              return l;
            })
          );
        }
      }
    } catch (err) {
      console.error('Failed to toggle todo:', err);
      throw err;
    }
  }, [todoLists]);

  // Delete a todo
  const deleteTodo = useCallback(async (listId: string, todoId: string) => {
    try {
      await dbService.deleteTodo(todoId);
      
      // Update local state
      setTodoLists(current => 
        current.map(list => {
          if (list.id === listId) {
            return {
              ...list,
              todos: list.todos.filter(t => t.id !== todoId)
            };
          }
          return list;
        })
      );
    } catch (err) {
      console.error('Failed to delete todo:', err);
      throw err;
    }
  }, []);

  return {
    todoLists,
    loading,
    error,
    activeListId,
    setActiveListId,
    loadTodoLists,
    createTodoList,
    updateTodoList,
    deleteTodoList,
    addTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
  };
}
