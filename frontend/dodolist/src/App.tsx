import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import TodoListPage from './pages/TodoListPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Protected routes */}
        <Route 
          path="/list" 
          element={
            <ProtectedRoute>
              <TodoListPage />
            </ProtectedRoute>
          } 
        />
        
        {/* Redirect to /list by default */}
        <Route path="*" element={<Navigate to="/list" replace />} />
      </Routes>
    </Router>
  )
}

export default App
               