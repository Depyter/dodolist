import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { waitFor, act } from '@testing-library/react';
import { GlobalPocketBaseProvider } from '../services/yjsPocketBase';
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
        subscribe: vi.fn().mockResolvedValue(() => {}),
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
  IndexeddbPersistence: vi.fn().mockImplementation((_name, doc) => {
    setTimeout(() => {
      if (doc && typeof doc.emit === 'function') {
        doc.emit('synced', []);
      }
    }, 0);
    return {
      on: vi.fn((event, callback) => {
        if (event === 'synced') {
          setTimeout(callback, 0);
        }
      }),
      whenSynced: Promise.resolve(),
      destroy: vi.fn(),
    };
  }),
}));

// Mock global window
Object.defineProperty(window, 'navigator', {
  value: { onLine: true },
  writable: true,
});

global.addEventListener = vi.fn();
global.removeEventListener = vi.fn();

describe('PocketBaseProvider Sync Queue Logic', () => {
  let globalProvider: GlobalPocketBaseProvider;
  const listId = 'test-list-123';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Mock global auth store
    (window as any).__pb_auth_store = {
      isValid: true,
      token: 'mock-token',
      model: { id: 'user1' },
    };
    globalProvider = GlobalPocketBaseProvider.getInstance();
  });

  afterEach(() => {
    globalProvider.destroy();
  });

  it('should queue sync operations when document is updated', async () => {
    const docProvider = globalProvider.getDocumentProvider(listId);

    // Wait for docInstance and persistence to be ready
    let docInstance: any;
    await waitFor(() => {
      docInstance = (globalProvider as any).documents.get(listId);
      expect(docInstance).toBeDefined();
      expect(docInstance.persistence).toBeDefined();
    });

    // Wait for persistence to be synced by running timers and flushing promises
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const initialQueueLength = docInstance.syncQueue.length;

    // Simulate document update
    act(() => {
      docProvider.doc.transact(() => {
        const ylist = docProvider.doc.getMap('list');
        ylist.set('name', new Y.Text('Test List'));
      });
    });

    // Run timers to process the 'update' handler and queueing logic
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Wait for the syncQueue to be incremented
    await waitFor(() => {
      expect(docInstance.syncQueue.length).toBeGreaterThan(initialQueueLength);
    });
  }, 60000);
});