import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { listItems, type ItemDto, listClaims, type ClaimDto } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'
import { Link } from 'react-router-dom'

type TypeFilter = 'all' | 'lost' | 'found'
type UiStatus = 'unclaimed' | 'matched' | 'claim_pending' | 'claim_approved' | 'claim_rejected' | 'returned'
type StatusFilter = 'all' | UiStatus
type SortKey = 'reportedAt' | 'occurredOn' | 'title' | 'status'

export default function MyReportsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<ItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  // Student's claims map to derive claim-related statuses
  const [claimsByItem, setClaimsByItem] = useState<Map<number, ClaimDto>>(new Map())

  useEffect(() => {
    let active = true
    async function run() {
      if (!user) { setClaimsByItem(new Map()); return }
      try {
        const claims = await listClaims({ claimantUserId: user.id, limit: 1000 })
        if (!active) return
        const map = new Map<number, ClaimDto>()
        for (const c of claims) {
          const prev = map.get(c.itemId)
          const prevAt = prev?.createdAt ? Date.parse(prev.createdAt) : 0
          const curAt = c.createdAt ? Date.parse(c.createdAt) : 0
          if (!prev || curAt >= prevAt) map.set(c.itemId, c)
        }
        setClaimsByItem(map)
      } catch {
        // best-effort
      }
    }
    run()
    return () => { active = false }
  }, [user])

  const deriveStatus = useCallback((it: ItemDto): UiStatus => {
    const raw = (it.status || 'open').toLowerCase()
    if (raw === 'closed') return 'returned'
    const mine = claimsByItem.get(Number(it.id))
    if (mine) {
      const s = (mine.status || '').toLowerCase()
      if (s === 'approved') return 'claim_approved'
      if (s === 'rejected') return 'claim_rejected'
      if (s === 'requested' || s === 'verified' || s === 'pending') return 'claim_pending'
    }
    if (raw === 'matched') return 'matched'
    return 'unclaimed'
  }, [claimsByItem])

  const [sortBy, setSortBy] = useState<SortKey>('reportedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<ItemDto | null>(null)

  useEffect(() => {
    let active = true
    async function run() {
      if (!user) return
      setLoading(true)
      setError(null)
      try {
        // Fetch a generous limit to approximate "all" until pagination is added
        const data = await listItems({ reporterUserId: user.id, limit: 500 })
        if (!active) return
        setItems(data)
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Failed to load reports')
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => { active = false }
  }, [user])

  const filtered = useMemo(() => {
    let out = items.slice()
    if (typeFilter !== 'all') out = out.filter(i => i.type === typeFilter)
    if (statusFilter !== 'all') out = out.filter(i => deriveStatus(i) === statusFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter(i =>
        (i.title?.toLowerCase().includes(q)) ||
        (i.description?.toLowerCase().includes(q)) ||
        (i.location?.toLowerCase().includes(q))
      )
    }
    out.sort((a, b) => compareItems(a, b, sortBy, sortDir))
    return out
  }, [items, typeFilter, statusFilter, query, sortBy, sortDir, deriveStatus])

  const counts = useMemo(() => ({
    all: items.length,
    lost: items.filter(i => i.type === 'lost').length,
    found: items.filter(i => i.type === 'found').length,
  }), [items])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900">
      {/* Sticky header for consistency with Search page */}
      <div className="sticky top-0 z-40 backdrop-blur-md bg-white/80 border-b border-black/5">
        <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] bg-clip-text text-transparent">My Reports</h1>
              <p className="text-slate-600 text-base mt-1">Review and manage your lost and found submissions.</p>
            </div>
            <Link to="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[color:var(--brand)]/20 text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5 transition-colors font-medium">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              Back to Home
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Unified Search & Filters panel */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg overflow-hidden">
          {/* Search bar */}
          <div className="p-6 border-b border-black/5">
            <div className="relative max-w-2xl mx-auto">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search your reports... (title, description, location)"
                className="w-full h-14 rounded-2xl border border-black/10 bg-white/90 px-16 text-lg placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]/50 shadow-sm transition-all"
              />
              <svg className="absolute left-5 top-1/2 -translate-y-1/2 size-6 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 size-6 text-slate-500 hover:text-slate-700 transition-colors"
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="p-6 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
              {/* Type toggle */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                <div className="inline-flex rounded-xl border border-black/10 bg-white shadow-sm overflow-hidden">
                  {(['all','lost','found'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${typeFilter===t ? 'bg-[color:var(--brand)] text-white' : 'text-slate-700 hover:bg-black/5'}`}
                      aria-pressed={typeFilter===t}
                    >
                      {t === 'all' ? 'All' : t === 'lost' ? '🔍 Lost' : '✨ Found'} ({counts[t] as number})
                    </button>
                  ))}
                </div>
              </div>

              {/* Status (unified UI statuses) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm"
                >
                  <option value="all">All Status</option>
                  <option value="unclaimed">Unclaimed</option>
                  <option value="matched">Matched</option>
                  <option value="claim_pending">Claim Pending</option>
                  <option value="claim_approved">Claim Approved</option>
                  <option value="claim_rejected">Claim Rejected</option>
                  <option value="returned">Returned</option>
                </select>
              </div>

              {/* Sort by */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Sort By</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm"
                >
                  <option value="reportedAt">Reported date</option>
                  <option value="occurredOn">Occurred date</option>
                  <option value="title">Title</option>
                  <option value="status">Status</option>
                </select>
              </div>

              {/* Sort direction */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Direction</label>
                <button
                  onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-black/10 bg-white text-slate-700 shadow-sm hover:bg-slate-50 font-medium"
                  title={`Sort ${sortDir === 'asc' ? 'descending' : 'ascending'}`}
                >
                  <svg className={`size-4 ${sortDir==='asc' ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 7h10M7 12h7M7 17h4"/></svg>
                  {sortDir === 'asc' ? 'Ascending' : 'Descending'}
                </button>
              </div>
            </div>

            {/* CTA buttons */}
            <div className="flex items-center justify-end gap-2">
              <Link to="/report/lost" className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-sky-600 text-white font-medium shadow-sm hover:shadow-md">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
                Report Lost
              </Link>
              <Link to="/report/found" className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-emerald-600 text-white font-medium shadow-sm hover:shadow-md">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 13h14M12 5l7 8-7 8"/></svg>
                Report Found
              </Link>
            </div>
          </div>
        </div>

        {/* Results summary */}
        <div className="flex items-center justify-between p-4 bg-white/60 backdrop-blur rounded-xl border border-white/20">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold text-[var(--ink-700)]">
              {loading ? (
                <div className="flex items-center gap-2">
                  <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" className="opacity-25"/>
                    <path d="M21 12a9 9 0 0 1-9 9"/>
                  </svg>
                  Loading reports...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-[color:var(--brand)]"></div>
                  {filtered.length} report{filtered.length === 1 ? '' : 's'}
                </div>
              )}
            </div>
            {filtered.length > 0 && (
              <div className="text-sm text-[var(--ink-500)]">
                Showing {filtered.length} of {items.length}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-center">
            <div className="flex items-center justify-center gap-2">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item, idx) => {
              const ui = deriveStatus(item)
              return (
                <ReportCard key={item.id} item={item} uiStatus={ui} onOpen={() => setSelected(item)} index={idx} query={query} />
              )
            })}
          </div>
        )}

        {selected && (
          <ItemDetailModal item={selected} uiStatus={deriveStatus(selected)} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}

function ReportCard({ item, uiStatus, onOpen, index, query }: { item: ItemDto, uiStatus: UiStatus, onOpen: () => void, index: number, query: string }) {
  const badge = item.type === 'found' ? {
    text: 'Found Item',
    className: 'bg-green-600/90'
  } : {
    text: 'Lost Item',
    className: 'bg-purple-600/90'
  }

  const ui = uiStatus

  const imgSrc = item.photoThumbUrl || item.photoUrl || ''
  const dateStr = (item.occurredOn || item.reportedAt) ? new Date(item.occurredOn || item.reportedAt || '').toLocaleDateString() : undefined

  const tokens = useMemo(() => {
    const raw = query.trim().toLowerCase()
    if (!raw) return [] as string[]
    return Array.from(new Set(raw.split(/[^a-z0-9]+/i).filter(t => t && t.length > 2)))
  }, [query])

  const highlight = (text?: string | null) => {
    if (!text) return null
    if (tokens.length === 0) return <>{text}</>
    const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const re = new RegExp(`(${escaped.join('|')})`, 'ig')
    const parts = text.split(re)
    return (
      <>
        {parts.map((part, i) => (
          re.test(part) ? (
            <mark key={i} className="bg-amber-200/70 text-slate-900 rounded px-0.5">{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        ))}
      </>
    )
  }

  const isLost = item.type === 'lost'
  const wrapperCls = isLost
    ? 'rounded-2xl p-[2px] bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)]'
    : 'rounded-2xl p-[2px] bg-gradient-to-r from-emerald-500 to-green-300'

  return (
    <div className={wrapperCls}>
      <button
        onClick={onOpen}
        className="text-left group rounded-2xl bg-white/80 backdrop-blur-sm overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 w-full"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="relative aspect-video bg-gray-50 overflow-hidden">
          {imgSrc ? (
            <img src={imgSrc} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
          ) : (
            <div className="w-full h-full grid place-items-center text-gray-300 bg-gradient-to-br from-gray-100 to-gray-200">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
            </div>
          )}
          <div className="absolute top-3 left-3">{statusChip(ui)}</div>
          <span className={`absolute top-3 right-3 shrink-0 rounded-full text-white text-xs font-semibold px-3 py-1.5 backdrop-blur shadow-md ${badge.className}`}>
            {badge.text}
          </span>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        </div>
        <div className="p-5">
          <div className="font-bold text-lg line-clamp-1 group-hover:text-[color:var(--brand)] transition-colors" title={item.title}>
            {highlight(item.title) || item.title}
          </div>
          {item.description && (
            <p className="mt-2 text-sm text-slate-600 line-clamp-2 leading-relaxed">{highlight(item.description)}</p>
          )}
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span className="line-clamp-1 font-medium">{[item.location ?? undefined, dateStr].filter(Boolean).join(' • ')}</span>
            <span className="text-[color:var(--accent)] opacity-80 font-mono text-xs">#{String(item.id)}</span>
          </div>
        </div>
      </button>
    </div>
  )
}

function ItemDetailModal({ item, uiStatus, onClose }: { item: ItemDto, uiStatus: UiStatus, onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const imgSrc = item.photoUrl || item.photoThumbUrl || undefined
  const badge = item.type === 'found' ? {
    text: 'Found',
    className: 'bg-emerald-600/90 text-white'
  } : {
    text: 'Lost',
    className: 'bg-purple-600/90 text-white'
  }
  const ui = uiStatus
  const statusStyle: Record<UiStatus, string> = {
    unclaimed: 'bg-slate-100 text-slate-800 border-slate-200',
    matched: 'bg-amber-100 text-amber-800 border-amber-200',
    claim_pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    claim_approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    claim_rejected: 'bg-rose-100 text-rose-800 border-rose-200',
    returned: 'bg-sky-100 text-sky-800 border-sky-200',
  }

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog" aria-labelledby="item-title" aria-describedby="item-desc">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Make backdrop scrollable and align modal near the top on small screens to prevent overlap */}
      <div className="absolute inset-0 p-4 sm:p-6 overflow-y-auto flex items-start justify-center">
        <div
          ref={ref}
          className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl ring-1 ring-black/5 animate-in"
          style={{ animation: 'modal-in 160ms ease-out' }}
        >
          {/* Header image */}
          <div className="relative aspect-[16/9] bg-slate-100">
            {imgSrc ? (
              <img src={imgSrc} alt={item.title} className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-slate-300">
                <svg className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11.5" r="2.5"/><path d="M21 15l-5-5L5 21"/></svg>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.className}`}>{badge.text}</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium border ${statusStyle[ui]}`}>{pretty(ui)}</span>
            </div>
            <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 inline-flex items-center justify-center size-9 rounded-full bg-white/90 ring-1 ring-black/10 hover:bg-white transition-colors">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-5 max-h-[80vh] overflow-y-auto">
            <h2 id="item-title" className="text-2xl font-semibold text-slate-900 mb-1">{item.title}</h2>
            {item.description && (
              <p id="item-desc" className="text-slate-700 leading-relaxed mb-4">{item.description}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <DetailRow label="Type" value={capitalize(item.type)} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              )} />
              <DetailRow label="Status" value={pretty(ui)} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 6v6l4 2"/></svg>
              )} />
              <DetailRow label="Location" value={item.location || '—'} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s8-4.5 8-10a8 8 0 1 0-16 0c0 5.5 8 10 8 10Z"/><circle cx="12" cy="11" r="3"/></svg>
              )} />
              <DetailRow label="Occurred" value={formatDate(item.occurredOn) || '—'} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>
              )} />
              <DetailRow label="Reported" value={formatDateTime(item.reportedAt) || '—'} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>
              )} />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 sticky bottom-0 bg-white">
              <button onClick={onClose} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-black/10 bg-white text-[var(--ink)] hover:bg-black/5 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Modal in animation keyframes */}
      <style>{`@keyframes modal-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  )
}

function DetailRow({ label, value, icon }: { label: string, value: string, icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/80 backdrop-blur-sm px-3 py-2.5 shadow-sm">
      <div className="text-sky-600/80">{icon}</div>
      <div>
        <div className="text-xs text-slate-600">{label}</div>
        <div className="text-sm font-medium text-slate-900">{value}</div>
      </div>
    </div>
  )
}
function statusChip(ui: UiStatus) {
  const cfg: Record<UiStatus, { label: string; cls: string }> = {
    unclaimed: { label: 'Unclaimed', cls: 'bg-slate-600/90' },
    matched: { label: 'Matched', cls: 'bg-amber-600/90' },
    claim_pending: { label: 'Claim Pending', cls: 'bg-yellow-500/90' },
    claim_approved: { label: 'Claim Approved', cls: 'bg-emerald-600/90' },
    claim_rejected: { label: 'Claim Rejected', cls: 'bg-rose-600/90' },
    returned: { label: 'Returned', cls: 'bg-sky-600/90' },
  }
  const c = cfg[ui]
  return <span className={`${c.cls} rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur`}>{c.label}</span>
}
function pretty(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-black/10 bg-white/80 backdrop-blur-sm shadow-sm">
          <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse" />
          <div className="p-5">
            <div className="h-5 w-48 bg-black/5 rounded mb-3 animate-pulse" />
            <div className="h-4 w-full bg-black/5 rounded mb-2 animate-pulse" />
            <div className="h-4 w-2/3 bg-black/5 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-white/70 backdrop-blur-sm rounded-2xl border border-black/10">
      <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-sky-600/10 text-sky-600 mb-4">
        <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">No reports yet</h2>
      <p className="text-slate-600 mb-6">You haven’t submitted any lost or found items. Create your first report to get started.</p>
      <div className="flex items-center justify-center gap-2">
        <Link to="/report/lost" className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-sky-600 text-white font-medium shadow-sm hover:shadow-md">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
          Report Lost
        </Link>
        <Link to="/report/found" className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-emerald-600 text-white font-medium shadow-sm hover:shadow-md">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 13h14M12 5l7 8-7 8"/></svg>
          Report Found
        </Link>
      </div>
    </div>
  )
}

function compareItems(a: ItemDto, b: ItemDto, key: SortKey, dir: 'asc' | 'desc') {
  const m = dir === 'asc' ? 1 : -1
  switch (key) {
    case 'reportedAt':
      return ((a.reportedAt ?? '') < (b.reportedAt ?? '') ? -1 : 1) * m
    case 'occurredOn':
      return ((a.occurredOn ?? '') < (b.occurredOn ?? '') ? -1 : 1) * m
    case 'title':
      return ((a.title ?? '') < (b.title ?? '') ? -1 : 1) * m
    case 'status':
      return ((a.status ?? '') < (b.status ?? '') ? -1 : 1) * m
    default:
      return 0
  }
}

function formatDate(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString()
}

function formatDateTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

function capitalize(s?: string) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
