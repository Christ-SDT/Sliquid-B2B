import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center space-y-4 px-6">
        <p className="text-sliquid-blue font-extrabold text-7xl">404</p>
        <h1 className="text-text-dark text-2xl font-bold">Page Not Found</h1>
        <p className="text-text-gray max-w-xs mx-auto">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center bg-sliquid-blue hover:bg-sliquid-dark-blue
                     text-white font-semibold px-7 py-3 rounded-lg text-sm transition-colors duration-150"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}
