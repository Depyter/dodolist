import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { GlobalPocketBaseProvider } from '../services/yjsPocketBase';
import * as Y from 'yjs';

// Mock PocketBase with synchronous responses
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

// Mock y-indexeddb with immediate sync
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation((_name, doc) => {
    // Trigger sync immediately
    if (doc && typeof doc.emit === 'function') {
      doc.emit('synced', []);
    }
    return {
      on: vi.fn((event, callback) => {
        if (event === 'synced') {
          callback();
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
    vi.useRealTimers();
  });

  it('should queue sync operations when document is updated', () => {
    const docProvider = globalProvider.getDocumentProvider(listId);

    // Get the document instance - should be immediately available
    const docInstance = (globalProvider as any).documents.get(listId);
    expect(docInstance).toBeDefined();
    expect(docInstance.persistence).toBeDefined();

    const initialQueueLength = docInstance.syncQueue.length;

    // Simulate document update
    act(() => {
      docProvider.doc.transact(() => {
        const ylist = docProvider.doc.getMap('list');
        ylist.set('name', new Y.Text('Test List'));
      });
    });

    // Check that the sync queue was updated
    expect(docInstance.syncQueue.length).toBeGreaterThan(initialQueueLength);
  });
});