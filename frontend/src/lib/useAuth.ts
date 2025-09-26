import { createContext, useContext } from 'react'

export type AuthUser = {
  id: number
  email: string
  role: 'student' | 'admin'
  firstName?: string
  lastName?: string
  avatarUrl?: string
}

export type AuthContextType = {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
  // True once we've checked persisted auth and set initial state
  ready: boolean
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
