import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-9xl font-bold text-gray-300 dark:text-gray-600 mb-4">
          404
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Page Not Found
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-md">
          Oops! The page you're looking for doesn't exist. It might have been moved or deleted.
        </p>
        <div className="space-x-4">
          <Link
            to="/"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg 
                     hover:bg-blue-700 transition-colors font-medium"
          >
            Go Home
          </Link>
          <Link
            to="/list"
            className="inline-block bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white 
                     px-6 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 
                     transition-colors font-medium"
          >
            View Todo List
          </Link>
        </div>
      </div>
    </div>
  )
}

export default NotFoundPage
