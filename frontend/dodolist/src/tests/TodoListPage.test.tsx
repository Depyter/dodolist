import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import DodoListApp from '../pages/TodoListPage';
import { useTodoLists } from '../hooks/useTodoLists';
import { useYjsTodoList } from '../hooks/useYjsTodoList';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock the hooks
vi.mock('../hooks/useTodoLists');
vi.mock('../hooks/useYjsTodoList');

// Mock AuthService
vi.mock('@/services/authService', () => ({
  default: vi.fn(() => ({
    logout: vi.fn(),
    isAuthenticated: () => true,
    getCurrentUser: () => ({ id: 'user-123', name: 'Test User' }),
  })),
}));

const mockUseTodoLists = useTodoLists as Mock;
const mockUseYjsTodoList = useYjsTodoList as Mock;

describe('TodoListPage Component', () => {
  const mockAddTodo = vi.fn();
  const mockToggleTodo = vi.fn();
  const mockDeleteTodo = vi.fn();
  const mockUpdateListName = vi.fn();
  const mockSetActiveListId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseTodoLists.mockReturnValue({
      todoLists: [
        {
          id: 'list-1',
          name: 'Test List',
          color: 'bg-stone-400',
          todos: [],
          pinned: false,
          archived: false,
        },
      ],
      loading: false,
      error: null,
      activeListId: 'list-1',
      setActiveListId: mockSetActiveListId,
      createNewList: vi.fn(),
      deleteList: vi.fn(),
      cloneList: vi.fn(),
      updateListMetadata: vi.fn(),
    });

    mockUseYjsTodoList.mockReturnValue({
      listData: {
        name: 'Test List',
        color: 'bg-stone-400',
        todos: [],
        pinned: false,
        archived: false,
      },
      addTodo: mockAddTodo,
      toggleTodo: mockToggleTodo,
      deleteTodo: mockDeleteTodo,
      updateListName: mockUpdateListName,
      updateListColor: vi.fn(),
      updateListPinned: vi.fn(),
      updateListArchived: vi.fn(),
      initializeListMetadata: vi.fn(),
      isConnected: true,
      syncStatus: { status: 'synced' },
    });

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  const renderComponent = (listId = 'list-1') => {
    return render(
      <MemoryRouter initialEntries={[`/list/${listId}`]}>
        <Routes>
          <Route path="/list/:listId" element={<DodoListApp />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders the list name and an input to add tasks', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: 'Test List', level: 2 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a task to Test List...')).toBeInTheDocument();
  });

  it('calls addTodo when a new task is submitted', async () => {
    renderComponent();
    const input = screen.getByPlaceholderText(/Add a task to/);
    const sendButton = screen.getByLabelText('Add task');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'A new task' } });
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(mockAddTodo).toHaveBeenCalledWith('A new task');
    });
  });

  it('displays existing todos and allows toggling and deleting them', async () => {
    const todos = [
      { id: 'todo-1', text: 'First task', completed: false },
      { id: 'todo-2', text: 'Second task', completed: true },
    ];

    mockUseYjsTodoList.mockReturnValue({
      ...mockUseYjsTodoList(),
      listData: { ...mockUseYjsTodoList().listData, todos },
    });

    renderComponent();

    expect(screen.getByText('First task')).toBeInTheDocument();
    expect(screen.getByText('Second task')).toBeInTheDocument();

    // Toggle the first task
    const toggleButton = screen.getByLabelText('Mark "First task" as complete');
    await act(async () => {
      fireEvent.click(toggleButton);
    });
    await waitFor(() => {
      expect(mockToggleTodo).toHaveBeenCalledWith('todo-1');
    });

    // Delete the second task
    const deleteButton = screen.getByLabelText('Delete task "Second task"');
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    await waitFor(() => {
      expect(mockDeleteTodo).toHaveBeenCalledWith('todo-2');
    });
  });

  it('allows editing the list name', async () => {
    renderComponent();
    const listNameElement = screen.getByRole('heading', { name: /test list/i, level: 2 });

    await act(async () => {
      fireEvent.click(listNameElement);
    });

    const input = screen.getByDisplayValue('Test List');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Updated List Name' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(mockUpdateListName).toHaveBeenCalledWith('Updated List Name');
    });
  });
});
