import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create mock functions first
const mockCreate = vi.fn()
const mockAuthWithPassword = vi.fn()
const mockRequestPasswordReset = vi.fn()
const mockConfirmPasswordReset = vi.fn()
const mockRequestVerification = vi.fn()
const mockConfirmVerification = vi.fn()
const mockUpdate = vi.fn()
const mockClear = vi.fn()
const mockOnChange = vi.fn()

// Create a mutable auth store object
let mockAuthStore = {
  isValid: false,
  model: null as any,
  token: null as string | null,
  clear: mockClear,
  onChange: mockOnChange
}

// Mock collection function
const mockCollection = vi.fn(() => ({
  create: mockCreate,
  authWithPassword: mockAuthWithPassword,
  requestPasswordReset: mockRequestPasswordReset,
  confirmPasswordReset: mockConfirmPasswordReset,
  requestVerification: mockRequestVerification,
  confirmVerification: mockConfirmVerification,
  update: mockUpdate
}))

// Mock PocketBase before importing AuthService
vi.mock('pocketbase', () => {
  return {
    default: vi.fn(() => ({
      collection: mockCollection,
      authStore: mockAuthStore
    }))
  }
})

// Now import AuthService after mocking
import AuthService, { type RegisterData, type LoginData } from '../services/authService'

describe('AuthService', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset auth store state
    mockAuthStore.isValid = false
    mockAuthStore.model = null
    mockAuthStore.token = null
    
    authService = new AuthService()
  })

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const registerData: RegisterData = {
        email: 'test@example.com',
        password: 'testpassword123',
        passwordConfirm: 'testpassword123',
        username: 'testuser',
        name: 'Test User'
      }

      const mockUserRecord = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        verified: false,
        avatar: null
      }

      mockCreate.mockResolvedValue(mockUserRecord)

      const result = await authService.register(registerData)

      expect(mockCreate).toHaveBeenCalledWith(registerData)
      expect(result).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        verified: false,
        avatar: null
      })
    })

    it('should handle registration errors', async () => {
      const registerData: RegisterData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'testpassword123',
        passwordConfirm: 'testpassword123'
      }

      mockCreate.mockRejectedValue(new Error('Validation failed'))

      await expect(authService.register(registerData)).rejects.toThrow('Registration failed')
    })
  })

  describe('User Login', () => {
    it('should login user successfully', async () => {
      const loginData: LoginData = {
        identity: 'test@example.com',
        password: 'testpassword123'
      }

      const mockAuthData = {
        token: 'jwt-token',
        record: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser',
          verified: true,
          name: 'Test User',
          avatar: null
        }
      }

      mockAuthWithPassword.mockResolvedValue(mockAuthData)

      const result = await authService.login(loginData)

      expect(mockAuthWithPassword).toHaveBeenCalledWith(loginData.identity, loginData.password)
      expect(result).toEqual({
        token: 'jwt-token',
        record: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser',
          verified: true,
          name: 'Test User',
          avatar: null
        }
      })
    })

    it('should handle login errors', async () => {
      const loginData: LoginData = {
        identity: 'wrong@example.com',
        password: 'wrongpassword'
      }

      mockAuthWithPassword.mockRejectedValue(new Error('Invalid credentials'))

      await expect(authService.login(loginData)).rejects.toThrow('Login failed')
    })
  })

  describe('Authentication State', () => {
    it('should check if user is authenticated', () => {
      mockAuthStore.isValid = true
      mockAuthStore.model = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        verified: true,
        name: 'Test User',
        avatar: null
      }

      expect(authService.isAuthenticated()).toBe(true)
      expect(authService.getCurrentUser()).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        verified: true,
        name: 'Test User',
        avatar: null
      })
    })

    it('should return null for unauthenticated user', () => {
      mockAuthStore.isValid = false
      mockAuthStore.model = null

      expect(authService.isAuthenticated()).toBe(false)
      expect(authService.getCurrentUser()).toBeNull()
    })

    it('should logout user', () => {
      authService.logout()
      expect(mockClear).toHaveBeenCalled()
    })

    it('should get auth token', () => {
      mockAuthStore.token = 'test-token'
      expect(authService.getToken()).toBe('test-token')
    })
  })

  describe('Password Reset', () => {
    it('should request password reset', async () => {
      mockRequestPasswordReset.mockResolvedValue(true)

      await authService.requestPasswordReset('test@example.com')

      expect(mockRequestPasswordReset).toHaveBeenCalledWith('test@example.com')
    })

    it('should handle password reset request errors', async () => {
      mockRequestPasswordReset.mockRejectedValue(new Error('Email not found'))

      await expect(authService.requestPasswordReset('nonexistent@example.com'))
        .rejects.toThrow('Password reset request failed')
    })

    it('should confirm password reset', async () => {
      mockConfirmPasswordReset.mockResolvedValue(true)

      await authService.confirmPasswordReset('token123', 'newpassword', 'newpassword')

      expect(mockConfirmPasswordReset).toHaveBeenCalledWith('token123', 'newpassword', 'newpassword')
    })

    it('should handle password reset confirmation errors', async () => {
      mockConfirmPasswordReset.mockRejectedValue(new Error('Invalid token'))

      await expect(authService.confirmPasswordReset('invalid-token', 'newpassword', 'newpassword'))
        .rejects.toThrow('Password reset confirmation failed')
    })
  })

  describe('Email Verification', () => {
    it('should request email verification', async () => {
      mockRequestVerification.mockResolvedValue(true)

      await authService.requestVerification('test@example.com')

      expect(mockRequestVerification).toHaveBeenCalledWith('test@example.com')
    })

    it('should handle verification request errors', async () => {
      mockRequestVerification.mockRejectedValue(new Error('User not found'))

      await expect(authService.requestVerification('nonexistent@example.com'))
        .rejects.toThrow('Verification request failed')
    })

    it('should confirm email verification', async () => {
      mockConfirmVerification.mockResolvedValue(true)

      await authService.confirmVerification('verification-token')

      expect(mockConfirmVerification).toHaveBeenCalledWith('verification-token')
    })

    it('should handle verification confirmation errors', async () => {
      mockConfirmVerification.mockRejectedValue(new Error('Invalid verification token'))

      await expect(authService.confirmVerification('invalid-token'))
        .rejects.toThrow('Email verification failed')
    })
  })

  describe('Profile Updates', () => {
    it('should update user profile', async () => {
      const updateData = { name: 'Updated Name' }
      const mockUpdatedRecord = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Updated Name',
        verified: true,
        avatar: null
      }

      mockUpdate.mockResolvedValue(mockUpdatedRecord)

      const result = await authService.updateProfile('user-id', updateData)

      expect(mockUpdate).toHaveBeenCalledWith('user-id', updateData)
      expect(result).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Updated Name',
        verified: true,
        avatar: null
      })
    })

    it('should handle profile update errors', async () => {
      mockUpdate.mockRejectedValue(new Error('Update failed'))

      await expect(authService.updateProfile('user-id', { name: 'New Name' }))
        .rejects.toThrow('Profile update failed')
    })
  })

  describe('Auth State Changes', () => {
    it('should subscribe to auth changes', () => {
      const callback = vi.fn()
      
      authService.onAuthChange(callback)

      expect(mockOnChange).toHaveBeenCalledWith(callback)
    })
  })
})
