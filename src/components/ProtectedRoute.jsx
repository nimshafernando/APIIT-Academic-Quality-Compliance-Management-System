import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './UI'

// Guards a route: requires a session, forces first-login password change,
// and optionally requires one of the given roles.
export default function ProtectedRoute({ children, roles }) {
  const { user, profile, loading, hasRole } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />

  if (profile?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (roles && !hasRole(...roles)) {
    return (
      <div className="card mx-auto mt-12 max-w-md px-6 py-10 text-center">
        <p className="text-4xl">🔒</p>
        <h2 className="mt-3 text-lg font-bold text-gray-900">Access denied</h2>
        <p className="mt-1 text-sm text-gray-500">
          Your role does not permit access to this page. Contact the Super Admin if you believe this is an error.
        </p>
      </div>
    )
  }

  return children
}
