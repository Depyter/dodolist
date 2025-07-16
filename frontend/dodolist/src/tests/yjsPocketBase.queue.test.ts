import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { GlobalPocketBaseProvider } from '../services/yjsPocketBase';
import * as Y from 'yjs';
import './setup'; // Ensure global mocks are loaded

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
    // Clear the singleton instance for the next test
    (GlobalPocketBaseProvider as any).instance = null;
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