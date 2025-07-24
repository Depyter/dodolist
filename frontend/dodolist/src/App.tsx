import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import TodoListPage from './pages/TodoListPage'
import AuthPage from './pages/AuthPage'
import ProtectedRoute from './components/ProtectedRoute'
import ImportListPrompt from './components/ImportListPrompt'

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        {/* Import route for todo list import links */}
        <Route path="/import" element={<ImportListPrompt />} />
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
