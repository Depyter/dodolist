import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pb, mockAuthStore, mockCollectionCreate, mockCollectionAuthWithPassword, mockUsersRequestPasswordReset, mockUsersConfirmPasswordReset, mockUsersRequestVerification, mockUsersConfirmVerification } from './setup'
import AuthService, { type RegisterData, type LoginData } from '../services/authService'

describe('AuthService', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset auth store state
    mockAuthStore.isValid = false
    mockAuthStore.model = null
    mockAuthStore.token = ''
    mockAuthStore.clear.mockClear()
    mockAuthStore.onChange.mockClear()
    mockCollectionCreate.mockClear()
    mockCollectionAuthWithPassword.mockClear()
    mockUsersRequestPasswordReset.mockClear()
    mockUsersConfirmPasswordReset.mockClear()
    mockUsersRequestVerification.mockClear()
    mockUsersConfirmVerification.mockClear()
    
    authService = new AuthService()
  })

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const registerData: RegisterData = {
        email: 'test@example.com',
        password: 'testpassword123',
        passwordConfirm: 'testpassword123',
        username: 'testuser'
      }

      const mockUserRecord = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        verified: false,
        avatar: '' // changed from null to empty string
      }

      mockCollectionCreate.mockResolvedValue(mockUserRecord)

      const result = await authService.register(registerData)

      expect(mockCollectionCreate).toHaveBeenCalledWith(registerData)
      expect(result).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        verified: false,
        avatar: ''
      })
    })

    it('should handle registration errors', async () => {
      const registerData: RegisterData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'testpassword123',
        passwordConfirm: 'testpassword123'
      }

      mockCollectionCreate.mockRejectedValue(new Error('Validation failed'))

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
          avatar: '' // changed from null to empty string
        }
      }

      mockCollectionAuthWithPassword.mockResolvedValue(mockAuthData)

      const result = await authService.login(loginData)

      expect(mockCollectionAuthWithPassword).toHaveBeenCalledWith(loginData.identity, loginData.password)
      expect(result).toEqual({
        token: 'jwt-token',
        record: {
          id: 'user-id',
          email: 'test@example.com',
          username: 'testuser',
          verified: true,
          avatar: ''
        }
      })
    })

    it('should handle login errors', async () => {
      const loginData: LoginData = {
        identity: 'wrong@example.com',
        password: 'wrongpassword'
      }

      mockCollectionAuthWithPassword.mockRejectedValue(new Error('Invalid credentials'))

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
        avatar: '' // changed from null to empty string
      }

      expect(authService.isAuthenticated()).toBe(true)
      expect(authService.getCurrentUser()).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        verified: true,
        avatar: ''
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
      expect(mockAuthStore.clear).toHaveBeenCalled()
    })

    it('should get auth token', () => {
      mockAuthStore.token = 'test-token'
      expect(authService.getToken()).toBe('test-token')
    })
  })

  describe('Password Reset', () => {
    it('should request password reset', async () => {
      mockUsersRequestPasswordReset.mockResolvedValue(true)

      await authService.requestPasswordReset('test@example.com')

      expect(mockUsersRequestPasswordReset).toHaveBeenCalledWith('test@example.com')
    })

    it('should handle password reset request errors', async () => {
      mockUsersRequestPasswordReset.mockRejectedValue(new Error('Email not found'))

      await expect(authService.requestPasswordReset('nonexistent@example.com'))
        .rejects.toThrow('Password reset request failed')
    })

    it('should confirm password reset', async () => {
      mockUsersConfirmPasswordReset.mockResolvedValue(true)

      await authService.confirmPasswordReset('token123', 'newpassword', 'newpassword')

      expect(mockUsersConfirmPasswordReset).toHaveBeenCalledWith('token123', 'newpassword', 'newpassword')
    })

    it('should handle password reset confirmation errors', async () => {
      mockUsersConfirmPasswordReset.mockRejectedValue(new Error('Invalid token'))

      await expect(authService.confirmPasswordReset('invalid-token', 'newpassword', 'newpassword'))
        .rejects.toThrow('Password reset confirmation failed')
    })
  })

  describe('Email Verification', () => {
    it('should request email verification', async () => {
      mockUsersRequestVerification.mockResolvedValue(true)

      await authService.requestVerification('test@example.com')

      expect(mockUsersRequestVerification).toHaveBeenCalledWith('test@example.com')
    })

    it('should handle verification request errors', async () => {
      mockUsersRequestVerification.mockRejectedValue(new Error('User not found'))

      await expect(authService.requestVerification('nonexistent@example.com'))
        .rejects.toThrow('Verification request failed')
    })

    it('should confirm email verification', async () => {
      mockUsersConfirmVerification.mockResolvedValue(true)

      await authService.confirmVerification('verification-token')

      expect(mockUsersConfirmVerification).toHaveBeenCalledWith('verification-token')
    })

    it('should handle verification confirmation errors', async () => {
      mockUsersConfirmVerification.mockRejectedValue(new Error('Invalid verification token'))

      await expect(authService.confirmVerification('invalid-token'))
        .rejects.toThrow('Email verification failed')
    })
  })
  
  describe('Auth State Changes', () => {
    it('should subscribe to auth changes', () => {
      const callback = vi.fn()
      
      authService.onAuthChange(callback)

      expect(mockAuthStore.onChange).toHaveBeenCalledWith(callback)
    })
  })
})
