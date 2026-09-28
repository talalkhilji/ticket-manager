import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { authClient } from '../lib/auth-client'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession()

  if (isPending) {
    return <p className="p-6 text-center">Loading...</p>
  }

  if (!data?.user) {
    return <Navigate to="/login" replace />
  }

  return children
}
