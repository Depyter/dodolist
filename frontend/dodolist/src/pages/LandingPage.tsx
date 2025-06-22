import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white w-full">
      <div className="mx-auto px-4 py-16">


        <section className="text-center">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4">Ready to get organized?</h2>
            <p className="text-blue-100 mb-6">
              Start managing your tasks with DodoList today!
            </p>
            <Link
              to="/list"
              className="inline-block bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors duration-200 transform hover:scale-105"
            >
              Get Started →
            </Link>
          </div>

          <div className="flex min-h-svh flex-col items-center justify-center">
            <Button>Click me</Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 text-center text-gray-500">
          <p>Built with React, Vite, and Tailwind CSS</p>
        </footer>
      </div>
    </div>
  )
}

export default LandingPage
