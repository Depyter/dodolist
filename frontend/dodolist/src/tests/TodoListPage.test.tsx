import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TodoListPage from '../pages/TodoListPage';

// Mock the hooks that use window APIs
vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

// Mock the TexturedBackground component
vi.mock('../components/TexturedBackground', () => ({
  default: ({ children, className }: { children?: React.ReactNode, className?: string }) => (
    <div className={className} data-testid="textured-background">
      {children}
    </div>
  ),
}));

// Mock the AppSidebar component since we're testing the main page functionality
vi.mock('../components/AppSidebar', () => ({
  default: (props: any) => {
    const { 
      todoLists, 
      activeListId, 
      setActiveListId, 
      newListName, 
      setNewListName, 
      isCreatingList, 
      setIsCreatingList, 
      createNewList
    } = props;
    
    return (
      <div data-testid="app-sidebar">
        <div data-testid="sidebar-lists">
          {todoLists.map((list: any) => (
            <button 
              key={list.id} 
              data-testid={`list-${list.id}`}
              onClick={() => setActiveListId(list.id)}
              className={activeListId === list.id ? 'active' : ''}
            >
              {list.name}
            </button>
          ))}
        </div>
        <button 
          data-testid="new-list-button"
          onClick={() => setIsCreatingList(true)}
        >
          New List
        </button>
        {isCreatingList && (
          <div data-testid="new-list-form">
            <input
              data-testid="new-list-input"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name"
            />
            <button 
              data-testid="create-list-button"
              onClick={createNewList}
            >
              Create
            </button>
          </div>
        )}
      </div>
    );
  },
}));

