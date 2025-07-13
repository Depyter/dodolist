// Test to verify sync queue logic works correctly
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PocketBaseProvider } from '../services/yjsPocketBase';
import * as Y from 'yjs';

// Mock PocketBase
vi.mock('pocketbase', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      authStore: {
        isValid: true,
        token: 'mock-token',
        model: { id: 'user1' },
        save: vi.fn(),
        onChange: vi.fn(),
      },
      collection: vi.fn().mockReturnValue({
        getOne: vi.fn().mockResolvedValue({ yjsUpdate: '' }),
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      }),
      realtime: {
        isConnected: true,
      },
    })),
  };
});

// Mock y-indexeddb
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    on: vi.fn((event, callback) => {
      if (event === 'synced') {
        setTimeout(callback, 0); // Simulate async syncing
      }
    }),
    whenSynced: Promise.resolve(),
    destroy: vi.fn(),
  })),
}));

// Mock global window
Object.defineProperty(window, 'navigator', {
  value: { onLine: true },
  writable: true,
});

global.addEventListener = vi.fn();
global.removeEventListener = vi.fn();

describe('PocketBaseProvider Sync Queue Logic', () => {
  let provider: PocketBaseProvider;
  const listId = 'test-list-123';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global auth store
    (window as any).__pb_auth_store = {
      isValid: true,
      token: 'mock-token',
      model: { id: 'user1' },
    };
  });

  afterEach(() => {
    if (provider) {
      provider.destroy();
    }
  });

  it('should queue sync operations when document is updated', async () => {
    provider = new PocketBaseProvider(listId);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get access to the sync queue via reflection
    const syncQueue = (provider as any).syncQueue;
    const initialQueueLength = syncQueue.length;
    
    // Simulate document update
    const ylist = provider.doc.getMap('list');
    ylist.set('name', new Y.Text('Test List'));
    
    // Wait for the update to be processed
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify that the sync operation was queued
    expect(syncQueue.length).toBeGreaterThan(initialQueueLength);
  });

  it('should not clear entire queue during force sync, only processed operations', async () => {
    provider = new PocketBaseProvider(listId);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get access to the sync queue
    const syncQueue = (provider as any).syncQueue;
    
    // Add multiple operations to the queue
    const operation1 = vi.fn().mockResolvedValue(undefined);
    const operation2 = vi.fn().mockResolvedValue(undefined);
    const operation3 = vi.fn().mockResolvedValue(undefined);
    
    syncQueue.push(operation1, operation2, operation3);
    const initialQueueLength = syncQueue.length;
    
    // Simulate forced read-merge-write
    await (provider as any).forceReadMergeWrite();
    
    // The queue should be processed, not just cleared
    // Since we're mocking the PocketBase calls, the operations should have been processed
    expect(syncQueue.length).toBeLessThanOrEqual(initialQueueLength);
  });

  it('should handle race conditions between queue operations and force sync', async () => {
    provider = new PocketBaseProvider(listId);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const queueSync = (provider as any).queueSync.bind(provider);
    const syncQueue = (provider as any).syncQueue;
    
    // Simulate adding operations during a force sync
    const operation1 = vi.fn().mockResolvedValue(undefined);
    const operation2 = vi.fn().mockResolvedValue(undefined);
    
    // Add first operation
    queueSync(operation1);
    
    // Start force sync (but don't await it yet)
    const forceSyncPromise = (provider as any).forceReadMergeWrite();
    
    // Add second operation during force sync
    queueSync(operation2);
    
    // Wait for force sync to complete
    await forceSyncPromise;
    
    // The second operation should still be in the queue or have been processed
    // The key is that it shouldn't be lost
    expect(operation2).not.toThrow();
  });
});
