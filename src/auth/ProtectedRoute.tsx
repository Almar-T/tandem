import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'

/** Gate authenticated areas. While the session is resolving we show a calm splash. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid h-full place-items-center text-slate-500">
        <span className="animate-pulse text-sm">Loading Tandem…</span>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
