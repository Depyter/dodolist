import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DodoListApp from '../pages/TodoListPage';
import { useTodoLists } from '../hooks/useTodoLists';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Define Todo interface to match the component
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  listId: string;
  description?: string;
  completedAt?: Date;
  deadline?: Date;
  reminder?: Date;
  recurring?: "none" | "daily" | "weekly" | "monthly";
}

// Mock the useTodoLists hook
vi.mock('../hooks/useTodoLists', () => ({
  useTodoLists: vi.fn(),
}));

// Mock AuthService
vi.mock('@/services/authService', () => ({
    default: vi.fn(() => ({
        logout: vi.fn(),
        isAuthenticated: () => true, // Assume user is always authenticated
        getCurrentUser: () => ({ id: 'user-123', name: 'Test User' }),
    })),
}));

const mockAddTodo = vi.fn();
const mockToggleTodo = vi.fn();
const mockDeleteTodo = vi.fn();
const mockUpdateTodo = vi.fn();
const mockSetActiveListId = vi.fn();

const mockTodoListsData = {
    todoLists: [
        {
            id: 'list-1',
            name: 'Test List',
            color: 'bg-stone-400',
            todos: [] as Todo[],
        },
    ],
    loading: false,
    error: null,
    activeListId: 'list-1',
    setActiveListId: mockSetActiveListId,
    createNewList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    addTodo: mockAddTodo,
    toggleTodo: mockToggleTodo,
    updateTodo: mockUpdateTodo,
    deleteTodo: mockDeleteTodo,
    isPocketBaseConnected: true,
};

const renderComponent = (listId = 'list-1') => {
  return render(
    <MemoryRouter initialEntries={[`/list/${listId}`]}>
      <Routes>
        <Route path="/list/:listId" element={<DodoListApp />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('TodoListPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock data before each test
    mockTodoListsData.todoLists[0].todos = [];
    (useTodoLists as ReturnType<typeof vi.fn>).mockReturnValue(mockTodoListsData);
    window.dispatchEvent(new CustomEvent('dodolist-storage-info', {
        detail: { type: 'persistence-info', storageType: 'indexeddb' }
      }));

    // Explicitly mock window.matchMedia for this test file
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('should add a new todo when user types and clicks send', async () => {
    renderComponent();

    const input = screen.getByPlaceholderText(/Add a task to/);
    const sendButton = screen.getByRole('button', { name: /add task/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'New test todo' } });
    });

    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(mockAddTodo).toHaveBeenCalledWith('New test todo');
  });

  it('should display todos and allow toggling them', async () => {
    mockTodoListsData.todoLists[0].todos = [
        { id: 'todo-1', text: 'A task to be toggled', completed: false, createdAt: new Date(), listId: 'list-1' },
    ];
    (useTodoLists as ReturnType<typeof vi.fn>).mockReturnValue(mockTodoListsData);

    renderComponent();

    const toggleButton = screen.getByLabelText('Mark "A task to be toggled" as complete');
    expect(toggleButton).toBeInTheDocument();

    await act(async () => {
        fireEvent.click(toggleButton!);
    });

    await waitFor(() => {
        expect(mockToggleTodo).toHaveBeenCalledWith('todo-1');
    });
  });

  it('should allow deleting a todo', async () => {
    mockTodoListsData.todoLists[0].todos = [
        { id: 'todo-2', text: 'A task to be deleted', completed: false, createdAt: new Date(), listId: 'list-1' },
    ];
    (useTodoLists as ReturnType<typeof vi.fn>).mockReturnValue(mockTodoListsData);

    renderComponent();

    const deleteButton = screen.getByLabelText('Delete task "A task to be deleted"');
    await act(async () => {
        fireEvent.click(deleteButton);
    });

    await waitFor(() => {
        expect(mockDeleteTodo).toHaveBeenCalledWith('todo-2');
    });
  });
});