// @ts-ignore
import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';

export interface Todo {
  id: string;
  text: string;
  description?: string;
  completed: boolean;
  createdAt: string; // ISO string
  completedAt?: string; // ISO string
  deadline?: string; // ISO string
  reminder?: string; // ISO string
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly';
  listId: string;
}

export interface TodoList {
  id: string;
  name: string;
  color: string;
  createdAt: string; // ISO string
  pinned?: boolean;
  archived?: boolean;
}

class DbService {
  private promiser: any = null;
  private dbId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private storageType: 'opfs' | 'indexeddb' | 'memory' = 'memory';

  constructor() {
    this.initPromise = this.initDb();
  }

  private async initDb(): Promise<void> {
    try {
      console.log('Loading and initializing SQLite3 module...');
      
      // Initialize the SQLite WASM worker with promiser pattern
      this.promiser = await new Promise((resolve) => {
        const _promiser = sqlite3Worker1Promiser({
          onready: () => resolve(_promiser),
        });
      });
      
      console.log('Done initializing. Running demo...');
      
      // Get SQLite version info
      const configResponse = await this.promiser('config-get', {});
      console.log('Running SQLite3 version', configResponse.result.version.libVersion);
      
      // Try to open database with OPFS persistence first
      await this.initializeDatabase();
      
      // Create tables
      await this.createTables();
      
      // Emit storage info
      this.emitStorageInfo();
      
      console.log('Database initialization complete');
      
    } catch (error: any) {
      console.error('Failed to initialize SQLite WASM:', error);
      
      // More detailed error logging
      if (error.message?.includes('magic number')) {
        console.error('WASM magic number error - this usually means:');
        console.error('1. WASM file is corrupted or not found');
        console.error('2. CORS issues preventing WASM loading');
        console.error('3. Incorrect Content-Type headers for WASM files');
        console.error('4. Module bundler configuration issues');
      }
      
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  private async initializeDatabase(): Promise<void> {
    let dbCreated = false;
    let storageType: 'opfs' | 'indexeddb' | 'memory' = 'memory';
    
    // Try OPFS first (best persistence)
    if (!dbCreated) {
      try {
        const openResponse = await this.promiser('open', {
          filename: 'file:dodolist.sqlite3?vfs=opfs',
        });
        this.dbId = openResponse.dbId;
        storageType = 'opfs';
        console.log('Using OPFS storage for persistence');
        console.log('OPFS database created at:', openResponse.result.filename.replace(/^file:(.*?)\?vfs=opfs$/, '$1'));
        dbCreated = true;
      } catch (opfsError) {
        console.warn('OPFS database creation failed:', opfsError);
      }
    }
    
    // Try IndexedDB VFS fallback
    if (!dbCreated) {
      try {
        const openResponse = await this.promiser('open', {
          filename: 'file:dodolist.sqlite3?vfs=kvvfs',
        });
        this.dbId = openResponse.dbId;
        storageType = 'indexeddb';
        console.log('Using IndexedDB storage for persistence');
        dbCreated = true;
      } catch (kvvfsError) {
        console.warn('IndexedDB VFS creation failed:', kvvfsError);
      }
    }
    
    // Fallback to in-memory database
    if (!dbCreated) {
      try {
        const openResponse = await this.promiser('open', {
          filename: ':memory:',
        });
        this.dbId = openResponse.dbId;
        storageType = 'memory';
        console.log('Using in-memory storage (data will not persist)');
        console.warn('⚠️ WARNING: Data will be lost when page is refreshed!');
        dbCreated = true;
      } catch (memoryError) {
        console.error('Even memory database creation failed:', memoryError);
        throw new Error('Cannot create any type of SQLite database');
      }
    }
    
    // Store the storage type for later use in emitStorageInfo
    this.storageType = storageType;
  }

  private async createTables(): Promise<void> {
    if (!this.dbId) {
      throw new Error('Database not initialized');
    }

    try {
      await this.promiser('exec', {
        dbId: this.dbId,
        sql: `
          CREATE TABLE IF NOT EXISTS todo_lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            created_at TEXT NOT NULL,
            pinned INTEGER DEFAULT 0,
            archived INTEGER DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            list_id TEXT NOT NULL,
            text TEXT NOT NULL,
            description TEXT,
            completed INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            deadline TEXT,
            reminder TEXT,
            recurring TEXT DEFAULT 'none',
            FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE CASCADE
          );
          
          -- Create indexes for better performance
          CREATE INDEX IF NOT EXISTS idx_todos_list_id ON todos(list_id);
          CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
          CREATE INDEX IF NOT EXISTS idx_todos_deadline ON todos(deadline);
        `
      });
      
      console.log('Database tables created successfully');
    } catch (error: any) {
      console.error('Error creating database tables:', error);
      throw new Error(`Failed to create database tables: ${error.message}`);
    }
  }

  private emitStorageInfo(): void {
    if (typeof window === 'undefined') return;
    
    const persistent = this.storageType !== 'memory';
    
    console.log('Storage persistence info:', {
      storageType: this.storageType,
      persistent,
      dbType: 'worker-based'
    });
    
    window.dispatchEvent(new CustomEvent('dodolist-storage-info', {
      detail: {
        type: 'persistence-info',
        storageType: this.storageType,
        persistent,
        dbType: 'worker-based'
      }
    }));
  }

  async ready(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initDb();
    }
    await this.initPromise;
  }

  // Helper method to execute database operations safely
  private async safeDbOperation<T>(
    operation: () => Promise<T>, 
    fallback: T, 
    errorMessage: string
  ): Promise<T> {
    try {
      await this.ready();
      
      if (!this.dbId) {
        console.error(`${errorMessage}: Database not initialized`);
        return fallback;
      }
      
      return await operation();
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      return fallback;
    }
  }

  // Todo Lists Methods
  async getAllLists(): Promise<TodoList[]> {
    return this.safeDbOperation<TodoList[]>(
      async () => {
        const result = await this.promiser('exec', {
          dbId: this.dbId,
          sql: `SELECT id, name, color, created_at, pinned, archived 
                FROM todo_lists 
                ORDER BY pinned DESC, created_at DESC`,
          returnValue: 'resultRows'
        });
        
        return result.result.resultRows.map((row: any) => ({
          id: row[0],
          name: row[1],
          color: row[2],
          createdAt: row[3],
          pinned: Boolean(row[4]),
          archived: Boolean(row[5])
        }));
      },
      [],
      'Error getting todo lists'
    );
  }

  async createList(list: TodoList): Promise<void> {
    return this.safeDbOperation<void>(
      async () => {
        await this.promiser('exec', {
          dbId: this.dbId,
          sql: `INSERT INTO todo_lists (id, name, color, created_at, pinned, archived) 
                VALUES (?, ?, ?, ?, ?, ?)`,
          bind: [
            list.id,
            list.name,
            list.color,
            list.createdAt,
            list.pinned ? 1 : 0,
            list.archived ? 1 : 0
          ]
        });
      },
      undefined,
      'Error creating todo list'
    );
  }

  async updateList(list: TodoList): Promise<void> {
    return this.safeDbOperation<void>(
      async () => {
        await this.promiser('exec', {
          dbId: this.dbId,
          sql: `UPDATE todo_lists SET
                name = ?,
                color = ?,
                pinned = ?,
                archived = ?
                WHERE id = ?`,
          bind: [
            list.name,
            list.color,
            list.pinned ? 1 : 0,
            list.archived ? 1 : 0,
            list.id
          ]
        });
      },
      undefined,
      'Error updating todo list'
    );
  }

  async deleteList(listId: string): Promise<void> {
    return this.safeDbOperation<void>(
      async () => {
        await this.promiser('exec', {
          dbId: this.dbId,
          sql: 'BEGIN TRANSACTION'
        });
        
        try {
          // Delete todos first (foreign key constraint)
          await this.promiser('exec', {
            dbId: this.dbId,
            sql: 'DELETE FROM todos WHERE list_id = ?',
            bind: [listId]
          });
          
          // Delete the list
          await this.promiser('exec', {
            dbId: this.dbId,
            sql: 'DELETE FROM todo_lists WHERE id = ?',
            bind: [listId]
          });
          
          await this.promiser('exec', {
            dbId: this.dbId,
            sql: 'COMMIT'
          });
        } catch (error) {
          await this.promiser('exec', {
            dbId: this.dbId,
            sql: 'ROLLBACK'
          });
          throw error;
        }
      },
      undefined,
      'Error deleting todo list'
    );
  }

  // Todo Items Methods
  async getTodosForList(listId: string): Promise<Todo[]> {
    return this.safeDbOperation<Todo[]>(
      async () => {
        const result = await this.promiser('exec', {
          dbId: this.dbId,
          sql: `SELECT id, list_id, text, description, completed, created_at, 
                       completed_at, deadline, reminder, recurring
                FROM todos 
                WHERE list_id = ? 
                ORDER BY completed ASC, 
                         CASE WHEN deadline IS NULL THEN 1 ELSE 0 END,
                         deadline ASC`,
          bind: [listId],
          returnValue: 'resultRows'
        });
        
        return result.result.resultRows.map((row: any) => ({
          id: row[0],
          listId: row[1],
          text: row[2],
          description: row[3] || undefined,
          completed: Boolean(row[4]),
          createdAt: row[5],
          completedAt: row[6] || undefined,
          deadline: row[7] || undefined,
          reminder: row[8] || undefined,
          recurring: row[9] || 'none'
        }));
      },
      [],
      `Error getting todos for list ${listId}`
    );
  }

  async createTodo(todo: Todo): Promise<void> {
    return this.safeDbOperation<void>(
      async () => {
        await this.promiser('exec', {
          dbId: this.dbId,
          sql: `INSERT INTO todos (
                  id, list_id, text, description, completed, 
                  created_at, completed_at, deadline, reminder, recurring
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            todo.id,
            todo.listId,
            todo.text,
            todo.description || null,
            todo.completed ? 1 : 0,
            todo.createdAt,
            todo.completedAt || null,
            todo.deadline || null,
            todo.reminder || null,
            todo.recurring || 'none'
          ]
        });
      },
      undefined,
      'Error creating todo'
    );
  }

  async updateTodo(todo: Todo): Promise<void> {
    return this.safeDbOperation<void>(
      async () => {
        await this.promiser('exec', {
          dbId: this.dbId,
          sql: `UPDATE todos SET
                  text = ?,
                  description = ?,
                  completed = ?,
                  completed_at = ?,
                  deadline = ?,
                  reminder = ?,
                  recurring = ?
                WHERE id = ?`,
          bind: [
            todo.text,
            todo.description || null,
            todo.completed ? 1 : 0,
            todo.completedAt || null,
            todo.deadline || null,
            todo.reminder || null,
            todo.recurring || 'none',
            todo.id
          ]
        });
      },
      undefined,
      `Error updating todo ${todo.id}`
    );
  }

  async deleteTodo(todoId: string): Promise<void> {
    return this.safeDbOperation<void>(
      async () => {
        await this.promiser('exec', {
          dbId: this.dbId,
          sql: 'DELETE FROM todos WHERE id = ?',
          bind: [todoId]
        });
      },
      undefined,
      `Error deleting todo ${todoId}`
    );
  }

  // Initialize with default data if needed
  async initializeDefaultData(): Promise<void> {
    return this.safeDbOperation<void>(
      async () => {
        const lists = await this.getAllLists();
        
        if (lists.length === 0) {
          const defaultList: TodoList = {
            id: crypto.randomUUID(),
            name: "Personal Tasks",
            color: "bg-blue-500",
            createdAt: new Date().toISOString(),
            pinned: false,
            archived: false
          };
          
          await this.createList(defaultList);
          
          const sampleTask: Todo = {
            id: crypto.randomUUID(),
            listId: defaultList.id,
            text: "Welcome to DodoList!",
            description: "This is a sample task to get you started. You can edit or delete it.",
            completed: false,
            createdAt: new Date().toISOString(),
            recurring: "none"
          };
          
          await this.createTodo(sampleTask);
          
          console.log('Initialized default list and sample task');
        }
      },
      undefined,
      'Error initializing default data'
    );
  }
}

// Create a singleton instance
const dbService = new DbService();

// Initialize default data when the service is first created
dbService.ready()
  .then(() => dbService.initializeDefaultData())
  .catch(err => console.error('Failed to initialize default data:', err));

export default dbService;