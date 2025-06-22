import { describe, it, expect, beforeEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import { PB_URL } from '../config'

// Create a proper mock implementation
const mockAuthStore = {
  isValid: false,
  model: null,
  token: null,
  clear: vi.fn()
}

// Mock PocketBase with proper structure
vi.mock('pocketbase', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        collection: vi.fn(),
        authStore: mockAuthStore
      }
    })
  }
})

describe('PocketBase Authentication', () => {
  let pb: PocketBase
  
  beforeEach(() => {
    pb = new PocketBase(PB_URL)
    vi.clearAllMocks()
  })

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'test-id',
        email: 'test@example.com',
        username: 'testuser',
        verified: false
      }

      // Mock the create method
      const mockCreate = vi.fn().mockResolvedValue(mockUser)
      pb.collection = vi.fn().mockReturnValue({
        create: mockCreate
      })

      const userData = {
        email: 'test@example.com',
        password: 'testpassword123',
        passwordConfirm: 'testpassword123',
        username: 'testuser'
      }

      const result = await pb.collection('users').create(userData)

      expect(mockCreate).toHaveBeenCalledWith(userData)
      expect(result).toEqual(mockUser)
    })

    it('should handle registration errors', async () => {
      const mockError = new Error('Email already exists')
      
      const mockCreate = vi.fn().mockRejectedValue(mockError)
      pb.collection = vi.fn().mockReturnValue({
        create: mockCreate
      })

      const userData = {
        email: 'existing@example.com',
        password: 'testpassword123',
        passwordConfirm: 'testpassword123',
        username: 'existinguser'
      }

      await expect(pb.collection('users').create(userData)).rejects.toThrow('Email already exists')
    })
  })

  describe('User Login', () => {
    it('should login user with email and password', async () => {
      const mockAuthData = {
        token: 'mock-jwt-token',
        record: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser'
        }
      }

      const mockAuthWithPassword = vi.fn().mockResolvedValue(mockAuthData)
      pb.collection = vi.fn().mockReturnValue({
        authWithPassword: mockAuthWithPassword
      })

      const result = await pb.collection('users').authWithPassword('test@example.com', 'testpassword123')

      expect(mockAuthWithPassword).toHaveBeenCalledWith('test@example.com', 'testpassword123')
      expect(result).toEqual(mockAuthData)
    })

    it('should handle invalid credentials', async () => {
      const mockError = new Error('Invalid credentials')
      
      const mockAuthWithPassword = vi.fn().mockRejectedValue(mockError)
      pb.collection = vi.fn().mockReturnValue({
        authWithPassword: mockAuthWithPassword
      })

      await expect(
        pb.collection('users').authWithPassword('wrong@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials')
    })
  })

  describe('Authentication State', () => {
    it('should check if user is authenticated', () => {
      // Now we can directly modify the mock
      mockAuthStore.isValid = true
      expect(pb.authStore.isValid).toBe(true)
    })

    it('should logout user', () => {
      pb.authStore.clear()
      expect(mockAuthStore.clear).toHaveBeenCalled()
    })
  })

  describe('Password Reset', () => {
    it('should request password reset', async () => {
      const mockRequestPasswordReset = vi.fn().mockResolvedValue(true)
      pb.collection = vi.fn().mockReturnValue({
        requestPasswordReset: mockRequestPasswordReset
      })

      await pb.collection('users').requestPasswordReset('test@example.com')

      expect(mockRequestPasswordReset).toHaveBeenCalledWith('test@example.com')
    })
  })
})
