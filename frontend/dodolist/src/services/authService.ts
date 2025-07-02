import PocketBase from 'pocketbase'
import { PB_URL } from '@/config'

export interface User {
  id: string
  email: string
  username: string
  verified: boolean
  avatar?: string
}

export interface AuthData {
  token: string
  record: User
}

export interface RegisterData {
  email: string
  password: string
  passwordConfirm: string
  username: string
}

export interface LoginData {
  identity: string // email or username
  password: string
}

class AuthService {
  private pb: PocketBase

  constructor() {
    this.pb = new PocketBase(PB_URL)
  }

  // Register new user
  async register(data: RegisterData): Promise<User> {
    try {
      const record = await this.pb.collection('users').create(data)
      return {
        id: record.id,
        email: record.email,
        username: record.username,
        verified: record.verified,
        avatar: record.avatar
      }
    } catch (error) {
      console.error('Registration error:', error)
      throw new Error('Registration failed')
    }
  }

  // Login user
  async login(data: LoginData): Promise<AuthData> {
    try {
      const authData = await this.pb.collection('users').authWithPassword(
        data.identity,
        data.password
      )
      return {
        token: authData.token,
        record: {
          id: authData.record.id,
          email: authData.record.email,
          username: authData.record.username,
          verified: authData.record.verified,
          avatar: authData.record.avatar
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      throw new Error('Login failed')
    }
  }

  // Logout user
  logout(): void {
    this.pb.authStore.clear()
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.pb.authStore.isValid
  }

  // Get current user
  getCurrentUser(): User | null {
    const model = this.pb.authStore.model
    if (!model) return null
    
    return {
      id: model.id,
      email: model.email,
      username: model.username,
      verified: model.verified,
      avatar: model.avatar
    }
  }

  // Get auth token
  getToken(): string | null {
    return this.pb.authStore.token
  }

  // Request password reset
  async requestPasswordReset(email: string): Promise<void> {
    try {
      await this.pb.collection('users').requestPasswordReset(email)
    } catch (error) {
      console.error('Password reset request error:', error)
      throw new Error('Password reset request failed')
    }
  }

  // Confirm password reset
  async confirmPasswordReset(
    token: string,
    password: string,
    passwordConfirm: string
  ): Promise<void> {
    try {
      await this.pb.collection('users').confirmPasswordReset(
        token,
        password,
        passwordConfirm
      )
    } catch (error) {
      console.error('Password reset confirmation error:', error)
      throw new Error('Password reset confirmation failed')
    }
  }

  // Send email verification
  async requestVerification(email: string): Promise<void> {
    try {
      await this.pb.collection('users').requestVerification(email)
    } catch (error) {
      console.error('Verification request error:', error)
      throw new Error('Verification request failed')
    }
  }

  // Confirm email verification
  async confirmVerification(token: string): Promise<void> {
    try {
      await this.pb.collection('users').confirmVerification(token)
    } catch (error) {
      console.error('Email verification error:', error)
      throw new Error('Email verification failed')
    }
  }

  // Update user profile
  async updateProfile(id: string, data: Partial<User>): Promise<User> {
    try {
      const record = await this.pb.collection('users').update(id, data)
      return {
        id: record.id,
        email: record.email,
        username: record.username,
        verified: record.verified,
        avatar: record.avatar
      }
    } catch (error) {
      console.error('Profile update error:', error)
      throw new Error('Profile update failed')
    }
  }

  // Subscribe to auth state changes
  onAuthChange(callback: (token: string, model: any) => void): () => void {
    return this.pb.authStore.onChange(callback)
  }
}

export default AuthService
