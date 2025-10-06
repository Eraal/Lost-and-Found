import { useEffect, useMemo, useState, useCallback } from 'react'
import { listClaims, type ClaimDto } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'
import { useLocation, useNavigate } from 'react-router-dom'

type ClaimUiStatus = 'pending' | 'approved' | 'rejected' | 'returned'

export default function MyClaimsTrackerPage() {
  const { user } = useAuth()
  const location = useLocation() as { state?: { focusClaimId?: number } }
  const focusClaimId = location.state?.focusClaimId
  const [claims, setClaims] = useState<ClaimDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ClaimUiStatus>('all')
  const [refreshTick, setRefreshTick] = useState(0)
  const [highlightId, setHighlightId] = useState<number | null>(null)

  // Fetch user claims
  useEffect(() => {
    let active = true
    async function run() {
      if (!user) { setClaims([]); setLoading(false); return }
      setLoading(true); setError(null)
      try {
        const data = await listClaims({ claimantUserId: user.id, limit: 500 })
        if (!active) return
        setClaims(data)
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Failed to load claims')
      } finally { if (active) setLoading(false) }
    }
    run()
    return () => { active = false }
  }, [user, refreshTick])

  // Soft auto-refresh every 30s while on page
  useEffect(() => {
    const id = setInterval(() => setRefreshTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Focus/highlight a claim when navigated from notification
  useEffect(() => {
    if (focusClaimId) {
      setHighlightId(focusClaimId)
      const el = document.getElementById(`claim-${focusClaimId}`)
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
        setTimeout(() => setHighlightId(null), 4000)
      }
    }
  }, [focusClaimId, claims])

  const deriveUi = useCallback((c: ClaimDto): ClaimUiStatus => {
    const s = (c.status || '').toLowerCase()
    if (s === 'rejected') return 'rejected'
    if (c.item && (c.item.status === 'closed' || c.item.status === 'returned')) return 'returned'
    if (s === 'approved') return 'approved'
    return 'pending'
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return claims.filter(c => {
      if (statusFilter !== 'all' && deriveUi(c) !== statusFilter) return false
      if (!q) return true
      const itemTitle = c.item?.title?.toLowerCase() || ''
      return itemTitle.includes(q) || String(c.id).includes(q) || String(c.itemId).includes(q)
    }).sort((a, b) => ((b.createdAt || '').localeCompare(a.createdAt || '')))
  }, [claims, statusFilter, search, deriveUi])

  const counts = useMemo(() => {
    const map = { pending: 0, approved: 0, rejected: 0, returned: 0 } as Record<ClaimUiStatus, number>
    for (const c of claims) map[deriveUi(c)]++
    return map
  }, [claims, deriveUi])

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 text-slate-900">
      <div className="sticky top-0 z-40 backdrop-blur-md bg-white/80 border-b border-black/5">
        <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] bg-clip-text text-transparent">My Claims</h1>
              <p className="text-slate-600 text-base mt-1">Track the progress of your item claim requests in real time.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setRefreshTick(t => t + 1)} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-white border border-[color:var(--brand)]/30 text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5 font-medium shadow-sm">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Filters/Search */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg overflow-hidden">
          <div className="p-6 grid gap-6 md:grid-cols-3">
            <div className="md:col-span-1 space-y-3">
              <label className="block text-sm font-medium text-slate-700">Search</label>
              <div className="relative">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by item title or claim ID" className="w-full h-12 rounded-xl border border-black/10 bg-white/90 px-12 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]/40 shadow-sm" />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                {search && <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg></button>}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-3">Status</label>
              <div className="flex flex-wrap gap-2">
                {(['all','pending','approved','rejected','returned'] as const).map(s => {
                  const count = s === 'all' ? claims.length : counts[s as ClaimUiStatus]
                  return (
                    <button key={s} onClick={() => setStatusFilter(s as any)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors shadow-sm ${statusFilter===s ? 'bg-[color:var(--brand)] text-white border-[color:var(--brand)] shadow-md' : 'bg-white text-slate-700 border-black/10 hover:bg-black/5'}`}>{capitalize(s)} <span className={`text-xs rounded-full px-2 py-0.5 ${statusFilter===s ? 'bg-black/20' : 'bg-black/5'}`}>{count}</span></button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-center">{error}</div>
        )}
        {loading ? (
          <SkeletonClaims />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(c => <ClaimCard key={c.id} claim={c} ui={deriveUi(c)} highlight={highlightId===c.id} />)}
          </div>
        )}
      </div>
      <style>{`
      @keyframes pulse-border { 0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,.6);} 50% { box-shadow: 0 0 0 6px rgba(59,130,246,0);} }
      .highlight-claim { animation: pulse-border 1.8s ease-in-out 2; }
      `}</style>
    </div>
  )
}

function ClaimCard({ claim, ui, highlight }: { claim: ClaimDto, ui: ClaimUiStatus, highlight?: boolean }) {
  const navigate = useNavigate()
  const created = claim.createdAt ? new Date(claim.createdAt) : null
  const approved = claim.approvedAt ? new Date(claim.approvedAt) : null
  const item = claim.item
  const stage = ui
  const steps: { key: ClaimUiStatus | 'rejected'; label: string; active: boolean; done: boolean }[] = [
    { key: 'pending', label: 'Requested', active: stage === 'pending', done: ['approved','returned','rejected'].includes(stage) },
    { key: 'approved', label: 'Approved', active: stage === 'approved', done: ['returned'].includes(stage) },
    { key: 'returned', label: 'Returned', active: stage === 'returned', done: stage === 'returned' },
  ]
  const rejected = stage === 'rejected'
  return (
  <div id={`claim-${claim.id}`} onClick={() => navigate(`/claim/${claim.id}`)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/claim/${claim.id}`)}} className={`relative group overflow-hidden rounded-2xl border bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/50 ${highlight ? 'ring-2 ring-[color:var(--brand)] highlight-claim' : 'border-black/10'} ${rejected ? 'border-rose-200 bg-rose-50/60' : ''}`}>      
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-lg text-slate-900 truncate flex items-center gap-2" title={item?.title || `Claim #${claim.id}`}>            
              {item?.title || `Claim #${claim.id}`}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeStyle(ui)}`}>{capitalize(ui)}</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">Claim #{claim.id} • Item #{claim.itemId}</p>
          </div>
          {item?.photoUrl && (
            <img src={item.photoUrl} alt={item.title || ''} className="size-16 rounded-xl object-cover ring-1 ring-black/10" />
          )}
        </div>

        {/* Progress / Status */}
        {!rejected ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-medium text-slate-600">
              {steps.map((s,i) => (
                <span key={s.key} className={`flex-1 text-center ${i===0?'text-left':''} ${i===steps.length-1?'text-right':''}`}>{s.label}</span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {steps.map((s,i) => (
                <div key={s.key} className="flex items-center flex-1 last:flex-none last:w-5">
                  <div className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow ${s.done || s.active ? 'bg-[color:var(--brand)] text-white' : 'bg-slate-200 text-slate-500'} ${s.active && !s.done ? 'ring-4 ring-[color:var(--brand)]/30' : ''}`}>{i+1}</div>
                  {i < steps.length -1 && <div className={`h-1 flex-1 rounded-full mx-1 ${steps[i+1].done || steps[i].done ? 'bg-[color:var(--brand)]' : 'bg-slate-200'}`}></div>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-sm font-medium flex items-center gap-2">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01"/><path d="M2.5 19h19L12 3 2.5 19Z"/></svg>
            Claim Rejected{claim.adminNote ? ': ' + claim.adminNote : ''}
          </div>
        )}

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-3">
          <Meta label="Requested" value={created ? created.toLocaleString() : '—'} icon={<ClockIcon />} />
          <Meta label="Approved" value={approved ? approved.toLocaleString() : '—'} icon={<CheckIcon />} />
          <Meta label="Item Status" value={capitalize(item?.status || '—')} icon={<ItemIcon />} />
          <Meta label="Match Score" value={claim.matchScore ? Math.round(claim.matchScore) + '%' : '—'} icon={<SparkIcon />} />
        </div>

        {claim.notes && (
          <NoteBlock title="Your Notes" body={claim.notes} accent="brand" />
        )}
        {claim.adminNote && ui !== 'rejected' && (
          <NoteBlock title="Admin Note" body={claim.adminNote} accent="accent" />
        )}
      </div>
    </div>
  )
}

