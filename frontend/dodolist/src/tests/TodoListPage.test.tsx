/// <reference types="vitest" />
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, beforeEach, vi, expect } from 'vitest';
import TodoListPage from '../pages/TodoListPage';
import { usePersistentTodoLists } from '../services/todoService';
import AuthService from '../services/authService';
import * as ReactRouterDom from 'react-router-dom';
import type { Mock } from 'vitest';

// Mock the usePersistentTodoLists hook
vi.mock('@/services/todoService', () => ({
  usePersistentTodoLists: vi.fn(),
}));

// Mock useIsMobile hook
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

// Mock dbService to prevent SQLite WASM errors
vi.mock('@/services/dbService', () => ({
  default: {
    initializeDefaultData: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock AuthService
vi.mock('@/services/authService', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    getCurrentUser: vi.fn(() => ({ id: 'user123' })),
    logout: vi.fn(),
  })),
}));

// Mock react-router-dom hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
    useParams: vi.fn(),
  };
});

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const mockTodoLists = [
  {
    id: 'list1',
    name: 'My Day',
    color: 'bg-blue-500',
    todos: [
      { id: 'todo1', text: 'Buy groceries', completed: false, createdAt: new Date(), listId: 'list1' },
      { id: 'todo2', text: 'Walk the dog', completed: true, createdAt: new Date(), listId: 'list1' },
    ],
    createdAt: new Date(),
    pinned: false,
    archived: false,
  },
  {
    id: 'list2',
    name: 'Work Tasks',
    color: 'bg-emerald-500',
    todos: [
      { id: 'todo3', text: 'Finish report', completed: false, createdAt: new Date(), listId: 'list2' },
    ],
    createdAt: new Date(),
    pinned: false,
    archived: false,
  },
];

// Helper for fail in tests
function fail(message: string): never {
  throw new Error(message);
}

