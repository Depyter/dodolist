import { afterEach, vi, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto';
// Set VITE_API_URL for tests to prevent config error
process.env.VITE_API_URL = 'http://127.0.0.1:8080';

// Mock window properties and methods
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock PocketBase
declare type UserModel = {
  id: string;
  email: string;
  username: string;
  verified: boolean;
  avatar: string;
};

export const mockAuthStore = {
  isValid: false,
  token: '',
  model: null as UserModel | null,
  save: vi.fn(),
  clear: vi.fn(),
  onChange: vi.fn(),
};

// Mocks for collection methods
export const mockCollectionCreate = vi.fn();
export const mockCollectionAuthWithPassword = vi.fn();
export const mockCollectionUpdate = vi.fn();
export const mockCollectionGetOne = vi.fn().mockResolvedValue({ yjsUpdate: '' });
export const mockCollectionGetFullList = vi.fn();
export const mockCollectionDelete = vi.fn();
export const mockCollectionSubscribe = vi.fn().mockReturnValue('subscription-id');
export const mockCollectionUnsubscribe = vi.fn();


// Mocks for users methods
export const mockUsersRequestPasswordReset = vi.fn().mockResolvedValue(undefined);
export const mockUsersConfirmPasswordReset = vi.fn().mockResolvedValue(undefined);
export const mockUsersRequestVerification = vi.fn().mockResolvedValue(undefined);
export const mockUsersConfirmVerification = vi.fn().mockResolvedValue(undefined);

export const pb = {
  authStore: mockAuthStore,
  collection: vi.fn((_collectionName: string) => ({
    create: mockCollectionCreate,
    authWithPassword: mockCollectionAuthWithPassword,
    update: mockCollectionUpdate,
    getOne: mockCollectionGetOne,
    getFullList: mockCollectionGetFullList,
    delete: mockCollectionDelete,
    subscribe: mockCollectionSubscribe,
    unsubscribe: mockCollectionUnsubscribe,
  })),
  users: {
    requestPasswordReset: mockUsersRequestPasswordReset,
    confirmPasswordReset: mockUsersConfirmPasswordReset,
    requestVerification: mockUsersRequestVerification,
    confirmVerification: mockUsersConfirmVerification,
  },
  realtime: {
    subscribe: vi.fn().mockReturnValue('realtime-subscription-id'),
    unsubscribe: vi.fn(),
    isConnected: true,
  },
};

vi.mock('pocketbase', () => ({
  default: vi.fn(() => pb),
}));

// Mock y-indexeddb globally for all tests
vi.mock('y-indexeddb', () => {
  // Helper to ensure all required methods exist
  function patchPersistenceInstance(instance: any) {
    if (typeof instance.on !== 'function') {
      instance.on = vi.fn((event, cb) => {
        if (event === 'synced') setTimeout(cb, 0);
      });
    }
    if (typeof instance.emit !== 'function') {
      instance.emit = vi.fn();
    }
    if (typeof instance.destroy !== 'function') {
      instance.destroy = vi.fn();
    }
    if (!('whenSynced' in instance)) {
      instance.whenSynced = Promise.resolve();
    }
    return instance;
  }

  const MockIndexeddbPersistence = vi.fn().mockImplementation((dbName, doc) => {
    const instance = {
      dbName,
      doc,
      on: vi.fn((event, cb) => {
        if (event === 'synced') setTimeout(cb, 0);
      }),
      emit: vi.fn(),
      destroy: vi.fn(),
      whenSynced: Promise.resolve(),
    };
    return patchPersistenceInstance(instance);
  });

  // Patch prototype for extra safety
  MockIndexeddbPersistence.prototype.on = vi.fn((event, cb) => {
    if (event === 'synced') setTimeout(cb, 0);
  });
  MockIndexeddbPersistence.prototype.emit = vi.fn();
  MockIndexeddbPersistence.prototype.destroy = vi.fn();
  MockIndexeddbPersistence.prototype.whenSynced = Promise.resolve();

  return {
    IndexeddbPersistence: MockIndexeddbPersistence,
  };
});

// Patch IndexeddbPersistence prototype to always have .destroy as a function
import * as yIndexeddb from 'y-indexeddb';
if (yIndexeddb.IndexeddbPersistence) {
  const proto = yIndexeddb.IndexeddbPersistence.prototype;
  if (typeof proto.destroy !== 'function') {
    proto.destroy = vi.fn();
  }
  proto.on = function(event, cb) {
    let listeners = Object.getOwnPropertyDescriptor(this, '__listeners')?.value;
    if (!listeners) {
      listeners = {};
      Object.defineProperty(this, '__listeners', {
        value: listeners,
        writable: true,
        enumerable: false,
        configurable: true
      });
    }
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
    if (event === 'synced') {
      setTimeout(() => cb(), 0);
    }
  };
  proto.emit = function(event, ...args) {
    const listeners = Object.getOwnPropertyDescriptor(this, '__listeners')?.value;
    if (listeners && listeners[event]) {
      for (const cb of listeners[event]) {
        cb(...args);
      }
    }
  };
}

// Defensive runtime patch for any instance missing destroy
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1024,
  })

  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: 768,
  })

  // Mock console methods to reduce noise in tests
  // vi.spyOn(console, 'log').mockImplementation(() => {})
  // vi.spyOn(console, 'warn').mockImplementation(() => {})
  // vi.spyOn(console, 'error').mockImplementation(() => {})
  
  // Reset mocks
  vi.clearAllMocks();
  mockAuthStore.isValid = false;
  mockAuthStore.token = '';
  mockAuthStore.model = null;
  
  const allMocks = [
    mockCollectionCreate,
    mockCollectionAuthWithPassword,
    mockCollectionUpdate,
    mockCollectionGetOne,
    mockCollectionGetFullList,
    mockCollectionDelete,
    mockCollectionSubscribe,
    mockCollectionUnsubscribe,
    mockUsersRequestPasswordReset,
    mockUsersConfirmPasswordReset,
    mockUsersRequestVerification,
    mockUsersConfirmVerification,
    pb.collection,
    pb.realtime.subscribe,
    pb.realtime.unsubscribe,
    mockAuthStore.save,
    mockAuthStore.clear,
    mockAuthStore.onChange,
  ];
  
  allMocks.forEach(mock => {
    if (mock && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Clean up after each test
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})