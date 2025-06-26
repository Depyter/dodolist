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
        
        {/* Protected dynamic list route */}
        <Route 
          path="/list/:listId" 
          element={
            <ProtectedRoute>
              <TodoListPage />
            </ProtectedRoute>
          } 
        />
        
        {/* Redirect /list to first available list (optional, fallback) */}
        <Route path="/list" element={<TodoListPage />} />
        
        {/* Redirect to /list by default */}
        <Route path="*" element={<Navigate to="/list" replace />} />
      </Routes>
    </Router>
  )
}

export default App
