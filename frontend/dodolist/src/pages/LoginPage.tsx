import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import LoginForm from '@/components/LoginForm'
import TexturedBackground from '@/components/TexturedBackground'
import AuthService from '@/services/authService'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [authService] = useState(() => new AuthService())

  // Check if we were redirected from a protected route
  const from = location.state?.from?.pathname || '/list'

  // Check if user is already authenticated
  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate(from, { replace: true });
    }
  }, [navigate, authService, from]);

  const handleLoginSuccess = () => {
    // Navigate to the page the user tried to visit before being redirected to login
    navigate(from, { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 relative">
      <TexturedBackground className="absolute inset-0" intensity="normal" />
      <div className="w-full max-w-md z-10">
        <Card className="shadow-xl border-blue-200 border">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl text-center text-blue-700">DodoList</CardTitle>
          </CardHeader>
          <CardContent>
            <LoginForm onSuccess={handleLoginSuccess} />
          </CardContent>
        </Card>
        
        <div className="text-center mt-4 text-sm text-blue-600">
          <p>Sign in to access your tasks and lists</p>
          <button 
            onClick={() => navigate('/register')} 
            className="mt-2 text-blue-700 hover:text-blue-800 underline font-medium"
          >
            Register New User
          </button>
        </div>
      </div>
    </div>
  )
}
