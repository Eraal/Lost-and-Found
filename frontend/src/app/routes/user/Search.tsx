import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listItems, type ItemDto, createClaim, smartSearch, type SmartMatch, upsertMatch, confirmMatch, dismissMatch, listClaims, type ClaimDto } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'
import RequestClaimModal from '../../../components/RequestClaimModal'
import ItemDetailsModal from '../../../components/ItemDetailsModal'

type ItemCard = {
  id: string | number
  title: string
  description?: string | null
  type?: 'lost' | 'found'
  location?: string | null
  occurredOn?: string | null
  reportedAt?: string | null
  photoUrl?: string | null
  photoThumbUrl?: string | null
  status?: 'open' | 'matched' | 'claimed' | 'closed' | string
  reporterUserId?: number | null
  // Derived convenience field for found items: human-friendly finder name (reporter)
  finderName?: string | null
}

export default function SearchPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<ItemCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [requested, setRequested] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<{ open: boolean, itemId?: number, title?: string }>(() => ({ open: false }))
  const [visible, setVisible] = useState(24)
  const [params, setParams] = useSearchParams()
  const [smartType, setSmartType] = useState<'lost' | 'found'>(() => (params.get('smartType') === 'found' ? 'found' : 'lost'))
  const [smartMatches, setSmartMatches] = useState<SmartMatch[]>([])
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartError, setSmartError] = useState<string | null>(null)
  const [baseItemId, setBaseItemId] = useState<number | null>(null)
  const [matchActionBusy, setMatchActionBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [details, setDetails] = useState<{ open: boolean, item: ItemCard | null }>({ open: false, item: null })
  const [showSmartSearch, setShowSmartSearch] = useState(false)
  // Unified statuses
  type UiStatus = 'unclaimed' | 'matched' | 'claim_pending' | 'claim_approved' | 'claim_rejected' | 'returned'
  const [claimsByItem, setClaimsByItem] = useState<Map<number, ClaimDto>>(new Map())

  // Filters synced with URL
  const [q, setQ] = useState(() => params.get('q') ?? '')
  // Found-only view per student request
  const [typeFilter, setTypeFilter] = useState(() => (params.get('type') ?? 'found').toLowerCase())
  const [locationFilter, setLocationFilter] = useState(() => (params.get('location') ?? 'all').toLowerCase())
  // normalize legacy/unfriendly values, e.g. "unclaimed" -> "open"
  const initialStatus = (params.get('status') ?? 'all').toLowerCase()
  const [statusFilter, setStatusFilter] = useState<UiStatus | 'all'>(() => {
    const s = initialStatus
    if (s === 'closed') return 'returned'
    if (s === 'open') return 'unclaimed'
    if (s === 'matched' || s === 'claim_pending' || s === 'claim_approved' || s === 'claim_rejected' || s === 'returned' || s === 'unclaimed') return s as UiStatus
    return 'all'
  })
  const [hasPhotoOnly, setHasPhotoOnly] = useState(() => params.get('photo') === '1')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'az' | 'za'>(() => {
    const s = params.get('sort')
    return s === 'oldest' || s === 'az' || s === 'za' || s === 'newest' ? s : 'newest'
  })

  // Smart card helpers (after q is defined)
  const tokens = useMemo(() => {
    const raw = q.trim().toLowerCase()
    if (!raw) return [] as string[]
    return Array.from(new Set(raw.split(/[^a-z0-9]+/i).filter(t => t && t.length > 2)))
  }, [q])

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
            <mark key={i} className="bg-amber-200/70 text-[var(--ink)] rounded px-0.5">{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        ))}
      </>
    )
  }

  const ConfidenceBadge = ({ score }: { score: number }) => {
    const pct = Math.round(score * 100)
    const level = score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low'
    const color = level === 'high' ? 'bg-emerald-600/90' : level === 'medium' ? 'bg-amber-600/90' : 'bg-gray-600/90'
    const Icon = () => level === 'high' ? (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 6.5L12 17.8 5.8 20.7 7 14.2 2 9.3l6.9-1z"/></svg>
    ) : level === 'medium' ? (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a10 10 0 1 1 10-10 10.01 10.01 0 0 1-10 10Zm0-14a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 12 8Z"/></svg>
    ) : (
      <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>
    )
    return (
      <span className={`inline-flex items-center gap-1 rounded-full ${color} text-white text-[10px] font-semibold px-2 py-1`} title={`Match confidence ${pct}%`}>
        <Icon />
        {pct}%
      </span>
    )
  }

  const ScoreBar = ({ score }: { score: number }) => (
    <div className="mt-2 h-1.5 w-full rounded-full bg-black/5 overflow-hidden" aria-hidden>
      <div
        className={`h-full rounded-full ${score>=0.75 ? 'bg-emerald-500' : score>=0.5 ? 'bg-amber-500' : 'bg-gray-400'}`}
        style={{ width: `${Math.max(5, Math.min(100, Math.round(score * 100)))}%` }}
      />
    </div>
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const list = await listItems({ limit: 500 }).catch(() => [])
        if (!cancelled) {
          const mapped: ItemCard[] = list.map((it: ItemDto) => ({
            id: it.id,
            title: it.title,
            description: it.description ?? undefined,
            type: it.type,
            location: it.location ?? undefined,
            occurredOn: it.occurredOn ?? undefined,
            reportedAt: it.reportedAt ?? undefined,
            photoUrl: it.photoThumbUrl || it.photoUrl || undefined,
            photoThumbUrl: it.photoThumbUrl || undefined,
            status: (it.status as ItemCard['status']) ?? 'open',
            reporterUserId: typeof it.reporterUserId === 'number' ? it.reporterUserId : null,
            finderName: it.type === 'found' && it.reporter
              ? (() => {
                  const first = (it.reporter?.firstName || '').trim()
                  const last = (it.reporter?.lastName || '').trim()
                  const full = [first, last].filter(Boolean).join(' ').trim()
                  if (full) return full
                  const emailUser = (it.reporter?.email || '').split('@')[0]
                  return emailUser || null
                })()
              : null,
          }))
          setItems(mapped)
        }
      } catch {
        if (!cancelled) setError('Failed to load items')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Load current user's claims to derive claim-related statuses
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!user) { setClaimsByItem(new Map()); return }
      try {
        const claims = await listClaims({ claimantUserId: user.id, limit: 1000 })
        if (cancelled) return
        const map = new Map<number, ClaimDto>()
        for (const c of claims) {
          const prev = map.get(c.itemId)
          const prevAt = prev?.createdAt ? Date.parse(prev.createdAt) : 0
          const curAt = c.createdAt ? Date.parse(c.createdAt) : 0
          if (!prev || curAt >= prevAt) map.set(c.itemId, c)
        }
        setClaimsByItem(map)
      } catch { /* ignore */ }
    }
    run()
    return () => { cancelled = true }
  }, [user])

  const deriveStatus = useCallback((it: ItemCard): UiStatus => {
    const raw = (it.status || 'open').toLowerCase()
    if (raw === 'closed') return 'returned'
    const my = claimsByItem.get(Number(it.id))
    if (my) {
      const s = (my.status || '').toLowerCase()
      if (s === 'approved') return 'claim_approved'
      if (s === 'rejected') return 'claim_rejected'
      if (s === 'requested' || s === 'verified' || s === 'pending') return 'claim_pending'
    }
    if (raw === 'matched') return 'matched'
    return 'unclaimed'
  }, [claimsByItem])

  const statusChip = (ui: UiStatus, itemType?: 'lost' | 'found') => {
    const cfg: Record<UiStatus, { label: string; cls: string }> = {
      unclaimed: { label: itemType === 'lost' ? 'Missing' : 'Unclaimed', cls: 'bg-slate-600/90' },
      matched: { label: 'Matched', cls: 'bg-amber-600/90' },
      claim_pending: { label: 'Claim Pending', cls: 'bg-yellow-500/90' },
      claim_approved: { label: 'Claim Approved', cls: 'bg-emerald-600/90' },
      claim_rejected: { label: 'Claim Rejected', cls: 'bg-rose-600/90' },
      returned: { label: 'Returned', cls: 'bg-sky-600/90' },
    }
    const c = cfg[ui]
    return <span className={`${c.cls} rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur`}>{c.label}</span>
  }

  // Keep URL in sync when filters change
  useEffect(() => {
    const next = new URLSearchParams()
    if (q.trim()) next.set('q', q.trim())
    if (typeFilter !== 'all') next.set('type', typeFilter)
    if (locationFilter !== 'all') next.set('location', locationFilter)
  if (statusFilter !== 'all') next.set('status', statusFilter)
    if (hasPhotoOnly) next.set('photo', '1')
    if (sort !== 'newest') next.set('sort', sort)
    if (smartType !== 'lost') next.set('smartType', smartType)
    setParams(next, { replace: true })
  }, [q, typeFilter, locationFilter, statusFilter, hasPhotoOnly, sort, smartType, setParams])

  // Types memo removed: enforcing Found-only view
  const locations = useMemo(
    () => Array.from(new Set(items.map(i => i.location?.trim()).filter((x): x is string => Boolean(x)))).sort(),
    [items]
  )

  const filtered = useMemo(() => {
    const qlc = q.trim().toLowerCase()
    const matchQ = (it: ItemCard) =>
      !qlc ||
      it.title.toLowerCase().includes(qlc) ||
      (it.description?.toLowerCase().includes(qlc) ?? false) ||
      (it.type?.toLowerCase().includes(qlc) ?? false) ||
      (it.location?.toLowerCase().includes(qlc) ?? false)

  // Respect the toggle: show selected type
  const passType = (it: ItemCard) => typeFilter === 'all' || (it.type ?? '').toLowerCase() === typeFilter
    const passLoc = (it: ItemCard) => locationFilter === 'all' || (it.location ?? '').toLowerCase() === locationFilter
    const passStatus = (it: ItemCard) => {
      if (statusFilter === 'all') return true // show all statuses by default
      return deriveStatus(it) === statusFilter
    }
    const passPhoto = (it: ItemCard) => !hasPhotoOnly || Boolean(it.photoUrl)

    const byDate = (a?: string, b?: string) => {
      const da = a ? Date.parse(a) : 0
      const db = b ? Date.parse(b) : 0
      return db - da
    }

    let out = items.filter(it => matchQ(it) && passType(it) && passLoc(it) && passStatus(it) && passPhoto(it))

    // Primary sort: Unclaimed first, Claimed last (based on raw item.status where available)
    const primaryWeight = (it: ItemCard) => {
      const raw = String(it.status || 'open').toLowerCase()
      if (raw === 'open') return 0 // unclaimed top
      if (raw === 'matched') return 1
      if (raw === 'closed') return 3
      if (raw === 'claimed') return 4 // bottom
      return 2
    }
    const secondary = (a: ItemCard, b: ItemCard) => {
      switch (sort) {
        case 'newest':
          return byDate(a.reportedAt ?? a.occurredOn ?? undefined, b.reportedAt ?? b.occurredOn ?? undefined)
        case 'oldest':
          return -byDate(a.reportedAt ?? a.occurredOn ?? undefined, b.reportedAt ?? b.occurredOn ?? undefined)
        case 'az':
          return a.title.localeCompare(b.title)
        case 'za':
          return b.title.localeCompare(a.title)
        default:
          return 0
      }
    }
    out = out.sort((a, b) => {
      const pa = primaryWeight(a)
      const pb = primaryWeight(b)
      if (pa !== pb) return pa - pb
      return secondary(a, b)
    })
    return out
  }, [items, q, typeFilter, locationFilter, statusFilter, hasPhotoOnly, sort, deriveStatus])

  const toShow = useMemo(() => filtered.slice(0, visible), [filtered, visible])

  // Smart Search trigger (auto when query is present)
  useEffect(() => {
    let cancelled = false
    async function runSmart() {
      const query = q.trim()
      try {
        setSmartLoading(true)
        setSmartError(null)
        let list: SmartMatch[] = []
        if (baseItemId) {
          list = await smartSearch({ itemId: baseItemId, limit: 12 })
        } else {
          if (!query || query.length < 3) {
            setSmartMatches([])
            setSmartError(null)
            return
          }
          const loc = locationFilter !== 'all' ? locationFilter : undefined
          list = await smartSearch({ q: query, type: smartType, location: loc, limit: 12 })
        }
        if (!cancelled) setSmartMatches(list)
      } catch (e) {
        if (!cancelled) setSmartError((e as Error).message || 'Smart search failed')
      } finally {
        if (!cancelled) setSmartLoading(false)
      }
    }
    runSmart()
    return () => { cancelled = true }
  }, [q, locationFilter, smartType, baseItemId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-[var(--ink)]" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Enhanced Header */}
      <div className="sticky top-0 z-40 backdrop-blur-md bg-white/80 border-b border-black/5">
        <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] bg-clip-text text-transparent">
                Lost & Found Hub
              </h1>
              <p className="text-[var(--ink-600)] text-base mt-1">Discover and reconnect with items across campus</p>
            </div>
            <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[color:var(--brand)]/20 text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5 transition-colors font-medium">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              Back to Home
            </Link>
          </div>
        </div>
      </div>

  <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        
        {/* Enhanced Search & Filter Section */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg overflow-hidden">
          {/* Main Search Bar */}
          <div className="p-6 border-b border-black/5">
            <div className="relative max-w-2xl mx-auto">
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setVisible(24) }}
                placeholder="Search for items... (e.g., wallet, keys, laptop)"
                className="w-full h-14 rounded-2xl border border-black/10 bg-white/90 px-16 text-lg placeholder:text-[var(--ink-500)] outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]/50 shadow-sm transition-all"
              />
              <svg className="absolute left-5 top-1/2 -translate-y-1/2 size-6 text-[var(--ink-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              {q && (
                <button
                  onClick={() => setQ('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 size-6 text-[var(--ink-500)] hover:text-[var(--ink-700)] transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Filter Controls */}
          <div className="p-6 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
            {/* Found vs Lost Toggle */}
            <div className="mb-4 flex items-center justify-center">
              <div className="inline-flex rounded-xl border border-black/10 bg-white shadow-sm overflow-hidden" role="tablist" aria-label="View type">
                {(['found','lost'] as const).map(t => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={typeFilter===t}
                    onClick={() => { setTypeFilter(t); setVisible(24) }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${typeFilter===t ? 'bg-[color:var(--brand)] text-white' : 'text-[var(--ink-700)] hover:bg-black/5'}`}
                  >
                    {t === 'found' ? 'Found Items' : 'Lost Items'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
              {/* ...rest of filters remain ... */}
              <div>
                <label className="block text-sm font-medium text-[var(--ink-700)] mb-2">Location</label>
                <select
                  value={locationFilter}
                  onChange={e => { setLocationFilter(e.target.value.toLowerCase()); setVisible(24) }}
                  className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm"
                >
                  <option value="all">All Locations</option>
                  {locations.map(l => <option key={l} value={l.toLowerCase()}>📍 {l}</option>)}
                </select>
              </div>
        <div>
                <label className="block text-sm font-medium text-[var(--ink-700)] mb-2">Status</label>
        <select
                  value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value as UiStatus | 'all'); setVisible(24) }}
                  className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm"
                >
          <option value="all">All Status</option>
      <option value="unclaimed">{typeFilter === 'lost' ? 'Missing' : '🔓 Unclaimed'}</option>
          <option value="matched">🔗 Matched</option>
          <option value="claim_pending">🕒 Claim Pending</option>
          <option value="claim_approved">✅ Claim Approved</option>
          <option value="claim_rejected">⛔ Claim Rejected</option>
          <option value="returned">� Returned</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink-700)] mb-2">Sort By</label>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as typeof sort)}
                  className="w-full h-11 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm"
                >
                  <option value="newest">📅 Newest First</option>
                  <option value="oldest">⏰ Oldest First</option>
                  <option value="az">🔤 A → Z</option>
                  <option value="za">🔤 Z → A</option>
                </select>
              </div>
            </div>
            
            {/* Additional Options */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <label className="inline-flex items-center gap-3 text-sm font-medium text-[var(--ink-700)]">
                <input 
                  type="checkbox" 
                  checked={hasPhotoOnly} 
                  onChange={e => { setHasPhotoOnly(e.target.checked); setVisible(24) }} 
                  className="size-5 rounded-md border-black/20 text-[color:var(--brand)] focus:ring-[color:var(--brand)]/30" 
                />
                <span className="flex items-center gap-2">
                  📸 Items with photos only
                </span>
              </label>

              {/* Smart Search Toggle */}
              <button
                onClick={() => setShowSmartSearch(!showSmartSearch)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${showSmartSearch ? 'bg-[color:var(--brand)] text-white shadow-md' : 'bg-white border border-[color:var(--brand)]/20 text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                Smart Search
              </button>
            </div>
          </div>

          {/* Smart Search Panel */}
          {showSmartSearch && (
            <div className="p-6 bg-gradient-to-r from-purple-50/50 to-pink-50/50 border-t border-black/5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--ink-800)] mb-3"> Smart Matching</h3>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm text-[var(--ink-600)]">I am looking for:</span>
                    <div className="inline-flex rounded-xl border border-black/10 bg-white shadow-sm overflow-hidden">
                      {(['lost','found'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setSmartType(t)}
                          className={`px-4 py-2 text-sm font-medium transition-colors ${smartType===t ? 'bg-[color:var(--brand)] text-white' : 'text-[var(--ink-700)] hover:bg-black/5'}`}
                          aria-pressed={smartType===t}
                        >
                          {t === 'lost' ? '🔍 Items I lost' : '✨ Items I found'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {user?.role === 'admin' && (
                    <select
                      value={baseItemId ?? ''}
                      onChange={e => setBaseItemId(e.target.value ? Number(e.target.value) : null)}
                      className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 shadow-sm"
                      title="Choose a base item to match against"
                    >
                      <option value="">Base: Use search keywords</option>
                      {items.filter(i => i.type === smartType).slice(0, 200).map(i => (
                        <option key={i.id} value={String(i.id)}>{`#${i.id} ${i.title}`}</option>
                      ))}
                    </select>
                  )}
                  
                  <button
                    onClick={async () => {
                      const query = q.trim()
                      if (!baseItemId && !query) return
                      try {
                        setSmartLoading(true)
                        setSmartError(null)
                        let list: SmartMatch[] = []
                        if (baseItemId) {
                          list = await smartSearch({ itemId: baseItemId, limit: 12 })
                        } else {
                          const loc = locationFilter !== 'all' ? locationFilter : undefined
                          list = await smartSearch({ q: query, type: smartType, location: loc, limit: 12 })
                        }
                        setSmartMatches(list)
                      } catch (e) {
                        setSmartError((e as Error).message || 'Smart search failed')
                      } finally {
                        setSmartLoading(false)
                      }
                    }}
                    disabled={(!baseItemId && !q.trim()) || smartLoading}
                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${(!baseItemId && !q.trim()) ? 'cursor-not-allowed opacity-60 bg-gray-100 text-gray-400' : 'bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] text-white hover:shadow-lg transform hover:-translate-y-0.5'}`}
                    title={!baseItemId && !q.trim() ? 'Enter keywords or choose a base item' : 'Run Smart Search'}
                  >
                    {smartLoading ? (
                      <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" className="opacity-25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg>
                    ) : (
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    )}
                    Find Smart Matches
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-center">
            <div className="flex items-center justify-center gap-2">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          </div>
        )}

        {/* Smart Search Results */}
        {(q.trim() || baseItemId) && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[var(--ink-800)]">🎯 Smart Suggestions</h2>
                <p className="text-[var(--ink-600)] mt-1">Matches based on your search</p>
              </div>
              {smartError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                  {smartError}
                </div>
              )}
            </div>
            
            {smartLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-black/10 bg-white overflow-hidden shadow-sm">
                    <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300" />
                    <div className="p-5 space-y-3">
                      <div className="h-4 bg-gray-200/80 rounded w-2/3" />
                      <div className="h-3 bg-gray-200/70 rounded w-1/2" />
                      <div className="h-2 bg-gray-200/60 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : smartMatches.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-black/10 bg-white/70 p-12 text-center">
                <svg className="size-16 text-[var(--ink-300)] mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <p className="text-lg text-[var(--ink-600)]">No smart suggestions found</p>
                <p className="text-sm text-[var(--ink-500)] mt-1">Try adjusting your search terms or filters</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {smartMatches.map((m, idx) => {
                  const it = m.candidate
                  const s = m.score
                  const img = it.photoUrl || ''
                  const dateStr = (it.occurredOn || it.reportedAt) ? new Date(it.occurredOn || it.reportedAt || '').toLocaleDateString() : undefined
                  const keyId = `${it.id}-${idx}`
                  const isOpen = expanded.has(keyId)
                  const canStaffAct = Boolean(baseItemId)
                  const isLost = it.type === 'lost'

                  const lostId = baseItemId
                    ? (smartType === 'lost' ? baseItemId : (m.lostItem ?? Number(it.id)))
                    : null
                  const foundId = baseItemId
                    ? (smartType === 'found' ? baseItemId : (m.foundItem ?? Number(it.id)))
                    : null

                  const Inner = (
                    <div className="group rounded-2xl bg-white overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                      <div className="relative aspect-video bg-gray-50 cursor-pointer overflow-hidden" onClick={() => setDetails({ open: true, item: it })} role="button" aria-label={`Open details for ${it.title}`}>
                        {img ? (
                          <img src={img} alt={it.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-gray-300 bg-gradient-to-br from-gray-100 to-gray-200">
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
                          </div>
                        )}
                        <div className="absolute top-3 left-3">
                          <ConfidenceBadge score={s} />
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                      </div>
                      <div className="p-5">
                        <button className="font-bold text-lg line-clamp-1 text-left hover:text-[color:var(--brand)] transition-colors" onClick={() => setDetails({ open: true, item: it })}>
                          {it.title}
                        </button>
                        {it.description && (
                          <p className="mt-2 text-sm text-[var(--ink-600)] line-clamp-2 leading-relaxed">{highlight(it.description)}</p>
                        )}
                        <div className="mt-3 flex items-center justify-between text-xs text-[var(--ink-500)]">
                          <span className="line-clamp-1 font-medium">{[it.location ?? undefined, dateStr].filter(Boolean).join(' • ')}</span>
                          <span className="opacity-70 font-mono">#{String(it.id)}</span>
                        </div>
                        <ScoreBar score={s} />

                        {/* Student action: claim found item */}
                        {it.type === 'found' && (
                          <div className="mt-4">
                            <button
                              disabled={!user}
                              onClick={() => setModal({ open: true, itemId: Number(it.id), title: it.title })}
                              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${!user ? 'cursor-not-allowed opacity-60 bg-gray-100 text-gray-400' : 'bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] text-white hover:shadow-lg transform hover:-translate-y-0.5'}`}
                              title={!user ? 'Login required' : 'Request to claim this item'}
                            >
                              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                              Request Claim
                            </button>
                          </div>
                        )}

                        {/* Staff actions */}
                        {canStaffAct && lostId && foundId && (
                          <div className="mt-4 flex items-center gap-2">
                            <button
                              disabled={matchActionBusy !== null}
                              onClick={async () => {
                                try {
                                  setMatchActionBusy(Number(it.id))
                                  const saved = await upsertMatch(lostId, foundId, s)
                                  await confirmMatch(saved.id)
                                } catch (e) {
                                  alert((e as Error).message || 'Failed to confirm match')
                                } finally {
                                  setMatchActionBusy(null)
                                }
                              }}
                              className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${matchActionBusy ? 'opacity-70 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                            >
                              Confirm
                            </button>
                            <button
                              disabled={matchActionBusy !== null}
                              onClick={async () => {
                                try {
                                  setMatchActionBusy(Number(it.id))
                                  const saved = await upsertMatch(lostId, foundId, s)
                                  await dismissMatch(saved.id)
                                } catch (e) {
                                  alert((e as Error).message || 'Failed to dismiss match')
                                } finally {
                                  setMatchActionBusy(null)
                                }
                              }}
                              className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${matchActionBusy ? 'opacity-70 cursor-wait' : 'bg-gray-200 text-[var(--ink-800)] hover:bg-gray-300'}`}
                            >
                              Dismiss
                            </button>
                          </div>
                        )}

                        {/* Expandable details */}
                        <div className="mt-3">
                          <button
                            onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(keyId)) { n.delete(keyId) } else { n.add(keyId) } return n })}
                            className="inline-flex items-center gap-1 text-xs text-[var(--ink-600)] hover:text-[color:var(--brand)] font-medium transition-colors"
                            aria-expanded={isOpen}
                          >
                            <svg className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                            {isOpen ? 'Hide details' : 'Show details'}
                          </button>
                          {isOpen && (
                            <div className="mt-3 rounded-xl bg-black/5 p-4 text-xs text-[var(--ink-600)]">
                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div><span className="font-medium">Type:</span> {it.type}</div>
                                <div><span className="font-medium">Status:</span> {it.status}</div>
                                <div><span className="font-medium">Reported:</span> {it.reportedAt ? new Date(it.reportedAt).toLocaleString() : '—'}</div>
                                <div><span className="font-medium">Occurred:</span> {it.occurredOn ? new Date(it.occurredOn).toLocaleDateString() : '—'}</div>
                              </div>
                              {it.description && (
                                <div className="mb-3">
                                  <div className="font-medium mb-1">Description</div>
                                  <div className="whitespace-pre-wrap break-words text-[var(--ink-700)]">{highlight(it.description)}</div>
                                </div>
                              )}
                              <div className="text-xs text-[var(--ink-500)] italic">Match score based on text, location, and date similarity</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )

                  return isLost ? (
                    <div key={keyId} className="rounded-2xl p-[2px] bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)]">
                      {Inner}
                    </div>
                  ) : (
                    <div key={keyId} className="rounded-2xl p-[2px] bg-gradient-to-r from-emerald-500 to-green-300">
                      {Inner}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Results Summary */}
        <div className="flex items-center justify-between p-4 bg-white/60 backdrop-blur rounded-xl border border-white/20">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold text-[var(--ink-700)]">
              {loading ? (
                <div className="flex items-center gap-2">
                  <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" className="opacity-25"/>
                    <path d="M21 12a9 9 0 0 1-9 9"/>
                  </svg>
                  Loading items...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-[color:var(--brand)]"></div>
                  {filtered.length} {typeFilter === 'lost' ? 'Lost Items Found' : `item${filtered.length === 1 ? '' : 's'} found`}
                </div>
              )}
            </div>
            {filtered.length > 0 && (
              <div className="text-sm text-[var(--ink-500)]">
                Showing {Math.min(visible, filtered.length)} of {filtered.length}
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Results Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {(loading && items.length === 0) ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-black/10 bg-white overflow-hidden shadow-sm">
                <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200/80 rounded w-2/3" />
                  <div className="h-4 bg-gray-200/70 rounded w-1/2" />
                  <div className="h-3 bg-gray-200/60 rounded w-full" />
                </div>
              </div>
            ))
          ) : toShow.length === 0 ? (
            <div className="col-span-full rounded-2xl border-2 border-dashed border-black/10 bg-white/70 p-16 text-center">
              <svg className="size-20 text-gray-300 mx-auto mb-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <h3 className="text-xl font-semibold text-[var(--ink-600)] mb-2">No items found</h3>
              <p className="text-[var(--ink-500)]">Try adjusting your search terms or filters to find what you're looking for.</p>
            </div>
          ) : (
            toShow.map((it, idx) => {
              const dateStr = (it.occurredOn || it.reportedAt) ? new Date(it.occurredOn || it.reportedAt || '').toLocaleDateString() : undefined
              const ui = deriveStatus(it)
              const isLost = it.type === 'lost'
              const img = it.photoThumbUrl || it.photoUrl || ''
              const Inner = (
                <div
                  className="group rounded-2xl bg-white/80 backdrop-blur-sm overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                  style={{animationDelay: `${idx * 50}ms`}}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open details for ${it.title}`}
                  onClick={() => setDetails({ open: true, item: it })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setDetails({ open: true, item: it })
                    }
                  }}
                >
                  <div className="relative aspect-video bg-gray-50 overflow-hidden">
                    {img ? (
                      <img src={img} alt={it.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-gray-300 bg-gradient-to-br from-gray-100 to-gray-200">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
                      </div>
                    )}
                    <div className="absolute top-3 left-3">{statusChip(ui, it.type)}</div>
                    {/* Type pill removed in favor of colored card borders */}
                    {user && typeof it.reporterUserId === 'number' && it.reporterUserId === user.id && (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/95 text-[color:var(--brand-strong)] text-xs font-semibold px-3 py-1.5 border border-[color:var(--brand)]/20 backdrop-blur shadow-md" title="You reported this">
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M12 6v12M6 12h12"/>
                        </svg>
                        You reported this
                      </span>
                    )}
                    {it.type === 'found' && it.finderName && (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/95 text-[var(--ink-800)] text-[10px] font-medium px-2 py-1 border border-emerald-500/30 backdrop-blur shadow-md" title={`Finder: ${it.finderName}`}>
                        <svg className="size-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/>
                        </svg>
                        <span className="font-semibold">Finder:</span>
                        {it.finderName}
                      </span>
                    )}
                    {it.type === 'found' && (requested.has(Number(it.id))) && (
                      <span className="absolute bottom-3 right-3 rounded-full bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 shadow-md backdrop-blur">
                        Requested
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                  </div>
                  <div className="p-5">
                    <div className="font-bold text-lg line-clamp-1 group-hover:text-[color:var(--brand)] transition-colors">{it.title}</div>
                    {it.description && (
                      <p className="mt-2 text-sm text-[var(--ink-600)] line-clamp-2 leading-relaxed">{it.description}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-sm text-[var(--ink-500)]">
                      <span className="line-clamp-1 font-medium">{[it.location ?? undefined, dateStr].filter(Boolean).join(' • ')}</span>
                      <span className="text-[color:var(--accent)] opacity-80 font-mono text-xs">#{String(it.id)}</span>
                    </div>
                    
                    {it.type === 'found' && ui === 'unclaimed' && (
                      <div className="mt-4">
                        <button
                          disabled={!user || claimingId === Number(it.id) || requested.has(Number(it.id))}
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!user) return
                            setModal({ open: true, itemId: Number(it.id), title: it.title })
                          }}
                          className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${!user ? 'cursor-not-allowed opacity-60 bg-gray-100 text-gray-400' : (claimingId === Number(it.id) || requested.has(Number(it.id))) ? 'bg-[color:var(--brand)]/80 text-white' : 'bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] text-white hover:shadow-lg transform hover:-translate-y-0.5'} `}
                          title={!user ? 'Login required' : 'Request to claim this item'}
                        >
                          {claimingId === Number(it.id) ? (
                            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" className="opacity-25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg>
                          ) : requested.has(Number(it.id)) ? (
                            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
                          ) : (
                            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                          )}
                          {claimingId === Number(it.id) ? 'Submitting...' : requested.has(Number(it.id)) ? 'Requested' : 'Request Claim'}
                        </button>
                        {!user && (
                          <div className="mt-2 text-xs text-[var(--ink-500)] text-center">Please login to request a claim</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
              return isLost ? (
                <div key={it.id} className="rounded-2xl p-[2px] bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)]">{Inner}</div>
              ) : (
                <div key={it.id} className="rounded-2xl p-[2px] bg-gradient-to-r from-emerald-500 to-green-300">{Inner}</div>
              )
            })
          )}
        </div>

        {/* Success Message */}
        {successMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 text-sm font-medium shadow-2xl ring-1 ring-black/10 backdrop-blur">
            <div className="flex items-center gap-3">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
              </svg>
              {successMsg}
            </div>
          </div>
        )}

        {/* Load More */}
        {filtered.length > toShow.length && (
          <div className="flex justify-center pt-8">
            <button
              onClick={() => setVisible(v => v + 24)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/80 backdrop-blur border border-white/40 px-8 py-4 text-base font-semibold text-[var(--ink)] hover:bg-white hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14m-7-7l7 7 7-7"/>
              </svg>
              Load More Items
              <span className="text-sm opacity-70">({filtered.length - toShow.length} remaining)</span>
            </button>
          </div>
        )}

        {/* Modals */}
        <RequestClaimModal
          open={modal.open}
          itemTitle={modal.title}
          onCancel={() => setModal({ open: false })}
          onSubmit={async (notes?: string) => {
            if (!user || !modal.itemId) return
            setClaimingId(modal.itemId)
            try {
              await createClaim(modal.itemId, user.id, notes)
              setRequested(prev => new Set(prev).add(modal.itemId!))
              setSuccessMsg('Claim request submitted for admin verification.')
              setTimeout(() => setSuccessMsg(null), 5000)
              setModal({ open: false })
            } catch (e) {
              alert((e as Error).message || 'Failed to request claim')
            } finally {
              setClaimingId(null)
            }
          }}
        />

        <ItemDetailsModal
          open={details.open}
          item={details.item}
          isOwner={Boolean(user && details.item && typeof details.item.reporterUserId === 'number' && details.item.reporterUserId === user.id)}
          onClose={() => setDetails({ open: false, item: null })}
          onRequestClaim={(itemId: number, title?: string) => {
            if (!user) return
            setDetails({ open: false, item: null })
            setModal({ open: true, itemId, title })
          }}
        />
      </div>
    </div>
  )
}