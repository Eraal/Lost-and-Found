import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../lib/useAuth'
import { loginUser } from '../../../lib/api'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const emailValid = useMemo(() => /.+@.+\..+/.test(email), [email])
  const passwordValid = useMemo(() => password.length >= 6, [password])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!emailValid || !passwordValid) {
      setError('Enter a valid email and password.')
      return
    }
    setSubmitting(true)
    try {
      const user = await loginUser({ email, password })
      if (user.role !== 'admin') {
        setError('This account is not an admin')
        return
      }
      // Persist session via AuthProvider and go to admin home
      login({ id: user.id, email: user.email, role: 'admin', firstName: user.firstName, lastName: user.lastName })
      navigate('/admin')
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Login failed'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-academic px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="relative rounded-2xl border border-black/5 bg-white/85 backdrop-blur-sm shadow-xl shadow-black/5 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />

          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-[color:var(--brand)]">Admin Sign in</h1>
              <p className="text-sm text-[var(--ink-600)]">Restricted access. Admins only.</p>
            </div>

            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[var(--ink)]">Gmail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 border-black/10 hover:border-black/15"
                  placeholder="admin@admin.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-[var(--ink)]">Password</label>
                  <span className="text-xs text-[color:var(--support)]">Demo: admin123</span>
                </div>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 border-black/10 hover:border-black/15"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-8 rounded-md text-[var(--ink-600)] hover:text-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? (
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="m3 3 18 18" />
                        <path d="M10.6 10.65a3 3 0 0 0 3.7 3.7" />
                        <path d="M9.88 4.08A11.6 11.6 0 0 1 12 4c5.5 0 9 6 9 6a17.9 17.9 0 0 1-4.16 4.56M6.22 6.22A17.7 17.7 0 0 0 3 10s3.5 6 9 6c1.06 0 2.06-.2 3-.56" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--brand)] text-white px-4 py-2.5 font-medium shadow-sm shadow-[color:var(--brand)]/20 ring-1 ring-[color:var(--brand)]/20 transition-all hover:bg-[color:var(--brand-strong)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[color:var(--brand)]/50 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting && (
                  <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="9" className="opacity-25" />
                    <path d="M21 12a9 9 0 0 1-9 9" />
                  </svg>
                )}
                Sign in as Admin
              </button>

              <div className="text-xs text-[var(--ink-600)] pt-1">
                This page is not linked publicly. Access via URL only.
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
