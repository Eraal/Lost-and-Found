import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

export default function StudentProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return null
  if (!user || user.role !== 'student') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}
