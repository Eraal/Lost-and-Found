import { useEffect, useMemo, useState } from 'react'
import { listUsers, type AdminUserRecord, updateUser, type UpdateUserInput, createAdmin, type CreateAdminInput } from '../../../lib/api'

type RoleFilter = 'all' | 'student' | 'admin'

export default function AdminUsers() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [limit] = useState(20)
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<AdminUserRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminUserRecord | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false)

  const appliedRole = role === 'all' ? undefined : role

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const res = await listUsers({ q, role: appliedRole, limit, offset })
        if (!cancelled) { setRows(res.users); setTotal(res.total) }
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Failed to load users')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [q, appliedRole, limit, offset])

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit])
  const pages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit])

  const canPrev = offset > 0
  const canNext = offset + limit < total

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-1.381z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">User Management</h1>
              <p className="text-gray-600 mt-1">Browse, edit, and manage student records • {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              Admin
            </div>
            <div className="inline-flex items-center gap-2 text-sm text-gray-700">
              <span className="opacity-70">Total</span>
              <span className="font-semibold text-blue-700">{total}</span>
              <button
                onClick={() => setIsAddAdminOpen(true)}
                className="ml-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg"
              >
                <PlusIcon /> Add Admin
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 relative">
            <input
              value={q}
              onChange={e => { setOffset(0); setQ(e.target.value) }}
              placeholder="Search by name, email, or student ID"
              className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-blue-300 outline-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><SearchIcon /></span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
            {(['all','student','admin'] as const).map(r => (
              <button
                key={r}
                onClick={() => { setOffset(0); setRole(r) }}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${role === r ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg transform scale-105' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                aria-pressed={role === r}
              >
                {r === 'all' ? 'All' : r.charAt(0).toUpperCase()+r.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Users Card */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a4 4 0 100 8 4 4 0 000-8zM2 18a8 8 0 1116 0H2z"/></svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Users</h2>
                <p className="text-sm text-gray-600">{loading ? 'Loading…' : `${rows.length} user${rows.length !== 1 ? 's' : ''} on page ${page} of ${pages}`}</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2">
              <button disabled={!canPrev || loading} onClick={() => setOffset(Math.max(0, offset - limit))} className={`px-3 py-2 rounded-xl text-sm font-medium border-2 ${(!canPrev || loading) ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-500 border-gray-200' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'}`}>Prev</button>
              <button disabled={!canNext || loading} onClick={() => setOffset(offset + limit)} className={`px-3 py-2 rounded-xl text-sm font-medium border-2 ${(!canNext || loading) ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-500 border-gray-200' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'}`}>Next</button>
            </div>
          </div>

          {error ? (
            <div className="p-6">
              <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-6 text-center text-red-700 text-sm">{error}</div>
            </div>
          ) : loading ? (
            <div className="p-6"><UserSkeleton rows={8} /></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-600">No users found.</div>
          ) : (
            <div className="p-6 space-y-4">
              {rows.map(u => (
                <div key={u.id} className="relative rounded-2xl border-2 p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border-gray-200 bg-white grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] items-center gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 grid place-items-center text-blue-700 font-bold ring-2 ring-gray-200 shadow-sm">
                        {initials(u)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold text-gray-900 truncate" title={displayName(u)}>{displayName(u)}</div>
                        <div className="text-xs text-gray-600 truncate">{u.email}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1 font-medium"><IdIcon /> {u.studentId || '—'}</span>
                      <span className="inline-flex items-center gap-1 font-medium"><RoleIcon /> {u.role === 'admin' ? 'Admin' : 'Student'}</span>
                      {u.lastLoginAt && <span className="inline-flex items-center gap-1 font-medium"><ClockIcon /> Last login {new Date(u.lastLoginAt).toLocaleString()}</span>}
                    </div>
                  </div>

                  <div className="justify-self-start md:justify-self-center text-[11px] text-gray-600">
                    <div className="text-gray-500">Reports</div>
                    <div className="text-blue-700 font-semibold">{u.itemsReported ?? 0}</div>
                  </div>
                  <div className="justify-self-start md:justify-self-center text-[11px] text-gray-600">
                    <div className="text-gray-500">Claims</div>
                    <div className="text-blue-700 font-semibold">{u.claimsMade ?? 0}</div>
                  </div>
                  <div className="justify-self-end inline-flex items-center gap-2">
                    {u.unreadNotifications ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200">{u.unreadNotifications} unread</span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">Up to date</span>
                    )}
                    <button
                      onClick={() => setEditing(u)}
                      disabled={busyId === u.id}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border-2 ${busyId === u.id ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500 border-gray-200' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'}`}
                    >
                      <EditIcon /> Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Edit Modal */}
        <EditUserModal
          open={!!editing}
          user={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            if (!editing) return
            setBusyId(editing.id)
            try {
              const updated = await updateUser(editing.id, payload)
              setRows(prev => prev.map(r => r.id === editing.id ? { ...r, ...updated } : r))
              setEditing(null)
            } catch (e) {
              alert((e as Error)?.message || 'Failed to update user')
            } finally {
              setBusyId(null)
            }
          }}
        />

        {/* Add Admin Modal */}
        <AddAdminModal
          open={isAddAdminOpen}
          onClose={() => setIsAddAdminOpen(false)}
          onCreated={async () => {
            // Refresh current page
            try {
              setLoading(true)
              const res = await listUsers({ q, role: appliedRole, limit, offset })
              setRows(res.users); setTotal(res.total)
            } catch (e) {
              setError((e as Error)?.message || 'Failed to refresh users')
            } finally {
              setLoading(false)
            }
          }}
        />
      </div>
    </div>
  )
}

function initials(u?: AdminUserRecord | null) {
  const f = (u?.firstName || '').trim()
  const l = (u?.lastName || '').trim()
  const fx = f ? f[0] : ''
  const lx = l ? l[0] : ''
  return (fx + lx || 'U').toUpperCase()
}

function displayName(u: AdminUserRecord) {
  const parts = [u.firstName, u.middleName, u.lastName].filter(Boolean)
  return parts.join(' ') || u.email
}

function UserSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="rounded-2xl border-2 border-gray-100 p-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-200 animate-pulse" />
              <div className="space-y-2">
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-52 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
            <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse justify-self-end" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EditUserModal({ open, user, onClose, onSave }: {
  open: boolean
  user: AdminUserRecord | null
  onClose: () => void
  onSave: (payload: UpdateUserInput) => Promise<void>
}) {
  const [form, setForm] = useState<UpdateUserInput>({
    email: user?.email || '',
    studentId: user?.studentId || '',
    firstName: user?.firstName || '',
    middleName: user?.middleName || '',
    lastName: user?.lastName || '',
    role: user?.role || 'student',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      email: user?.email || '',
      studentId: user?.studentId || '',
      firstName: user?.firstName || '',
      middleName: user?.middleName || '',
      lastName: user?.lastName || '',
      role: user?.role || 'student',
    })
  }, [user])

  const canSave = form.email?.includes('@') && (form.firstName?.trim() || user?.firstName) && (form.lastName?.trim() || user?.lastName)

  if (!open || !user) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/></svg>
            </div>
            <div className="text-[15px] font-semibold text-gray-900">Edit User</div>
          </div>
          <button onClick={onClose} className="size-9 inline-grid place-items-center rounded-md hover:bg-gray-100">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Email" type="email" value={form.email || ''} onChange={v => setForm((s: UpdateUserInput) => ({ ...s, email: v }))} required />
            <Input label="Student ID" value={form.studentId || ''} onChange={v => setForm((s: UpdateUserInput) => ({ ...s, studentId: v }))} />
            <Input label="First Name" value={form.firstName || ''} onChange={v => setForm((s: UpdateUserInput) => ({ ...s, firstName: v }))} required />
            <Input label="Middle Name" value={form.middleName || ''} onChange={v => setForm((s: UpdateUserInput) => ({ ...s, middleName: v }))} />
            <Input label="Last Name" value={form.lastName || ''} onChange={v => setForm((s: UpdateUserInput) => ({ ...s, lastName: v }))} required />
            <Select label="Role" value={form.role || 'student'} onChange={v => setForm((s: UpdateUserInput) => ({ ...s, role: v as 'student'|'admin' }))} options={[{ value: 'student', label: 'Student' }, { value: 'admin', label: 'Admin' }]} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50">Cancel</button>
          <button
            disabled={!canSave || saving}
            onClick={async () => { setSaving(true); try { await onSave(form) } finally { setSaving(false) } }}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${(!canSave || saving) ? 'opacity-50 cursor-not-allowed bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'}`}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

function AddAdminModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState<CreateAdminInput>({ email: '', firstName: '', middleName: '', lastName: '', password: '' })
  const [saving, setSaving] = useState(false)
  const canSave = form.email.includes('@') && form.firstName.trim() && form.lastName.trim() && form.password.length >= 8
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            </div>
            <div className="text-[15px] font-semibold text-gray-900">Add Admin</div>
          </div>
          <button onClick={onClose} className="size-9 inline-grid place-items-center rounded-md hover:bg-gray-100">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Email" type="email" value={form.email} onChange={v => setForm(s => ({ ...s, email: v }))} required />
            <Input label="Password" type="password" value={form.password} onChange={v => setForm(s => ({ ...s, password: v }))} required />
            <Input label="First Name" value={form.firstName} onChange={v => setForm(s => ({ ...s, firstName: v }))} required />
            <Input label="Middle Name" value={form.middleName ?? ''} onChange={v => setForm(s => ({ ...s, middleName: v }))} />
            <Input label="Last Name" value={form.lastName} onChange={v => setForm(s => ({ ...s, lastName: v }))} required />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50">Cancel</button>
          <button
            disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await createAdmin(form)
                await onCreated()
                onClose()
              } catch (e) {
                alert((e as Error)?.message || 'Failed to create admin')
              } finally {
                setSaving(false)
              }
            }}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${(!canSave || saving) ? 'opacity-50 cursor-not-allowed bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'}`}
          >
            Create Admin
          </button>
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', required }: { label: string, value: string, onChange: (v: string) => void, type?: string, required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700 font-medium">{label}{required && <span className="text-rose-500">*</span>}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-blue-300"
      />
    </label>
  )
}

function Select({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: { value: string, label: string }[] }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700 font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-blue-300"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7" /><path d="m21 21-3.5-3.5" />
    </svg>
  )
}
function IdIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h6M7 12h10M7 16h8" />
    </svg>
  )
}
function RoleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="8" r="4" /><path d="M4 20v-1a6 6 0 0 1 12 0v1" />
    </svg>
  )
}
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
    </svg>
  )
}
function EditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 21h4l11-11-4-4L4 17v4z" />
    </svg>
  )
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
