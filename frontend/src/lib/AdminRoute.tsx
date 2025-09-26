import React from 'react'
import { useAuth } from './useAuth'
import { Navigate, useLocation } from 'react-router-dom'

export default function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return null
  if (!user || user.role !== 'admin') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}
