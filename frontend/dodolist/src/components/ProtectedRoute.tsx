import { Navigate, useLocation } from 'react-router-dom'
import AuthService from '@/services/authService'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const authService = new AuthService()
  const location = useLocation()
  
  if (!authService.isAuthenticated()) {
    // Redirect to login if not authenticated
    // Pass the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