function Meta({ label, value, icon }: { label: string, value: string, icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/70 px-3 py-2 shadow-sm">
      <div className="text-[color:var(--brand)]/70">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
        <div className="text-sm font-semibold text-slate-800 truncate" title={value}>{value}</div>
      </div>
    </div>
  )
}

function NoteBlock({ title, body, accent }: { title: string, body: string, accent: 'brand' | 'accent' }) {
  const cls = accent === 'brand' ? 'from-[color:var(--brand)]/10 via-[color:var(--brand)]/5' : 'from-[color:var(--accent)]/10 via-[color:var(--accent)]/5'
  return (
    <div className={`rounded-xl border border-black/10 bg-gradient-to-br ${cls} to-transparent p-4 space-y-1`}>      
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  )
}

function SkeletonClaims() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_,i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-black/10 bg-white/70 backdrop-blur-sm p-5 animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="h-2 rounded bg-gray-100" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_,j) => <div key={j} className="h-12 rounded-xl bg-gray-100" />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-white/70 backdrop-blur-sm rounded-2xl border border-black/10">
      <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-[color:var(--brand)]/10 text-[color:var(--brand)] mb-4">
        <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">No claims yet</h2>
      <p className="text-slate-600 max-w-md mx-auto text-sm leading-relaxed">When you request to reclaim a found item, your claim will appear here with real‑time status updates and notes.</p>
    </div>
  )
}

// Icons
function ClockIcon() { return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l3 3"/></svg> }
function CheckIcon() { return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12l5 5L20 7"/></svg> }
function ItemIcon() { return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7h18"/><path d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M9 7V4h6v3"/></svg> }
function SparkIcon() { return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v6"/><path d="M12 15v6"/><path d="M5.6 5.6l4.2 4.2"/><path d="M14.2 14.2l4.2 4.2"/><path d="M3 12h6"/><path d="M15 12h6"/><path d="M5.6 18.4l4.2-4.2"/><path d="M14.2 9.8l4.2-4.2"/></svg> }

// Helpers
function badgeStyle(ui: ClaimUiStatus) {
  switch (ui) {
    case 'pending': return 'bg-amber-100 text-amber-700'
    case 'approved': return 'bg-emerald-100 text-emerald-700'
    case 'rejected': return 'bg-rose-100 text-rose-700'
    case 'returned': return 'bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
    default: return 'bg-slate-200 text-slate-700'
  }
}
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
