import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AuthService, { type LoginData } from '../services/authService'

interface LoginFormProps {
  onSuccess: () => void
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const [authService] = useState(() => new AuthService())
  const [formData, setFormData] = useState<LoginData>({
    identity: '',
    password: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.identity) {
      newErrors.identity = 'Email is required'
    } else if (!formData.identity.includes('@')) {
      newErrors.identity = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
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
      await authService.login(formData)
      onSuccess()
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Login failed' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.general && <p className="text-sm text-red-600 text-center">{errors.general}</p>}
      <div className="space-y-2">
        <Label htmlFor="identity">Email or Username</Label>
        <Input
          id="identity"
          name="identity"
          type="text"
          value={formData.identity}
          onChange={handleChange}
          disabled={isLoading}
          aria-describedby={errors.identity ? 'identity-error' : undefined}
        />
        {errors.identity && (
          <p id="identity-error" className="text-sm text-red-600 mt-1">
            {errors.identity}
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

      <Button 
        type="submit" 
        disabled={isLoading}
        className="w-full"
        loading={isLoading}
      >
        Sign In
      </Button>
    </form>
  )
}