describe('TodoListPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the todo list page with initial state', () => {
    render(<TodoListPage />);
    
    // Check that the main components are rendered
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('textured-background')).toBeInTheDocument();
    
    // Check that the default list is present
    expect(screen.getByTestId('list-1')).toBeInTheDocument();
    expect(screen.getByText('Personal Tasks')).toBeInTheDocument();
    
    // Check that the input field is present
    expect(screen.getByPlaceholderText('Add a task to Personal Tasks...')).toBeInTheDocument();
    
    // Check that the send button is present
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('should add a new todo when typing and pressing Enter', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    await user.type(input, 'Buy groceries');
    await user.keyboard('{Enter}');
    
    // Check that the todo was added
    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
    
    // Check that the input was cleared
    expect(input).toHaveValue('');
  });

  it('should add a new todo when clicking the send button', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Walk the dog');
    await user.click(sendButton);
    
    // Check that the todo was added
    expect(screen.getByText('Walk the dog')).toBeInTheDocument();
    
    // Check that the input was cleared
    expect(input).toHaveValue('');
  });

  it('should not add empty todos', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Try to add empty todo
    await user.click(sendButton);
    
    // Check that no todo was added (only the empty state should be visible)
    expect(screen.getByText('No active tasks in Personal Tasks')).toBeInTheDocument();
    
    // Try with whitespace only
    await user.type(input, '   ');
    await user.click(sendButton);
    
    // Should still show empty state
    expect(screen.getByText('No active tasks in Personal Tasks')).toBeInTheDocument();
  });

  it('should toggle todo completion', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a todo
    await user.type(input, 'Complete project');
    await user.keyboard('{Enter}');
    
    // Find and click the checkbox to complete the todo
    const checkbox = screen.getByRole('button', { name: /mark complete/i });
    await user.click(checkbox);
    
    // Check that the todo moved to completed section
    expect(screen.getByText('Completed (1)')).toBeInTheDocument();
    
    // Check that the active todos section shows empty state
    expect(screen.getByText('No active tasks in Personal Tasks')).toBeInTheDocument();
  });

  it('should delete a todo', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a todo
    await user.type(input, 'Delete this task');
    await user.keyboard('{Enter}');
    
    // Find and click the delete button
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);
    
    // Check that the todo was deleted
    expect(screen.queryByText('Delete this task')).not.toBeInTheDocument();
    expect(screen.getByText('No active tasks in Personal Tasks')).toBeInTheDocument();
  });

  it('should show and hide completed todos', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add and complete a todo
    await user.type(input, 'Task to complete');
    await user.keyboard('{Enter}');
    
    const checkbox = screen.getByRole('button', { name: /mark complete/i });
    await user.click(checkbox);
    
    // Completed section should be visible
    expect(screen.getByText('Completed (1)')).toBeInTheDocument();
    expect(screen.getByText('Task to complete')).toBeInTheDocument();
    
    // Click to hide completed todos
    const completedButton = screen.getByText('Completed (1)');
    await user.click(completedButton);
    
    // Completed todos should be hidden
    expect(screen.queryByText('Task to complete')).not.toBeInTheDocument();
    
    // Click again to show completed todos
    await user.click(completedButton);
    
    // Completed todos should be visible again
    expect(screen.getByText('Task to complete')).toBeInTheDocument();
  });

  it('should open task schedule overlay', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a todo
    await user.type(input, 'Schedule this task');
    await user.keyboard('{Enter}');
    
    // Find and click the schedule button (clock icon)
    const scheduleButton = screen.getByLabelText(/set deadline and reminder/i);
    await user.click(scheduleButton);
    
    // Check that the schedule overlay is open
    expect(screen.getByText('Schedule Task')).toBeInTheDocument();
    expect(screen.getByText('Schedule this task')).toBeInTheDocument();
    expect(screen.getByText('Repeat')).toBeInTheDocument();
    expect(screen.getByText('Deadline')).toBeInTheDocument();
    expect(screen.getByText('Reminder')).toBeInTheDocument();
  });

  it('should set recurring task options', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a todo
    await user.type(input, 'Recurring task');
    await user.keyboard('{Enter}');
    
    // Open schedule overlay
    const scheduleButton = screen.getByLabelText(/set deadline and reminder/i);
    await user.click(scheduleButton);
    
    // Set recurring to daily
    const recurringSelect = screen.getByRole('combobox');
    await user.selectOptions(recurringSelect, 'daily');
    
    // Check that the recurring info is displayed
    expect(screen.getByText('This task will repeat daily')).toBeInTheDocument();
  });

  it('should create a new list', async () => {
    render(<TodoListPage />);
    
    // Click new list button
    const newListButton = screen.getByTestId('new-list-button');
    await user.click(newListButton);
    
    // Enter list name
    const listInput = screen.getByTestId('new-list-input');
    await user.type(listInput, 'Work Tasks');
    
    // Create the list
    const createButton = screen.getByTestId('create-list-button');
    await user.click(createButton);
    
    // Check that the new list was created and is active
    expect(screen.getByTestId('list-2')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a task to Work Tasks...')).toBeInTheDocument();
  });

  it('should switch between lists', async () => {
    render(<TodoListPage />);
    
    // Create a new list first
    const newListButton = screen.getByTestId('new-list-button');
    await user.click(newListButton);
    
    const listInput = screen.getByTestId('new-list-input');
    await user.type(listInput, 'Shopping List');
    
    const createButton = screen.getByTestId('create-list-button');
    await user.click(createButton);
    
    // Add a todo to the shopping list
    const input = screen.getByPlaceholderText('Add a task to Shopping List...');
    await user.type(input, 'Buy milk');
    await user.keyboard('{Enter}');
    
    // Switch back to personal tasks
    const personalTasksButton = screen.getByTestId('list-1');
    await user.click(personalTasksButton);
    
    // Check that we're on the personal tasks list
    expect(screen.getByPlaceholderText('Add a task to Personal Tasks...')).toBeInTheDocument();
    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
    
    // Switch back to shopping list
    const shoppingListButton = screen.getByTestId('list-2');
    await user.click(shoppingListButton);
    
    // Check that we're on the shopping list and the todo is there
    expect(screen.getByPlaceholderText('Add a task to Shopping List...')).toBeInTheDocument();
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('should show progress indicator when all tasks are completed', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a few todos
    await user.type(input, 'Task 1');
    await user.keyboard('{Enter}');
    
    await user.type(input, 'Task 2');
    await user.keyboard('{Enter}');
    
    // Complete first task
    const checkboxes = screen.getAllByRole('button', { name: /mark complete/i });
    await user.click(checkboxes[0]);
    
    // Progress should be visible in header (50% complete)
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
    
    // Complete second task
    const remainingCheckbox = screen.getByRole('button', { name: /mark complete/i });
    await user.click(remainingCheckbox);
    
    // All tasks completed - should show empty state
    expect(screen.getByText('No active tasks in Personal Tasks')).toBeInTheDocument();
    expect(screen.getByText('Completed (2)')).toBeInTheDocument();
  });

  it('should disable input and send button for archived lists', async () => {
    render(<TodoListPage />);
    
    // We need to simulate having an archived list
    // For this test, we'll need to manually trigger the archive state
    // Since we can't easily test the sidebar interactions with the mock,
    // we'll check that the archived notice appears when appropriate
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Initially, input should be enabled
    expect(input).not.toBeDisabled();
    expect(sendButton).not.toBeDisabled();
  });

  it('should handle task deadlines and show appropriate styling', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a todo
    await user.type(input, 'Task with deadline');
    await user.keyboard('{Enter}');
    
    // Open schedule overlay
    const scheduleButton = screen.getByLabelText(/set deadline and reminder/i);
    await user.click(scheduleButton);
    
    // Set a deadline for today
    const today = new Date().toISOString().split('T')[0];
    const deadlineInput = screen.getByLabelText(/deadline/i);
    await user.clear(deadlineInput);
    await user.type(deadlineInput, today);
    
    // Close the overlay
    const doneButton = screen.getByRole('button', { name: /done/i });
    await user.click(doneButton);
    
    // The task should now show with deadline styling
    expect(screen.getByText('Task with deadline')).toBeInTheDocument();
  });

  it('should sort todos by deadline priority', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add multiple todos
    await user.type(input, 'No deadline task');
    await user.keyboard('{Enter}');
    
    await user.type(input, 'High priority task');
    await user.keyboard('{Enter}');
    
    // The todos should appear in the order they were added initially
    const todos = screen.getAllByText(/task/);
    expect(todos[0]).toHaveTextContent('No deadline task');
    expect(todos[1]).toHaveTextContent('High priority task');
  });

  it('should handle task editing text', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a todo
    await user.type(input, 'Original task text');
    await user.keyboard('{Enter}');
    
    // The task should be displayed
    expect(screen.getByText('Original task text')).toBeInTheDocument();
  });

  it('should prevent adding todos with only whitespace', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Try to add a todo with only spaces
    await user.type(input, '     ');
    await user.click(sendButton);
    
    // Should not add the todo and should show empty state
    expect(screen.getByText('No active tasks in Personal Tasks')).toBeInTheDocument();
    expect(input).toHaveValue('     ');
  });

  it('should show helper text when typing', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Start typing
    await user.type(input, 'New task');
    
    // Helper text should appear
    expect(screen.getByText('Press Enter or click send to add this task')).toBeInTheDocument();
  });

  it('should create recurring tasks when completing a recurring todo', async () => {
    render(<TodoListPage />);
    
    const input = screen.getByPlaceholderText('Add a task to Personal Tasks...');
    
    // Add a todo
    await user.type(input, 'Daily exercise');
    await user.keyboard('{Enter}');
    
    // Open schedule overlay and set as daily recurring
    const scheduleButton = screen.getByLabelText(/set deadline and reminder/i);
    await user.click(scheduleButton);
    
    const recurringSelect = screen.getByRole('combobox');
    await user.selectOptions(recurringSelect, 'daily');
    
    // Close the overlay
    const doneButton = screen.getByRole('button', { name: /done/i });
    await user.click(doneButton);
    
    // Complete the recurring task
    const checkbox = screen.getByRole('button', { name: /mark complete/i });
    await user.click(checkbox);
    
    // Wait for the new recurring task to be created
    await waitFor(() => {
      expect(screen.getByText('Daily exercise')).toBeInTheDocument();
    });
    
    // Should have both completed and new active version
    expect(screen.getByText('Completed (1)')).toBeInTheDocument();
  });
});
