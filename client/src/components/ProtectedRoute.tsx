import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { authClient } from '../lib/auth-client'

type ProtectedRouteProps = {
  children: ReactNode
  adminOnly?: boolean
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { data, isPending } = authClient.useSession()

  if (isPending) {
    return <p className="p-6 text-center text-muted-foreground">Loading...</p>
  }

  if (!data?.user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && data.user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
