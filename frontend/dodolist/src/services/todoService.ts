import { useState, useEffect } from 'react';
import dbService from './dbService';

// Export interfaces to be used across the application
export interface Todo {
  id: string;
  text: string;
  description?: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  deadline?: Date;
  reminder?: Date;
  recurring?: "none" | "daily" | "weekly" | "monthly";
  listId: string;
}

export interface TodoList {
  id: string;
  name: string;
  color: string;
  todos: Todo[];
  createdAt: Date;
  pinned?: boolean;
  archived?: boolean;
}

// Helper function to convert Todo objects to the database format
const todoToDbFormat = (todo: Todo): any => {
  return {
    id: todo.id,
    listId: todo.listId, // This needs to be added to Todo interface
    text: todo.text,
    description: todo.description,
    completed: todo.completed ? 1 : 0,
    createdAt: todo.createdAt.toISOString(),
    completedAt: todo.completedAt ? todo.completedAt.toISOString() : null,
    deadline: todo.deadline ? todo.deadline.toISOString() : null,
    reminder: todo.reminder ? todo.reminder.toISOString() : null,
    recurring: todo.recurring || 'none'
  };
};

// Helper function to convert database objects to Todo
const dbToTodoFormat = (dbTodo: any): Todo => {
  return {
    id: dbTodo.id,
    text: dbTodo.text,
    description: dbTodo.description,
    completed: Boolean(dbTodo.completed),
    createdAt: new Date(dbTodo.createdAt),
    completedAt: dbTodo.completedAt ? new Date(dbTodo.completedAt) : undefined,
    deadline: dbTodo.deadline ? new Date(dbTodo.deadline) : undefined,
    reminder: dbTodo.reminder ? new Date(dbTodo.reminder) : undefined,
    recurring: dbTodo.recurring as "none" | "daily" | "weekly" | "monthly",
    listId: dbTodo.listId
  };
};

// Helper function to convert TodoList objects to the database format
const todoListToDbFormat = (list: TodoList): any => {
  return {
    id: list.id,
    name: list.name,
    color: list.color,
    createdAt: list.createdAt.toISOString(),
    pinned: list.pinned ? 1 : 0,
    archived: list.archived ? 1 : 0
  };
};

// Helper function to convert database objects to TodoList
const dbToTodoListFormat = (dbList: any, todos: Todo[] = []): TodoList => {
  return {
    id: dbList.id,
    name: dbList.name,
    color: dbList.color,
    todos,
    createdAt: new Date(dbList.createdAt),
    pinned: Boolean(dbList.pinned),
    archived: Boolean(dbList.archived)
  };
};

