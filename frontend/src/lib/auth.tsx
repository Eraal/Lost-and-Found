import React, { useEffect, useMemo, useState } from 'react'
import { AuthContext, type AuthUser } from './useAuth.ts'

const STORAGE_KEY = 'ccslf:user'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (
          parsed && typeof parsed === 'object' &&
          typeof parsed.id === 'number' &&
          typeof parsed.email === 'string' &&
          (parsed.role === 'student' || parsed.role === 'admin')
        ) {
          setUser(parsed as AuthUser)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setReady(true)
  }, [])

  const value = useMemo(() => ({
    user,
    login(next: AuthUser) {
      setUser(next)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    },
    logout() {
      setUser(null)
      localStorage.removeItem(STORAGE_KEY)
    },
    ready
  }), [user, ready])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
