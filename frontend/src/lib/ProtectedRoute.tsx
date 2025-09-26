import React from 'react'
import { useAuth } from './useAuth'
import LoginPage from '../app/pages/Login'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (!user) return <LoginPage />
  return <>{children}</>
}
