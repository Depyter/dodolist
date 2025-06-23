
-- Task Management System Database Schema

-- Task Lists table
CREATE TABLE task_lists (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#007bff', -- Hex color code
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    task_list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    remind_date TIMESTAMP,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX idx_task_lists_user_id ON task_lists(user_id);
CREATE INDEX idx_tasks_task_list_id ON tasks(task_list_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_remind_date ON tasks(remind_date);
CREATE INDEX idx_tasks_is_completed ON tasks(is_completed);

-- Example data
INSERT INTO users (username, email, password_hash) VALUES 
('john_doe', 'john@example.com', 'hashed_password_123');

INSERT INTO task_lists (user_id, title, color) VALUES 
(1, 'Work Projects', '#ff6b6b'),
(1, 'Personal Tasks', '#4ecdc4'),
(1, 'Shopping List', '#45b7d1');

INSERT INTO tasks (task_list_id, title, description, due_date, remind_date, is_completed) VALUES 
(1, 'Complete project proposal', 'Draft and submit the Q2 project proposal', '2025-06-30 17:00:00', '2025-06-29 09:00:00', FALSE),
(1, 'Team meeting preparation', 'Prepare slides for weekly team sync', '2025-06-24 10:00:00', '2025-06-23 20:00:00', FALSE),
(2, 'Doctor appointment', 'Annual checkup with Dr. Smith', '2025-07-05 14:30:00', '2025-07-04 09:00:00', FALSE),
(2, 'Call mom', 'Weekly catch-up call', '2025-06-25 19:00:00', '2025-06-25 18:00:00', TRUE),
(3, 'Buy groceries', 'Milk, bread, eggs, vegetables', NULL, NULL, FALSE);