describe('TodoListPage', () => {
  const mockSetActiveListId = vi.fn();
  const mockAddTodo = vi.fn();
  const mockToggleTodo = vi.fn();
  const mockDeleteTodo = vi.fn();
  const mockUpdateTodo = vi.fn();
  const mockCreateNewList = vi.fn();
  const mockUpdateList = vi.fn();
  const mockDeleteList = vi.fn();
  const mockLoadTodoLists = vi.fn();
  const mockBatchAddTodos = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (usePersistentTodoLists as Mock).mockReturnValue({
      todoLists: mockTodoLists,
      loading: false,
      error: null,
      activeListId: 'list1',
      setActiveListId: mockSetActiveListId,
      createNewList: mockCreateNewList,
      updateList: mockUpdateList,
      deleteList: mockDeleteList,
      addTodo: mockAddTodo,
      updateTodo: mockUpdateTodo,
      toggleTodo: mockToggleTodo,
      deleteTodo: mockDeleteTodo,
      loadTodoLists: mockLoadTodoLists,
      batchAddTodos: mockBatchAddTodos,
    });

    (ReactRouterDom.useNavigate as Mock).mockReturnValue(mockNavigate);
    (ReactRouterDom.useParams as Mock).mockReturnValue({ listId: 'list1' });
  });

  function renderWithRouter(ui: React.ReactNode, { route = '/list/list1', path = '/list/:listId' } = {}) {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    );
  }

  const renderComponent = () =>
    renderWithRouter(<TodoListPage />);

  it('renders without crashing', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: 'My Day' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a task to My Day...')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    (usePersistentTodoLists as Mock).mockReturnValueOnce({
      todoLists: [],
      loading: true,
      error: null,
      activeListId: '',
      setActiveListId: mockSetActiveListId,
      createNewList: mockCreateNewList,
      updateList: mockUpdateList,
      deleteList: mockDeleteList,
      addTodo: mockAddTodo,
      updateTodo: mockUpdateTodo,
      toggleTodo: mockToggleTodo,
      deleteTodo: mockDeleteTodo,
      loadTodoLists: mockLoadTodoLists,
      batchAddTodos: mockBatchAddTodos,
    });
    renderComponent();
    expect(screen.getByText(/Loading your tasks/i)).toBeInTheDocument();
  });

  it('displays error state', () => {
    (usePersistentTodoLists as Mock).mockReturnValueOnce({
      todoLists: [],
      loading: false,
      error: new Error('Network error'),
      activeListId: '',
      setActiveListId: mockSetActiveListId,
      createNewList: mockCreateNewList,
      updateList: mockUpdateList,
      deleteList: mockDeleteList,
      addTodo: mockAddTodo,
      updateTodo: mockUpdateTodo,
      toggleTodo: mockToggleTodo,
      deleteTodo: mockDeleteTodo,
      loadTodoLists: mockLoadTodoLists,
      batchAddTodos: mockBatchAddTodos,
    });
    renderComponent();
    expect(screen.getByText(/Error Loading Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Network error/i)).toBeInTheDocument();
  });

  it('adds a new todo', async () => {
    renderComponent();
    const input = screen.getByPlaceholderText('Add a task to My Day...');
    const addButton = screen.getByRole('button', { name: 'Add task' });

    fireEvent.change(input, { target: { value: 'New Task' } });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockAddTodo).toHaveBeenCalledWith({ text: 'New Task', listId: 'list1' });
    });
    expect(input).toHaveValue(''); // Input should be cleared
  });

  it('toggles todo completion', async () => {
    renderComponent();
    const todoItem = screen.getByText('Buy groceries');
    const taskCard = todoItem.closest('.p-3') as HTMLElement | null;
    if (!taskCard) fail('Task card not found for "Buy groceries"');
    const toggleButton = within(taskCard).getByRole('button', { name: 'Toggle completion' });

    fireEvent.click(toggleButton);
    await waitFor(() => {
      expect(mockToggleTodo).toHaveBeenCalledWith('todo1', 'list1');
    });
  });

  it('deletes a todo', async () => {
    renderComponent();
    const todoItem = screen.getByText('Buy groceries');
    const taskCard = todoItem.closest('.p-3');
    if (!taskCard) fail('Task card not found for "Buy groceries"');
    const deleteButton = within(taskCard as HTMLElement).getByTitle('Delete task');

    fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(mockDeleteTodo).toHaveBeenCalledWith('todo1', 'list1');
    });
  });

  it('clones a list', async () => {
    mockCreateNewList.mockResolvedValueOnce('newListId'); // Mock the new list ID
    renderComponent();

    const cloneButton = screen.getByRole('button', { name: /clone list/i });
    fireEvent.click(cloneButton);

    await waitFor(() => {
      expect(mockCreateNewList).toHaveBeenCalledWith('My Day (Copy)', 'bg-blue-500');
    });

    await waitFor(() => {
      expect(mockBatchAddTodos).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ text: 'Buy groceries', listId: 'newListId', completed: false }),
          expect.objectContaining({ text: 'Walk the dog', listId: 'newListId', completed: false }),
        ])
      );
    });
  });

  it('updates list name', async () => {
    renderComponent();
    const listNameElement = screen.getByRole('heading', { name: 'My Day' });
    fireEvent.click(listNameElement); // Enter edit mode

    const input = screen.getByDisplayValue('My Day');
    fireEvent.change(input, { target: { value: 'My Awesome Day' } });
    fireEvent.blur(input); // Exit edit mode

    await waitFor(() => {
      expect(mockUpdateList).toHaveBeenCalledWith('list1', { name: 'My Awesome Day' });
    });
  });

  it('toggles list pin status', async () => {
    renderComponent();
    const header = screen.getByRole('banner');
    const moreOptionsButton = within(header).getByRole('button', { name: /more list options/i });
    fireEvent.click(moreOptionsButton);

    const pinMenuItem = screen.getByRole('menuitem', { name: /pin list/i });
    fireEvent.click(pinMenuItem);

    await waitFor(() => {
      expect(mockUpdateList).toHaveBeenCalledWith('list1', { pinned: true });
    });
  });

  it('toggles list archive status', async () => {
    renderComponent();
    const header = screen.getByRole('banner');
    const moreOptionsButton = within(header).getByRole('button', { name: /more list options/i });
    fireEvent.click(moreOptionsButton);

    const archiveMenuItem = screen.getByRole('menuitem', { name: /archive list/i });
    fireEvent.click(archiveMenuItem);

    await waitFor(() => {
      expect(mockUpdateList).toHaveBeenCalledWith('list1', { archived: true });
    });
  });

  it('changes list color', async () => {
    renderComponent();
    const header = screen.getByRole('banner');
    const moreOptionsButton = within(header).getByRole('button', { name: /more list options/i });
    fireEvent.click(moreOptionsButton);

    const changeColorMenuItem = screen.getByText('Change Color');
    fireEvent.click(changeColorMenuItem);

    const emeraldColorButton = screen.getByRole('button', { name: /emerald-500/i }); // Assuming a button for emerald color
    fireEvent.click(emeraldColorButton);

    await waitFor(() => {
      expect(mockUpdateList).toHaveBeenCalledWith('list1', { color: 'bg-emerald-500' });
    });
  });

  it('deletes a list', async () => {
    // Ensure there's more than one list to allow deletion
    (usePersistentTodoLists as Mock).mockReturnValueOnce({
      todoLists: [
        { ...mockTodoLists[0], id: 'list1' },
        { ...mockTodoLists[1], id: 'list2' },
      ],
      loading: false,
      error: null,
      activeListId: 'list1',
      setActiveListId: mockSetActiveListId,
      createNewList: mockCreateNewList,
      updateList: mockUpdateList,
      deleteList: mockDeleteList,
      addTodo: mockAddTodo,
      updateTodo: mockUpdateTodo,
      toggleTodo: mockToggleTodo,
      deleteTodo: mockDeleteTodo,
      loadTodoLists: mockLoadTodoLists,
      batchAddTodos: mockBatchAddTodos,
    });

    renderComponent();
    const header = screen.getByRole('banner');
    const moreOptionsButton = within(header).getByRole('button', { name: /more list options/i });
    fireEvent.click(moreOptionsButton);

    const deleteMenuItem = screen.getByText('Delete');
    fireEvent.click(deleteMenuItem);

    await waitFor(() => {
      expect(mockDeleteList).toHaveBeenCalledWith('list1');
    });
  });

  it('handles logout', async () => {
    renderComponent();
    const sidebar = screen.getByRole('navigation'); // Assuming AppSidebar has a navigation role
    const logoutButton = within(sidebar).getByRole('button', { name: /logout/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      // Use vi.mocked to access the mock instance
      expect(vi.mocked(AuthService).mock.results[0].value.logout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