export const usePersistentTodoLists = () => {
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Load todo lists on component mount
  useEffect(() => {
    loadTodoLists();
  }, []);

  // Load all todo lists from the database
  const loadTodoLists = async () => {
    try {
      setLoading(true);
      
      // Make sure database is ready
      await dbService.ready();
      
      // Get all lists from the database
      const dbLists = await dbService.getAllLists();
      
      if (dbLists.length === 0) {
        // Initialize with a default list if no lists exist
        await dbService.initializeDefaultData();
        const defaultLists = await dbService.getAllLists();
        await processTodoLists(defaultLists);
      } else {
        await processTodoLists(dbLists);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to load todo lists:', err);
      setError(err instanceof Error ? err : new Error('Failed to load todo lists'));
    } finally {
      setLoading(false);
    }
  };

  // Process todo lists from database
  const processTodoLists = async (dbLists: any[]) => {
    // Get todos for each list
    const listsWithTodos = await Promise.all(
      dbLists.map(async (dbList) => {
        const dbTodos = await dbService.getTodosForList(dbList.id);
        const todos = dbTodos.map(dbToTodoFormat);
        return dbToTodoListFormat(dbList, todos);
      })
    );
    
    setTodoLists(listsWithTodos);
    
    // Set active list to first non-archived list or first list
    if (listsWithTodos.length > 0) {
      const firstNonArchivedList = listsWithTodos.find((list) => !list.archived);
      setActiveListId(firstNonArchivedList?.id || listsWithTodos[0].id);
    }
  };

  // Add a new todo to a list
  const addTodo = async (text: string, listId: string) => {
    if (!text.trim()) return;
    
    try {
      const todo: Todo = {
        id: Date.now().toString(),
        text: text.trim(),
        completed: false,
        createdAt: new Date(),
        recurring: "none",
        listId
      };
      
      // Save to database
      await dbService.createTodo(todoToDbFormat(todo));
      
      // Update state
      setTodoLists(todoLists.map((list) => 
        list.id === listId 
          ? { ...list, todos: [...list.todos, todo] } 
          : list
      ));
      
      return todo.id;
    } catch (err) {
      console.error('Failed to add todo:', err);
      throw err;
    }
  };

  // Toggle a todo's completed status
  const toggleTodo = async (todoId: string, listId: string) => {
    try {
      // Find the todo
      const list = todoLists.find((l) => l.id === listId);
      const todo = list?.todos.find((t) => t.id === todoId);
      
      if (!list || !todo) return;
      
      // Create updated todo
      const updatedTodo = {
        ...todo,
        completed: !todo.completed,
        completedAt: !todo.completed ? new Date() : undefined,
      };
      
      // Save to database
      await dbService.updateTodo(todoToDbFormat(updatedTodo));
      
      // Handle recurring task if completed
      if (!todo.completed && todo.recurring && todo.recurring !== "none") {
        const newTodo: Todo = {
          id: Date.now().toString(),
          text: todo.text,
          description: todo.description,
          completed: false,
          createdAt: new Date(),
          recurring: todo.recurring,
          listId
        };
        
        // Set next deadline if original had one
        if (todo.deadline) {
          const nextDeadline = new Date(todo.deadline);
          switch (todo.recurring) {
            case "daily":
              nextDeadline.setDate(nextDeadline.getDate() + 1);
              break;
            case "weekly":
              nextDeadline.setDate(nextDeadline.getDate() + 7);
              break;
            case "monthly":
              nextDeadline.setMonth(nextDeadline.getMonth() + 1);
              break;
          }
          newTodo.deadline = nextDeadline;
        }
        
        // Set next reminder if original had one
        if (todo.reminder) {
          const nextReminder = new Date(todo.reminder);
          switch (todo.recurring) {
            case "daily":
              nextReminder.setDate(nextReminder.getDate() + 1);
              break;
            case "weekly":
              nextReminder.setDate(nextReminder.getDate() + 7);
              break;
            case "monthly":
              nextReminder.setMonth(nextReminder.getMonth() + 1);
              break;
          }
          newTodo.reminder = nextReminder;
        }
        
        // Save new recurring todo to database
        await dbService.createTodo(todoToDbFormat(newTodo));
        
        // Update state with both updated todo and new recurring todo
        setTodoLists(todoLists.map((l) => 
          l.id === listId 
            ? { ...l, todos: [...l.todos.map((t) => t.id === todoId ? updatedTodo : t), newTodo] } 
            : l
        ));
      } else {
        // Just update the todo's completed status
        setTodoLists(todoLists.map((l) => 
          l.id === listId 
            ? { ...l, todos: l.todos.map((t) => t.id === todoId ? updatedTodo : t) } 
            : l
        ));
      }
    } catch (err) {
      console.error('Failed to toggle todo:', err);
      throw err;
    }
  };

  // Delete a todo
  const deleteTodo = async (todoId: string, listId: string) => {
    try {
      // Delete from database
      await dbService.deleteTodo(todoId);
      
      // Update state
      setTodoLists(todoLists.map((list) => 
        list.id === listId 
          ? { ...list, todos: list.todos.filter((todo) => todo.id !== todoId) } 
          : list
      ));
    } catch (err) {
      console.error('Failed to delete todo:', err);
      throw err;
    }
  };

  // Update a todo
  const updateTodo = async (todoId: string, listId: string, updates: Partial<Todo>) => {
    try {
      // Find the todo
      const list = todoLists.find((l) => l.id === listId);
      const todo = list?.todos.find((t) => t.id === todoId);
      
      if (!list || !todo) return;
      
      // Create updated todo
      const updatedTodo = { ...todo, ...updates };
      
      // Save to database
      await dbService.updateTodo(todoToDbFormat(updatedTodo));
      
      // Update state
      setTodoLists(todoLists.map((l) => 
        l.id === listId 
          ? { ...l, todos: l.todos.map((t) => t.id === todoId ? updatedTodo : t) } 
          : l
      ));
    } catch (err) {
      console.error('Failed to update todo:', err);
      throw err;
    }
  };

  // Create a new todo list
  const createNewList = async (name: string, color: string) => {
    if (!name.trim()) return;
    
    try {
      const newList: TodoList = {
        id: Date.now().toString(),
        name: name.trim(),
        color,
        todos: [],
        createdAt: new Date(),
        pinned: false,
        archived: false,
      };
      
      // Save to database
      await dbService.createList(todoListToDbFormat(newList));
      
      // Update state
      setTodoLists([...todoLists, newList]);
      setActiveListId(newList.id);
      
      return newList.id;
    } catch (err) {
      console.error('Failed to create todo list:', err);
      throw err;
    }
  };

  // Update a todo list
  const updateList = async (listId: string, updates: Partial<TodoList>) => {
    try {
      // Find the list
      const list = todoLists.find((l) => l.id === listId);
      
      if (!list) return;
      
      // Create updated list
      const updatedList = { ...list, ...updates };
      
      // Save to database
      await dbService.updateList(todoListToDbFormat(updatedList));
      
      // Update state
      setTodoLists(todoLists.map((l) => 
        l.id === listId ? updatedList : l
      ));
    } catch (err) {
      console.error('Failed to update todo list:', err);
      throw err;
    }
  };

  // Delete a todo list
  const deleteList = async (listId: string) => {
    try {
      if (todoLists.length <= 1) {
        throw new Error('Cannot delete the only list');
      }
      
      // Delete from database
      await dbService.deleteList(listId);
      
      // Update state
      const newLists = todoLists.filter((list) => list.id !== listId);
      setTodoLists(newLists);
      
      // If active list was deleted, set a new active list
      if (activeListId === listId) {
        const nextActiveList = newLists.find((list) => !list.archived) || newLists[0];
        setActiveListId(nextActiveList.id);
      }
    } catch (err) {
      console.error('Failed to delete todo list:', err);
      throw err;
    }
  };

  return {
    todoLists,
    activeListId,
    setActiveListId,
    loading,
    error,
    addTodo,
    toggleTodo,
    deleteTodo,
    updateTodo,
    createNewList,
    updateList,
    deleteList,
    loadTodoLists
  };
};
