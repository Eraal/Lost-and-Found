import { useState } from 'react'
import { updateUser, type UpdateUserInput } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'

export default function AdminSystemSettings() {
  // Repurposed as Account Settings for the currently logged-in admin
  const { user, login } = useAuth()
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const dirty = (
    form.firstName !== (user?.firstName || '') ||
    form.lastName !== (user?.lastName || '') ||
    form.email !== (user?.email || '') ||
    (!!form.newPassword && !!form.currentPassword)
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null); setSuccess(null)
    if (form.newPassword || form.confirmPassword || form.currentPassword) {
      if (form.newPassword !== form.confirmPassword) {
        setError('New password and confirmation do not match.')
        return
      }
      if (form.newPassword.length > 0 && form.newPassword.length < 6) {
        setError('New password must be at least 6 characters.')
        return
      }
      if (!form.currentPassword) {
        setError('Enter current password to set a new password.')
        return
      }
    }
    const payload: UpdateUserInput = {
      firstName: form.firstName || null,
      lastName: form.lastName || null,
      email: form.email,
    }
    if (form.newPassword) {
      payload.currentPassword = form.currentPassword
      payload.newPassword = form.newPassword
    }
    try {
      setSaving(true)
      const updated = await updateUser(user.id, payload)
      // Refresh auth context with updated user (keep role & id)
      login({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        firstName: updated.firstName || undefined,
        lastName: updated.lastName || undefined,
      })
      setSuccess('Account updated successfully.')
      setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }))
    } catch (e) {
      setError((e as Error).message || 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-indigo-600 text-white shadow-lg">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Account Settings</h1>
              <p className="text-gray-600 mt-1">Manage your administrator profile and password</p>
            </div>
          </div>
          <div className={`rounded-2xl p-4 border-2 ${dirty ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${dirty ? 'bg-amber-200' : 'bg-green-200'}`}>{dirty ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              )}</div>
              <div>
                <div className="font-semibold">{dirty ? 'Unsaved changes' : 'All changes saved'}</div>
                <div className="text-sm opacity-90">{dirty ? 'Update your details and click Save' : 'Profile information is up to date'}</div>
              </div>
              <button
                disabled={!dirty || saving}
                onClick={(e) => onSubmit(e as unknown as React.FormEvent)}
                className="ml-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (<>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving
                </>) : (<>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  Save Changes
                </>)}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            <div className="flex-1">
              <div className="font-semibold text-red-800">Error</div>
              <div className="text-sm text-red-700 mt-1">{error}</div>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            <div className="flex-1">
              <div className="font-semibold text-green-900">Success</div>
              <div className="text-sm text-green-800 mt-1">{success}</div>
            </div>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700 transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-8">
          <section className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 13V7a3 3 0 00-3-3H5a3 3 0 00-3 3v6a3 3 0 003 3h3l2.293 2.293a1 1 0 001.414 0L16 16h-1a3 3 0 003-3zm-6-3a2 2 0 11-4 0 2 2 0 014 0z" clipRule="evenodd" /></svg>
              </div>
              <h3 className="font-semibold text-gray-900">Profile Information</h3>
            </div>
            <div className="p-6 grid gap-6 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">First Name</label>
                <input className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 outline-none" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Last Name</label>
                <input className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 outline-none" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Email</label>
                <input type="email" className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 outline-none" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@school.edu" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 8V6a4 4 0 018 0v2h1a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2h1zm2-2a2 2 0 114 0v2H6V6z" clipRule="evenodd" /></svg>
              </div>
              <h3 className="font-semibold text-gray-900">Password</h3>
            </div>
            <div className="p-6 grid gap-6 md:grid-cols-3">
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-semibold text-gray-600">Current Password</label>
                <input type="password" autoComplete="current-password" className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 outline-none" value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="••••••" />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-semibold text-gray-600">New Password</label>
                <input type="password" autoComplete="new-password" className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 outline-none" value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="New password" />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-semibold text-gray-600">Confirm Password</label>
                <input type="password" autoComplete="new-password" className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-400 outline-none" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Confirm password" />
              </div>
              <div className="md:col-span-3 text-xs text-gray-500 -mt-3">Leave password fields blank to keep your existing password.</div>
            </div>
          </section>

          <div className="flex justify-end">
            <button type="submit" disabled={!dirty || saving} className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm shadow-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />}
              Save Account
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
