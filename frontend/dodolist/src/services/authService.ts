import pb from './pbClient';

import { PB_URL } from '@/config'

import type { UserProfile } from '@/lib/types';

export interface AuthData {
  token: string
  record: UserProfile
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

const LOGOUT_CHANNEL = 'dodolist-logout';

class AuthService {
  private pb = pb;
  private logoutChannel: BroadcastChannel;

  constructor() {
    // No need to create a new PocketBase instance, use the singleton
    ;(window as any).__pb_auth_store = this.pb.authStore
    this.logoutChannel = new BroadcastChannel(LOGOUT_CHANNEL);
    this.setupLogoutListener();
  }

  private setupLogoutListener() {
    this.logoutChannel.onmessage = (event) => {
        if (event.data === 'logout') {
            console.log('[AuthService] Received logout message from another tab.');
            this.pb.authStore.clear();
        }
    };
  }

  // Register new user
  async register(data: RegisterData): Promise<UserProfile> {
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
      
      // Update the global auth store
      ;(window as any).__pb_auth_store = this.pb.authStore
      
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
    this.logoutChannel.postMessage('logout');
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.pb.authStore.isValid
  }

  // Get current user ID
  getUserId(): string | undefined {
    return this.pb.authStore.model?.id;
  }

  // Get current user email
  getUserEmail(): string | undefined {
    return this.pb.authStore.model?.email;
  }

  // Get current user
  getCurrentUser(): UserProfile | null {
    if (this.isAuthenticated() && this.pb.authStore.model) {
      const model = this.pb.authStore.model
    
      return {
        id: model.id,
        email: model.email,
        username: model.username,
        verified: model.verified,
        avatar: model.avatar
      }
    }
    
    return null
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

  // Request email change
  async requestEmailChange(newEmail: string): Promise<void> {
    try {
      await this.pb.collection('users').requestEmailChange(newEmail);
    } catch (error) {
      console.error('Request email change error:', error);
      throw new Error('Request to change email failed.');
    }
  }

  // Confirm email change
  async confirmEmailChange(token: string, newEmail: string): Promise<void> {
    try {
      await this.pb.collection('users').confirmEmailChange(token, newEmail);
    } catch (error) {
      console.error('Confirm email change error:', error);
      throw new Error('Failed to confirm email change.');
    }
  }

  // Update user profile
  async updateProfile(id: string, data: Partial<{ username: string, name: string }>): Promise<UserProfile> {
    try {
      const record = await this.pb.collection('users').update(id, data)
      return {
        id: record.id,
        email: record.email,
        username: record.username,
        name: record.name,
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

  destroy() {
    this.logoutChannel.close();
  }
}

export default AuthService
