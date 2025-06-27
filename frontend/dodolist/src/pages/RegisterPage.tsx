import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import TexturedBackground from '@/components/TexturedBackground'
import AuthService, { type RegisterData } from '@/services/authService'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [authService] = useState(() => new AuthService())
  const [formData, setFormData] = useState<RegisterData>({
    email: '',
    username: '',
    password: '',
    passwordConfirm: '',
  })
  
  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate('/list');
    }
  }, [navigate, authService]);
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!formData.email.includes('@')) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.username) {
      newErrors.username = 'Username is required'
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsLoading(true)
    setErrors({})

    try {
      await authService.register(formData)
      await authService.login({
        identity: formData.email,
        password: formData.password
      })
      navigate('/list')
      window.location.reload(); // Force a reload to re-initialize services
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Registration failed' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 relative">
      <TexturedBackground className="absolute inset-0" intensity="normal" />
      <div className="w-full max-w-md z-10">
        <Card className="shadow-xl border-blue-200 border">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl text-center text-blue-700">Create Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
                {errors.email && (
                  <p id="email-error" className="text-sm text-red-600 mt-1">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  disabled={isLoading}
                  aria-describedby={errors.username ? 'username-error' : undefined}
                />
                {errors.username && (
                  <p id="username-error" className="text-sm text-red-600 mt-1">
                    {errors.username}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                />
                {errors.password && (
                  <p id="password-error" className="text-sm text-red-600 mt-1">
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">Confirm Password</Label>
                <Input
                  id="passwordConfirm"
                  name="passwordConfirm"
                  type="password"
                  value={formData.passwordConfirm}
                  onChange={handleChange}
                  disabled={isLoading}
                  aria-describedby={errors.passwordConfirm ? 'passwordConfirm-error' : undefined}
                />
                {errors.passwordConfirm && (
                  <p id="passwordConfirm-error" className="text-sm text-red-600 mt-1">
                    {errors.passwordConfirm}
                  </p>
                )}
              </div>

              {errors.general && (
                <p className="text-sm text-red-600">{errors.general}</p>
              )}

              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full"
                loading={isLoading}
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
              
              <div className="text-center pt-2">
                <button 
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-sm text-blue-700 hover:text-blue-800 underline"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
