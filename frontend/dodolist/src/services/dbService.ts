// @ts-ignore
import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';



// Custom ID generation function to meet PocketBase requirements


class DbService {
  private promiser: any = null;
  private dbId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private storageType: 'opfs' | 'indexeddb' | 'memory' = 'memory';
  private pendingOperations: any[] = []; // Track pending operations

  constructor() {
    this.initPromise = this.initDb();
  }

  private async initDb(): Promise<void> {
    try {
      // console.log('Loading and initializing SQLite3 module...');
      
      // Initialize the SQLite WASM worker with promiser pattern
      this.promiser = await new Promise((resolve) => {
        const _promiser = sqlite3Worker1Promiser({
          onready: () => resolve(_promiser),
        });
      });
      
      // console.log('Done initializing. Running demo...');
      
      // Get SQLite version info
      const configResponse = await this.promiser('config-get', {});
      // console.log('Running SQLite3 version', configResponse.result.version.libVersion);
      
      // Try to open database with OPFS persistence first
      await this.initializeDatabase();
      
      // Emit storage info
      this.emitStorageInfo();
      
      // console.log('Database initialization complete');
      
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
        // console.log('Using OPFS storage for persistence');
        // console.log('OPFS database created at:', openResponse.result.filename.replace(/^file:(.*?)\?vfs=opfs$/, '$1'));
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
        // console.log('Using IndexedDB storage for persistence');
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
        // console.log('Using in-memory storage (data will not persist)');
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

  

  private emitStorageInfo(): void {
    if (typeof window === 'undefined') return;
    
    const persistent = this.storageType !== 'memory';
    
    // console.log('Storage persistence info:', {
    //   storageType: this.storageType,
    //   persistent,
    //   dbType: 'worker-based'
    // });
    
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

  // Add a method to check for pending operations
  hasPendingOperations(): boolean {
    return this.pendingOperations.length > 0;
  }

  // Todo Lists Methods
  

  

  

  
  
  

  

  

  // Todo Items Methods
  

  

  

  

  

  

  

  // Initialize with default data if needed
  

  

  

  // Utility: Delete the OPFS SQLite database file (if using OPFS in browser)
  async deleteOpfsDatabase(dbName: string = 'dodolist.sqlite3'): Promise<boolean> {
    if (!('navigator' in window) || !('storage' in navigator) || typeof (navigator.storage as any).getDirectory !== 'function') {
      console.warn('OPFS is not supported in this browser.');
      return false;
    }
    try {
      // @ts-ignore: OPFS API is not yet in TypeScript
      const root = await (navigator.storage as any).getDirectory();
      // Try to get the file handle
      try {
        await root.getFileHandle(dbName, { create: false });
      } catch (e) {
        // File does not exist
        console.warn(`OPFS database file '${dbName}' does not exist.`);
        return false;
      }
      await root.removeEntry(dbName);
      // console.log(`OPFS database file '${dbName}' deleted.`);
      return true;
    } catch (err) {
      console.error('Failed to delete OPFS database:', err);
      return false;
    }
  }
}

// Create a singleton instance
const dbService = new DbService();

// Expose dbService to window for debugging in browser console
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.dbService = dbService;
}

export default dbService;
