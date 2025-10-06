import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listItems, type ItemDto, createClaim, smartSearch, type SmartMatch, upsertMatch, confirmMatch, dismissMatch } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'
import RequestClaimModal from '../../components/RequestClaimModal'
import ItemDetailsModal from '../../components/ItemDetailsModal'

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
  reporter?: { id?: number | null; firstName?: string | null; lastName?: string | null; email?: string | null }
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


  // Filters synced with URL
  const [q, setQ] = useState(() => params.get('q') ?? '')
  // Default to Found (Unclaimed) view when no URL filters are provided
  const [typeFilter, setTypeFilter] = useState(() => (params.get('type') ?? 'found').toLowerCase())
  const [locationFilter, setLocationFilter] = useState(() => (params.get('location') ?? 'all').toLowerCase())
  // normalize legacy/unfriendly values, e.g. "unclaimed" -> "open"
  const initialStatus = (params.get('status') ?? 'open').toLowerCase()
  const [statusFilter, setStatusFilter] = useState(() => (initialStatus === 'unclaimed' ? 'open' : initialStatus))
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
        // Fetch a large page to approximate "all" (backend currently lacks offset)
        const list = await listItems({ limit: 500 }).catch(() => [])
        if (!cancelled) {
          // map ItemDto to ItemCard
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
            reporter: it.reporter ? {
              id: it.reporter.id,
              firstName: it.reporter.firstName,
              lastName: it.reporter.lastName,
              email: it.reporter.email,
            } : undefined,
            finderName: it.type === 'found' && it.reporter ? [it.reporter.firstName, it.reporter.lastName].filter(Boolean).join(' ') || (it.reporter.email ?? null) : null,
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

  const types = useMemo(
    () => Array.from(new Set(items.map(i => i.type).filter((x): x is 'lost' | 'found' => x === 'lost' || x === 'found'))).sort(),
    [items]
  )
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

    const passType = (it: ItemCard) => typeFilter === 'all' || (it.type ?? '').toLowerCase() === typeFilter
    const passLoc = (it: ItemCard) => locationFilter === 'all' || (it.location ?? '').toLowerCase() === locationFilter
    const passStatus = (it: ItemCard) => {
      const status = (it.status ?? 'open').toLowerCase()
      // treat legacy 'unclaimed' filter as 'open'
      const desired = statusFilter === 'unclaimed' ? 'open' : statusFilter
      return desired === 'all' || status === desired
    }
    const passPhoto = (it: ItemCard) => !hasPhotoOnly || Boolean(it.photoUrl)

    const byDate = (a?: string, b?: string) => {
      const da = a ? Date.parse(a) : 0
      const db = b ? Date.parse(b) : 0
      return db - da
    }

    let out = items.filter(it => matchQ(it) && passType(it) && passLoc(it) && passStatus(it) && passPhoto(it))
    switch (sort) {
      case 'newest': out = out.sort((a, b) => byDate(a.reportedAt ?? a.occurredOn ?? undefined, b.reportedAt ?? b.occurredOn ?? undefined)); break
      case 'oldest': out = out.sort((a, b) => -byDate(a.reportedAt ?? a.occurredOn ?? undefined, b.reportedAt ?? b.occurredOn ?? undefined)); break
      case 'az': out = out.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'za': out = out.sort((a, b) => b.title.localeCompare(a.title)); break
    }
    return out
  }, [items, q, typeFilter, locationFilter, statusFilter, hasPhotoOnly, sort])

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
    <div className="min-h-screen bg-[color:var(--surface)] text-[var(--ink)] font-sans" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Header strip for brand cohesion */}
      <div className="sticky top-0 z-30">
        <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-2 mb-4">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Browse items</h1>
          <p className="text-[var(--ink-600)] text-sm">Find Lost and Found items across campus with clear status and details.</p>
        </div>

        {/* Quick View Toggle: Found (Unclaimed) vs Lost (All) */}
        <div className="mb-3">
          <div className="inline-flex rounded-lg border border-black/10 bg-white/90 shadow-sm overflow-hidden" role="tablist" aria-label="Quick view">
            {[
              { key: 'found_open', label: 'Found (Unclaimed)', apply: () => { setTypeFilter('found'); setStatusFilter('open'); setVisible(24) }, active: typeFilter === 'found' && statusFilter === 'open' },
              { key: 'lost_all', label: 'Lost (All)', apply: () => { setTypeFilter('lost'); setStatusFilter('all'); setVisible(24) }, active: typeFilter === 'lost' && statusFilter === 'all' },
            ].map(({ key, label, apply, active }) => (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={apply}
                className={`px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-[color:var(--brand)] text-white' : 'text-[var(--ink-700)] hover:bg-black/5'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

  {/* Filter bar */}
  <div className="rounded-xl border border-[color:var(--brand)]/10 bg-white/90 backdrop-blur p-3 md:p-4 shadow-sm">
          <div className="grid gap-2 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className="block text-xs text-[var(--ink-600)] mb-1">Search</label>
              <div className="relative">
                <input
                  value={q}
                  onChange={e => { setQ(e.target.value); setVisible(24) }}
                  placeholder="Keywords (e.g., wallet, library)"
                  className="w-full rounded-md border border-black/10 bg-white px-9 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-[var(--ink-600)]" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4Zm8.32 13.91-3.86-3.86" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--ink-600)] mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value.toLowerCase()); setVisible(24) }}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
              >
                <option value="all">All</option>
                {types.map(t => <option key={t} value={t.toLowerCase()}>{t === 'lost' ? 'Lost' : t === 'found' ? 'Found' : t}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--ink-600)] mb-1">Location</label>
              <select
                value={locationFilter}
                onChange={e => { setLocationFilter(e.target.value.toLowerCase()); setVisible(24) }}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
              >
                <option value="all">All</option>
                {locations.map(l => <option key={l} value={l.toLowerCase()}>{l}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--ink-600)] mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setVisible(24) }}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
              >
                <option value="all">All</option>
                <option value="open">Unclaimed</option>
                <option value="claimed">Claimed</option>
                <option value="matched">Matched</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--ink-600)] mb-1">Sort by</label>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as typeof sort)}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-700)]">
                <input type="checkbox" checked={hasPhotoOnly} onChange={e => { setHasPhotoOnly(e.target.checked); setVisible(24) }} className="size-4 rounded border-black/20" />
                Has photo
              </label>
            </div>
            {/* Smart Search Controls */}
            <div className="md:col-span-12 mt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--ink-600)]">Smart Search:</span>
                <div className="inline-flex rounded-md border border-black/10 bg-white shadow-sm overflow-hidden">
                  {(['lost','found'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setSmartType(t)}
                      className={`px-3 py-1.5 text-sm ${smartType===t ? 'bg-[color:var(--brand)] text-white' : 'text-[var(--ink-700)] hover:bg-black/5'}`}
                      aria-pressed={smartType===t}
                    >I {t === 'lost' ? 'lost an item' : 'found an item'}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Admin: choose an existing base item to match against */}
                {user?.role === 'admin' && (
                  <select
                    value={baseItemId ?? ''}
                    onChange={e => setBaseItemId(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
                    title="Choose a base item to match against"
                  >
                    <option value="">Base: none (use keywords)</option>
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
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${(!baseItemId && !q.trim()) ? 'cursor-not-allowed opacity-60 ring-1 ring-black/10' : 'bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-strong)]'}`}
                  title={!baseItemId && !q.trim() ? 'Enter keywords or choose a base item' : 'Run Smart Search'}
                >
                  {smartLoading ? (
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" className="opacity-25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg>
                  ) : (
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                  )}
                  Smart Search
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 text-red-600 text-sm">{error}</div>
        )}

        {/* Smart results */}
        {(q.trim() || baseItemId) && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Suggested matches</h2>
              {smartError && <span className="text-sm text-red-600">{smartError}</span>}
            </div>
            {smartLoading ? (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-[color:var(--brand)]/10 bg-white overflow-hidden shadow-sm">
                    <div className="aspect-video bg-[color:var(--brand)]/10" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-gray-200/80 rounded w-2/3" />
                      <div className="h-3 bg-gray-200/70 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : smartMatches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-black/10 bg-white/70 p-4 text-sm text-[var(--ink-600)]">No smart suggestions yet.</div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {smartMatches.map((m, idx) => {
                  const it = m.candidate
                  const s = m.score
                  const img = it.photoUrl || ''
                  const dateStr = (it.occurredOn || it.reportedAt) ? new Date(it.occurredOn || it.reportedAt || '').toLocaleDateString() : undefined
                  const keyId = `${it.id}-${idx}`
                  const isOpen = expanded.has(keyId)
                  const canStaffAct = Boolean(baseItemId)
                  const borderByType = it.type === 'found' ? 'border-emerald-400/60' : 'border-rose-400/60'

                  const lostId = baseItemId
                    ? (smartType === 'lost' ? baseItemId : (m.lostItem ?? Number(it.id)))
                    : null
                  const foundId = baseItemId
                    ? (smartType === 'found' ? baseItemId : (m.foundItem ?? Number(it.id)))
                    : null

                  return (
                    <div key={keyId} className={`group rounded-2xl border ${borderByType} bg-white overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300`}>
                      <div className="relative aspect-video bg-gray-50 cursor-pointer" onClick={() => setDetails({ open: true, item: it })} role="button" aria-label={`Open details for ${it.title}`}>
                        {img ? (
                          <img src={img} alt={it.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-[color:var(--brand)]/40">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
                          </div>
                        )}
                        <div className="absolute top-3 left-3">
                          <ConfidenceBadge score={s} />
                        </div>
                      </div>
                      <div className="p-4">
                        <button className="font-semibold line-clamp-1 text-left hover:text-[color:var(--brand)]" onClick={() => setDetails({ open: true, item: it })}>
                          {it.title}
                        </button>
                        {it.description && (
                          <p className="mt-1 text-xs text-[var(--ink-700)] line-clamp-2">{highlight(it.description)}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between text-xs text-[var(--ink-600)]">
                          <span className="line-clamp-1">{[it.location ?? undefined, dateStr].filter(Boolean).join(' • ')}</span>
                          <span className="opacity-70">#{String(it.id)}</span>
                        </div>
                        <ScoreBar score={s} />

                        {/* Student action: claim found item */}
                        {it.type === 'found' && (
                          <div className="mt-3">
                            <button
                              disabled={!user}
                              onClick={() => setModal({ open: true, itemId: Number(it.id), title: it.title })}
                              className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${!user ? 'cursor-not-allowed opacity-60 ring-1 ring-black/10' : 'bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-strong)]'}`}
                              title={!user ? 'Login required' : 'Request to claim this item'}
                            >
                              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                              Request Claim
                            </button>
                          </div>
                        )}

                        {/* Staff actions */}
                        {canStaffAct && lostId && foundId && (
                          <div className="mt-3 flex items-center gap-2">
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
                              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${matchActionBusy ? 'opacity-70 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
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
                              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${matchActionBusy ? 'opacity-70 cursor-wait' : 'bg-gray-200 text-[var(--ink-800)] hover:bg-gray-300'}`}
                            >
                              Dismiss
                            </button>
                          </div>
                        )}

                        {/* Expandable details */}
                        <div className="mt-2">
                          <button
                            onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(keyId)) { n.delete(keyId) } else { n.add(keyId) } return n })}
                            className="inline-flex items-center gap-1 text-xs text-[var(--ink-700)] hover:text-[color:var(--brand)]"
                            aria-expanded={isOpen}
                          >
                            <svg className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                            {isOpen ? 'Hide details' : 'Show details'}
                          </button>
                          {isOpen && (
                            <div className="mt-2 rounded-md bg-black/5 p-2 text-[11px] text-[var(--ink-700)]">
                              <div className="grid grid-cols-2 gap-2">
                                <div><span className="opacity-70">Type:</span> {it.type}</div>
                                <div><span className="opacity-70">Status:</span> {it.status}</div>
                                <div><span className="opacity-70">Reported:</span> {it.reportedAt ? new Date(it.reportedAt).toLocaleString() : '—'}</div>
                                <div><span className="opacity-70">Occurred:</span> {it.occurredOn ? new Date(it.occurredOn).toLocaleDateString() : '—'}</div>
                              </div>
                              {it.description && (
                                <div className="mt-2">
                                  <div className="opacity-70 mb-1">Description</div>
                                  <div className="whitespace-pre-wrap break-words">{highlight(it.description)}</div>
                                </div>
                              )}
                              <div className="mt-2 opacity-70">Score reflects text similarity, location closeness, and date proximity.</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Meta row */}
        <div className="mt-3 flex items-center justify-between text-sm text-[var(--ink-600)]">
          <div>
            {loading ? 'Loading…' : `${filtered.length} item${filtered.length === 1 ? '' : 's'} found`}
          </div>
          <Link to="/" className="text-[color:var(--brand)] hover:underline">Back to Home</Link>
        </div>

        {/* Results grid */}
        <div className="mt-5 grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {(loading && items.length === 0) ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-[color:var(--brand)]/10 bg-white overflow-hidden shadow-sm">
                <div className="aspect-video bg-[color:var(--brand)]/10" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200/80 rounded w-2/3" />
                  <div className="h-3 bg-gray-200/70 rounded w-1/2" />
                </div>
              </div>
            ))
          ) : toShow.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-black/10 bg-white/70 p-8 text-center text-[var(--ink-600)]">
              No items match your filters.
            </div>
          ) : (
            toShow.map((it, idx) => {
              const dateStr = (it.occurredOn || it.reportedAt) ? new Date(it.occurredOn || it.reportedAt || '').toLocaleDateString() : undefined
              const status = (it.status ?? 'open').toLowerCase()
              const statusTheme = status === 'claimed'
                ? 'bg-emerald-600/90'
                : status === 'matched'
                ? 'bg-amber-600/90'
                : status === 'closed'
                ? 'bg-gray-600/90'
                : 'bg-[color:var(--accent)]/90' // open/unclaimed
        const borderByType = it.type === 'found' ? 'border-emerald-400/60' : 'border-rose-400/60'
              const img = it.photoThumbUrl || it.photoUrl || ''
              return (
                <div
                  key={it.id}
          className={`group rounded-2xl border ${borderByType} bg-white overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 animate-fade-up cursor-pointer`}
                  style={{animationDelay: `${idx * 20}ms`}}
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
                  <div className="relative aspect-video bg-gray-50">
                    {img ? (
                      <img src={img} alt={it.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-[color:var(--brand)]/40">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                      <span className={`${statusTheme} rounded-full px-2 py-1`}>{status === 'claimed' ? 'Claimed' : status === 'matched' ? 'Matched' : status === 'closed' ? 'Closed' : 'Unclaimed'}</span>
                    </div>
                    {user && typeof it.reporterUserId === 'number' && it.reporterUserId === user.id && (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 text-[color:var(--brand-strong)] text-[10px] font-medium px-2 py-1 border border-[color:var(--brand)]/20 backdrop-blur" title="You reported this">
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M12 6v12M6 12h12"/>
                        </svg>
                        You reported this
                      </span>
                    )}
                    {it.type === 'found' && it.finderName && (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 text-[color:var(--ink-800)] text-[10px] font-medium px-2 py-1 border border-emerald-500/30 backdrop-blur" title={`Finder: ${it.finderName}`}>
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/>
                        </svg>
                        <span className="font-semibold">Finder:</span>
                        {it.finderName}
                      </span>
                    )}
                    {/* Requested flag overlay */}
                    {it.type === 'found' && (requested.has(Number(it.id))) && (
                      <span className="absolute bottom-3 right-3 rounded-full bg-amber-500 text-white text-[10px] font-semibold px-2 py-1 shadow-sm">Claim requested</span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="font-semibold line-clamp-1 group-hover:text-[color:var(--brand)]">{it.title}</div>
                    {it.description && (
                      <p className="mt-1 text-xs text-[var(--ink-700)] line-clamp-2">{it.description}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-xs text-[var(--ink-600)]">
                      <span className="line-clamp-1">{[it.location ?? undefined, dateStr].filter(Boolean).join(' • ')}</span>
                      <span className="text-[color:var(--accent)] opacity-80">#{String(it.id)}</span>
                    </div>
                    {/* Request Claim action for found, open items */}
                    {it.type === 'found' && status === 'open' && (
                      <div className="mt-3">
                        <button
                          disabled={!user || claimingId === Number(it.id) || requested.has(Number(it.id))}
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!user) return
                            setModal({ open: true, itemId: Number(it.id), title: it.title })
                          }}
                          className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${!user ? 'cursor-not-allowed opacity-60 ring-1 ring-black/10' : (claimingId === Number(it.id) || requested.has(Number(it.id))) ? 'bg-[color:var(--brand)]/80 text-white' : 'bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-strong)]'} `}
                          title={!user ? 'Login required' : 'Request to claim this item'}
                        >
                          {claimingId === Number(it.id) ? (
                            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" className="opacity-25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg>
                          ) : requested.has(Number(it.id)) ? (
                            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
                          ) : (
                            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                          )}
                          {claimingId === Number(it.id) ? 'Submitting…' : requested.has(Number(it.id)) ? 'Requested' : 'Request Claim'}
                        </button>
                        {!user && (
                          <div className="mt-1 text-xs text-[var(--ink-600)]">Please login to request a claim.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {successMsg && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-[color:var(--brand)] text-white px-4 py-2 text-sm shadow-lg ring-1 ring-black/10">{successMsg}</div>
        )}

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
              setTimeout(() => setSuccessMsg(null), 3000)
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
          item={details.item ? { ...details.item } : null}
          isOwner={Boolean(user && details.item && typeof details.item.reporterUserId === 'number' && details.item.reporterUserId === user.id)}
          onClose={() => setDetails({ open: false, item: null })}
          onRequestClaim={(itemId: number, title?: string) => {
            if (!user) return
            setDetails({ open: false, item: null })
            setModal({ open: true, itemId, title })
          }}
        />

        {filtered.length > toShow.length && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setVisible(v => v + 24)}
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--brand)]/20 bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/10 shadow-sm"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
