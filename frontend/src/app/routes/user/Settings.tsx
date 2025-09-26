import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../lib/useAuth'

type UserProfile = {
  id: number
  email: string
  role: 'student' | 'admin'
  studentId?: string | null
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  lastLoginAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

export default function SettingsPage() {
  const { user, login } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [form, setForm] = useState({
    studentId: '',
    firstName: '',
    middleName: '',
    lastName: '',
  })
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' })

  useEffect(() => {
    let active = true
    async function load() {
      if (!user) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/users/${user.id}`)
        const data = await res.json().catch(() => ({})) as { user?: UserProfile, error?: string }
        if (!res.ok) throw new Error(data.error || 'Failed to load profile')
        if (!active) return
        setProfile(data.user || null)
        setForm({
          studentId: data.user?.studentId || '',
          firstName: data.user?.firstName || '',
          middleName: data.user?.middleName || '',
          lastName: data.user?.lastName || '',
        })
      } catch (e) {
        if (active) setError((e as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user])

  const initials = useMemo(() => {
    const first = form.firstName?.trim()
    const last = form.lastName?.trim()
    if (first || last) return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || 'U'
    const email = profile?.email || user?.email || 'U'
    return email[0]?.toUpperCase() || 'U'
  }, [form.firstName, form.lastName, profile?.email, user?.email])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    if (pwd.newPassword) {
      if (pwd.newPassword.length < 8) {
        setError('New password must be at least 8 characters')
        setSaving(false)
        return
      }
      if (pwd.newPassword !== pwd.confirm) {
        setError('Password confirmation does not match')
        setSaving(false)
        return
      }
    }

    try {
      const body: Record<string, unknown> = {
        studentId: form.studentId.trim() || null,
        firstName: form.firstName.trim() || null,
        middleName: form.middleName.trim() || null,
        lastName: form.lastName.trim() || null,
      }
      if (pwd.newPassword) {
        body.currentPassword = pwd.currentPassword
        body.newPassword = pwd.newPassword
      }
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({})) as { user?: UserProfile, error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to save changes')
      setProfile(data.user || null)
      setSuccess('Profile updated successfully')
      setPwd({ currentPassword: '', newPassword: '', confirm: '' })
      // Also reflect changes in auth context for header initials
      if (user && data.user) {
        login({
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: data.user.firstName || undefined,
          lastName: data.user.lastName || undefined,
        })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-[var(--ink)]" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-40 backdrop-blur-md bg-white/80 border-b border-black/5">
        <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] bg-clip-text text-transparent">Profile & Settings</h1>
              <p className="text-[var(--ink-600)] mt-1">Manage your personal information and security</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        {/* Alerts */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">
            <div className="flex items-center gap-2">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700">
            <div className="flex items-center gap-2">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
              {success}
            </div>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-black/10 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-black/5 flex items-center gap-4">
            <div className="size-16 rounded-full bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/20 flex items-center justify-center text-xl font-bold">
              {initials}
            </div>
            <div>
              <div className="text-lg font-semibold text-[var(--ink)]">
                {profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email : '—'}
              </div>
              <div className="text-sm text-[var(--ink-600)]">{profile?.email}</div>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-6">
            {/* Identity */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--ink-700)] mb-3">Identity</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">Student ID</label>
                  <input value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))} className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">Email</label>
                  <input value={profile?.email || ''} disabled className="w-full h-11 rounded-xl border border-black/10 bg-black/5 px-4 text-sm text-[var(--ink-700)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">First Name</label>
                  <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">Middle Name</label>
                  <input value={form.middleName} onChange={e => setForm(f => ({ ...f, middleName: e.target.value }))} className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">Last Name</label>
                  <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm" />
                </div>
              </div>
            </section>

            {/* Security */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--ink-700)] mb-3">Security</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">Current Password</label>
                  <input type="password" value={pwd.currentPassword} onChange={e => setPwd(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Leave blank to keep current" className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">New Password</label>
                  <input type="password" value={pwd.newPassword} onChange={e => setPwd(p => ({ ...p, newPassword: e.target.value }))} placeholder="Min 8 characters" className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--ink-600)] mb-1">Confirm New Password</label>
                  <input type="password" value={pwd.confirm} onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm" />
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => { if (profile) {
                setForm({
                  studentId: profile.studentId || '',
                  firstName: profile.firstName || '',
                  middleName: profile.middleName || '',
                  lastName: profile.lastName || '',
                }); setPwd({ currentPassword: '', newPassword: '', confirm: '' }); setError(null); setSuccess(null);
              }}} className="inline-flex items-center h-11 px-4 rounded-xl border border-black/10 bg-white text-[var(--ink)] hover:bg-black/5">Reset</button>
              <button type="submit" disabled={saving || loading} className={`inline-flex items-center gap-2 h-11 px-5 rounded-xl text-white font-semibold ${saving ? 'bg-[color:var(--brand)]/80' : 'bg-[color:var(--brand)] hover:bg-[color:var(--brand-strong)]'} shadow-sm`}>
                {saving ? (
                  <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" className="opacity-25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg>
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
                )}
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Meta */}
        <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/20 p-4 text-sm text-[var(--ink-600)]">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><span className="font-medium text-[var(--ink-700)]">Role:</span> {profile?.role}</div>
            <div><span className="font-medium text-[var(--ink-700)]">Last login:</span> {profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : '—'}</div>
            <div><span className="font-medium text-[var(--ink-700)]">Member since:</span> {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 pointer-events-none grid place-items-center">
          <div className="inline-flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur px-4 py-3 border border-black/10 shadow-sm text-[var(--ink-700)]">
            <div className="size-5 rounded-full border-2 border-[color:var(--brand)] border-t-transparent animate-spin" />
            Loading profile...
          </div>
        </div>
      )}
    </div>
  )
}
