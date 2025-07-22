import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AuthService, { type LoginData, type RegisterData } from '@/services/authService'
import { colors, type Color } from "@/lib/colors"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DodoBirdIcon from '@/components/DodoBirdIcon';

interface AuthFormProps {
  mode: 'login' | 'register'
  onSuccess: () => void
  activeColor: Color
  setMode: (mode: 'login' | 'register') => void
}

// Reusable styled input component
function StyledInput({ activeColor, className = '', ...props }: Omit<React.ComponentProps<typeof Input>, 'activeColor'> & { activeColor: Color }) {
  return (
    <Input
      {...props}
      className={`peer h-10 w-full bg-transparent text-slate-900 placeholder-transparent focus:outline-none transition-colors ${activeColor.border} ${className}`.trim()}
    />
  );
}

// Reusable styled label component
function StyledLabel({ className = '', ...props }: React.ComponentProps<typeof Label> & { className?: string }) {
  return (
    <Label
      {...props}
      className={`absolute left-0 px-2 -top-5 text-sm text-slate-600 transition-all peer-placeholder-shown:top-2 peer-placeholder-shown:text-base peer-placeholder-shown:text-slate-400 peer-focus:-top-5 peer-focus:text-sm peer-focus:text-slate-600 ${className}`.trim()}
    />
  );
}

function AuthForm({ mode, onSuccess, activeColor, setMode }: AuthFormProps) {
  const [authService] = useState(() => new AuthService())
  const [formData, setFormData] = useState<Partial<RegisterData & LoginData>>({
    identity: '',
    email: '',
    username: '',
    password: '',
    passwordConfirm: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    const data = formData as RegisterData & LoginData;

    if (mode === 'register') {
        if (!data.email) {
            newErrors.email = 'Email is required'
        } else if (!data.email.includes('@')) {
            newErrors.email = 'Please enter a valid email'
        }

        if (!data.username) {
            newErrors.username = 'Username is required'
        } else if (data.username.length < 3) {
            newErrors.username = 'Username must be at least 3 characters'
        }
    } else {
        if (!data.identity) {
            newErrors.identity = 'Email or username is required'
        }
    }

    if (!data.password) {
        newErrors.password = 'Password is required'
    } else if (mode === 'register' && data.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters'
    }

    if (mode === 'register' && data.password !== data.passwordConfirm) {
        newErrors.passwordConfirm = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return; // Prevent spamming
    if (!validateForm()) return

    setIsLoading(true)
    setErrors({})

    try {
      if (mode === 'register') {
        const { email, username, password, passwordConfirm } = formData as RegisterData;
        await authService.register({ email, username, password, passwordConfirm })
        await authService.login({ identity: email, password })
      } else {
        const { identity, password } = formData as LoginData;
        await authService.login({ identity, password })
      }
      onSuccess()
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : (mode === 'login' ? 'Login failed' : 'Registration failed')
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value, ...(name === 'email' && { identity: value }) }))
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-4">
      {errors.general && <p className="text-sm text-red-500 text-center">{errors.general}</p>}
      
      {mode === 'login' ? (
        <div className="relative">
          <StyledInput
            id="identity"
            name="identity"
            type="text"
            value={formData.identity}
            onChange={handleChange}
            disabled={isLoading}
            activeColor={activeColor}
            placeholder=''
          />
          <StyledLabel htmlFor="identity">Email or Username</StyledLabel>
          {errors.identity && <p className="text-sm text-red-600 mt-1">{errors.identity}</p>}
        </div>
      ) : (
        <>
          <div className="relative">
            <StyledInput
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              disabled={isLoading}
              activeColor={activeColor}
            placeholder=''
            />
            <StyledLabel htmlFor="email">Email</StyledLabel>
            {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email}</p>}
          </div>
          <div className="relative">
            <StyledInput
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              disabled={isLoading}
              activeColor={activeColor}
            placeholder=''
            />
            <StyledLabel htmlFor="username">Username</StyledLabel>
            {errors.username && <p className="text-sm text-red-600 mt-1">{errors.username}</p>}
          </div>
        </>
      )}

      <div className="relative">
        <StyledInput
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          disabled={isLoading}
          activeColor={activeColor}
          placeholder=''
        />
        <StyledLabel htmlFor="password">Password</StyledLabel>
        {errors.password && <p className="text-sm text-red-600 mt-1">{errors.password}</p>}
      </div>

      {mode === 'register' && (
        <div className="relative">
          <StyledInput
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            value={formData.passwordConfirm}
            onChange={handleChange}
            disabled={isLoading}
            activeColor={activeColor}
          placeholder=''
          />
          <StyledLabel htmlFor="passwordConfirm">Confirm Password</StyledLabel>
          {errors.passwordConfirm && <p className="text-sm text-red-600 mt-1">{errors.passwordConfirm}</p>}
        </div>
      )}

      <Button 
        type="submit" 
        disabled={isLoading}
        className={`w-full text-white font-semibold py-3 rounded-lg transition-all shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 relative ${activeColor.dark}`}
        loading={isLoading}
      >
        <div className="absolute inset-0 noise-texture-subtle z-0" style={{ opacity: 0.10, mixBlendMode: 'screen' }} />
        <span className="relative z-10">{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
      </Button>
    </form>
  )
}

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [authService] = useState(() => new AuthService())
  const [activeColor, setActiveColor] = useState(colors[0]);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const from = location.state?.from?.pathname || '/list'

  useEffect(() => {
    setMode(location.pathname === '/register' ? 'register' : 'login');
  }, [location.pathname]);

  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate(from, { replace: true });
    }
  }, [navigate, authService, from]);

  const handleSuccess = () => {
    navigate(from, { replace: true })
    window.location.reload();
  }

  const toggleMode = () => {
    navigate(mode === 'login' ? '/register' : '/login');
  };

  return (
    <div className={`min-h-screen flex items-center justify-center relative ${activeColor.light}`}>
      <div className="absolute inset-0 noise-texture-subtle z-0" style={{ opacity: 0.05 }} />
      
      <div className="w-full max-w-sm z-10 p-4">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3">
            <DodoBirdIcon
              className="w-12 h-12"
              color={activeColor.hex}
            />
            <h1 className={`text-4xl font-bold tracking-tight ${activeColor.text}`}>DodoList</h1>
          </div>
          <p className="text-sm mt-2 text-slate-500">
            {mode === 'login' ? 'The legacy of Dodos live on!' : 'Let\'s get you organized.'}
          </p>
        </div>

        <Card className="bg-white/70 border border-slate-200 shadow-xl backdrop-blur-xl rounded-2xl">
          <CardHeader className="pt-6">
            <CardTitle className="text-xl text-center text-slate-700 font-semibold">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <AuthForm onSuccess={handleSuccess} activeColor={activeColor} mode={mode} setMode={setMode} />
          </CardContent>
        </Card>
        
        <div className="text-center mt-6 text-sm text-slate-600">
          <p>{mode === 'login' ? "Don't have an account?" : "Already have an account?"}</p>
          <button 
            onClick={toggleMode} 
            className="mt-1 text-slate-700 hover:text-slate-900 underline font-medium"
          >
            {mode === 'login' ? 'Register a New User' : 'Sign In'}
          </button>
        </div>
        <div className="flex justify-center gap-2 p-2 mt-4">
          {colors.map((color) => (
            <button
              key={color.value}
              className={`w-6 h-6 rounded-full ${color.value} hover:scale-110 transition-transform`}
              onClick={() => setActiveColor(color)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}