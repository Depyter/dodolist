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
export const mockCollectionUpdate = vi.fn(); // For update method

// Mocks for users methods
export const mockUsersRequestPasswordReset = vi.fn().mockResolvedValue(undefined);
export const mockUsersConfirmPasswordReset = vi.fn().mockResolvedValue(undefined);
export const mockUsersRequestVerification = vi.fn().mockResolvedValue(undefined);
export const mockUsersConfirmVerification = vi.fn().mockResolvedValue(undefined);

export const pb = {
  authStore: mockAuthStore,
  collection: vi.fn((collectionName: string) => {
    if (collectionName === 'users') {
      return {
        create: mockCollectionCreate,
        authWithPassword: mockCollectionAuthWithPassword,
        update: mockCollectionUpdate,
        requestPasswordReset: mockUsersRequestPasswordReset,
        confirmPasswordReset: mockUsersConfirmPasswordReset,
        requestVerification: mockUsersRequestVerification,
        confirmVerification: mockUsersConfirmVerification,
      };
    }
    // Default return for other collections if needed
    return {
      create: vi.fn(),
      authWithPassword: vi.fn(),
      update: vi.fn(),
    };
  }),
  realtime: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
};

vi.mock('pocketbase', () => ({
  default: vi.fn(() => pb),
}));

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
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
