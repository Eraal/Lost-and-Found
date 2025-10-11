import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ItemDetailsModal, { type ItemLike } from '../../../components/ItemDetailsModal'
import {
  listMatches,
  type MatchWithItems,
  confirmMatch,
  dismissMatch,
  adminListItems,
  type AdminItem,
  type AdminItemUiStatus,
  adminUpdateItem,
  adminMarkReturned,
  getItemQrCode,
  createItemQrCode,
  adminDeleteItem,
  type QrCodeDto,
} from '../../../lib/api'

type Tab = 'lost' | 'found' | 'matched'

export default function AdminItems() {
  const location = useLocation()
  const navigate = useNavigate()

  // Derive tab from path
  const path = location.pathname.toLowerCase()
  const routeTab: Tab = path.endsWith('/found')
    ? 'found'
    : path.endsWith('/matched')
    ? 'matched'
    : 'lost'

  const [tab, setTab] = useState<Tab>(routeTab)
  const [lost, setLost] = useState<AdminItem[]>([])
  const [found, setFound] = useState<AdminItem[]>([])
  const [matches, setMatches] = useState<MatchWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openItem, setOpenItem] = useState<ItemLike | null>(null)
  const [editItem, setEditItem] = useState<AdminItem | null>(null)
  const [busyMatchId, setBusyMatchId] = useState<number | null>(null)
  const [qrFor, setQrFor] = useState<AdminItem | null>(null)
  const [qr, setQr] = useState<QrCodeDto | null>(null)
  const [qrBusy, setQrBusy] = useState(false)
  // Track which specific item is currently generating / fetching a QR
  const [qrBusyId, setQrBusyId] = useState<number | null>(null)
  const [qrMap, setQrMap] = useState<Record<number, QrCodeDto>>({})

  // Filters
  const [q, setQ] = useState('')
  const [uiStatus, setUiStatus] = useState<AdminItemUiStatus | ''>('')
  const [reporter, setReporter] = useState('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  useEffect(() => { setTab(routeTab) }, [routeTab])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        if (routeTab === 'matched') {
          const m = await listMatches({ includeItems: true })
          if (!cancelled) setMatches(m)
        } else {
          const [l, f] = await Promise.all([
            adminListItems({ type: 'lost', q, uiStatus: (uiStatus || undefined) as AdminItemUiStatus | undefined, reporter: reporter || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit: 500 }).catch(() => [] as AdminItem[]),
            adminListItems({ type: 'found', q, uiStatus: (uiStatus || undefined) as AdminItemUiStatus | undefined, reporter: reporter || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit: 500 }).catch(() => [] as AdminItem[]),
          ])
          if (!cancelled) { setLost(l); setFound(f) }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [routeTab, q, uiStatus, reporter, dateFrom, dateTo])

  // Fetch QR info for found items and cache in qrMap
  useEffect(() => {
    let cancelled = false
    const missing = found.filter(it => typeof it.id === 'number' && !(it.id in qrMap))
    if (missing.length === 0) return
    ;(async () => {
      try {
        const results = await Promise.all(
          missing.map(async (it) => {
            try {
              const info = await getItemQrCode(it.id)
              return info ? { id: it.id, info } : null
            } catch {
              return null
            }
          })
        )
        if (cancelled) return
        const next: Record<number, QrCodeDto> = {}
        for (const r of results) {
          if (r && r.info && r.id) next[r.id] = r.info
        }
        if (Object.keys(next).length > 0) setQrMap(prev => ({ ...prev, ...next }))
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [found, qrMap])

  // Derived grouped & sorted lists for lost/found tabs
  const { activeItems, returnedItems } = useMemo(() => {
    const base = (tab === 'found' ? found : lost).slice()
    const active = base.filter(it => String(it.uiStatus) !== 'returned')
    const returned = base.filter(it => String(it.uiStatus) === 'returned')
    const dateOrId = (d?: string | null, id?: number) => {
      if (d) {
        const t = Date.parse(d)
        if (!Number.isNaN(t)) return t
      }
      return (id || 0) * 1000 // ensure stable ordering if no date
    }
    active.sort((a, b) => dateOrId(b.reportedAt, b.id) - dateOrId(a.reportedAt, a.id))
    returned.sort((a, b) => dateOrId(b.reportedAt, b.id) - dateOrId(a.reportedAt, a.id))
    return { activeItems: active, returnedItems: returned }
  }, [tab, found, lost])

  // Collapsible returned section toggle
  const [showReturned, setShowReturned] = useState(false)

  const setRouteTab = (t: Tab) => {
    setTab(t)
    const to = t === 'matched' ? '/admin/items/matched' : t === 'found' ? '/admin/items/found' : '/admin/items/lost'
    navigate(to, { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 7h10v10H7z M3 3h4v4H3z M17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Items Database
              </h1>
              <p className="text-gray-600 mt-1">Browse and manage reported items • {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              Admin
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm p-1 shadow-lg">
              {(['lost','found','matched'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setRouteTab(v)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    tab === v
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg transform scale-105'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  aria-pressed={tab === v}
                >
                  {v === 'matched' ? 'Matched Pairs' : v === 'found' ? 'All Found' : 'All Lost'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters (only for lost/found tabs) */}
        {tab !== 'matched' && (
          <section className="mb-6 rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5">
                  <label className="block text-xs font-semibold text-gray-700">Search</label>
                  <div className="mt-1 relative">
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Keywords: item, category, student, location…" className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-blue-300 outline-none" />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      <SearchIcon />
                    </span>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-semibold text-gray-700">Status</label>
                  <select value={uiStatus} onChange={e => setUiStatus(e.target.value as AdminItemUiStatus | '')} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm">
                    <option value="">All statuses</option>
                    <option value="unclaimed">Unclaimed</option>
                    <option value="matched">Matched</option>
                    <option value="claim_pending">Claim Pending</option>
                    <option value="claim_approved">Claim Approved</option>
                    <option value="claim_rejected">Claim Rejected</option>
                    <option value="returned">Returned</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700">Reporter</label>
                  <input value={reporter} onChange={e => setReporter(e.target.value)} placeholder="Name or email" className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700">From</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700">To</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
                </div>
                <div className="md:col-span-12 md:justify-self-end flex gap-2">
                  <button onClick={() => { setQ(''); setUiStatus(''); setReporter(''); setDateFrom(''); setDateTo('') }} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50">
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Content */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4h14v2H3zM3 9h14v2H3zM3 14h14v2H3z"/></svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {tab === 'matched' ? 'Matched Pairs' : tab === 'found' ? 'All Found Items' : 'All Lost Items'}
                </h2>
                <p className="text-sm text-gray-600">
                  {loading ? 'Loading…' : tab === 'matched'
                    ? `${matches.length} pair${matches.length !== 1 ? 's' : ''}`
                    : `${activeItems.length} active • ${returnedItems.length} returned • ${activeItems.length + returnedItems.length} total`}
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="p-6">
              <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-6 text-center text-red-700 text-sm">{error}</div>
            </div>
          ) : loading ? (
            <div className="p-6"><ItemSkeleton rows={8} /></div>
          ) : tab === 'matched' ? (
            matches.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-600">No matched pairs.</div>
            ) : (
              <div className="p-6 space-y-4">
                {matches.map(m => (
                  <MatchRow key={m.id} match={m} onOpenItem={setOpenItem} busy={busyMatchId === m.id} onConfirm={async (id) => {
                    try { setBusyMatchId(id); await confirmMatch(id); setMatches(prev => prev.map(x => x.id === id ? { ...x, status: 'confirmed' } : x)) } finally { setBusyMatchId(null) }
                  }} onDismiss={async (id) => {
                    try { setBusyMatchId(id); await dismissMatch(id); setMatches(prev => prev.map(x => x.id === id ? { ...x, status: 'dismissed' } : x)) } finally { setBusyMatchId(null) }
                  }} />
                ))}
              </div>
            )
          ) : (activeItems.length + returnedItems.length) === 0 ? (
            <div className="p-12 text-center text-sm text-gray-600">No items found.</div>
          ) : (
            <div className="p-6 space-y-8">
              {/* Active / Unreturned Items */}
              <section aria-labelledby="active-items-heading" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 id="active-items-heading" className="text-sm font-semibold tracking-wide text-gray-700 uppercase">Active Items</h3>
                  <div className="text-xs text-gray-500">Newest first</div>
                </div>
                {activeItems.length === 0 ? (
                  <div className="rounded-xl border-2 border-amber-100 bg-amber-50/50 px-4 py-6 text-center text-xs text-amber-700">No active (unreturned) items.</div>
                ) : (
                  <div className="space-y-4">
                    {activeItems.map(it => (
                      <ItemRow key={it.id} item={it} qr={qrMap[it.id]} isReturned={false} isNew={(() => {
                        const d = it.reportedAt ? Date.parse(it.reportedAt) : NaN
                        if (Number.isNaN(d)) return false
                        const ageHrs = (Date.now() - d) / 36e5
                        return ageHrs <= 48
                      })()} onOpen={() => setOpenItem(mapItemLike(it))} onEdit={() => setEditItem(it)} onMarkReturned={async () => {
                        try {
                          const updated = await adminMarkReturned(it.id)
                          if (tab === 'lost') setLost(prev => prev.map(x => x.id === it.id ? updated : x))
                          else setFound(prev => prev.map(x => x.id === it.id ? updated : x))
                        } catch (e) {
                          alert((e as Error).message || 'Failed to mark as returned')
                        }
                      }} onQr={async () => {
                        setQrBusy(true)
                        setQrBusyId(it.id)
                        setQrFor(it)
                        try {
                          const existing = await getItemQrCode(it.id)
                          const data = existing ?? await createItemQrCode(it.id)
                          setQr(data)
                          setQrMap(prev => ({ ...prev, [it.id]: data }))
                        } catch (e) {
                          alert((e as Error)?.message || 'Failed to get QR')
                        } finally {
                          setQrBusy(false); setQrBusyId(null)
                        }
                      }} qrBusy={qrBusyId === it.id} />
                    ))}
                  </div>
                )}
              </section>

              {/* Returned Items Section */}
              <section aria-labelledby="returned-items-heading" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 id="returned-items-heading" className="text-sm font-semibold tracking-wide text-gray-700 uppercase">Returned Items</h3>
                  <button onClick={() => setShowReturned(v => !v)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    {showReturned ? 'Hide' : 'Show'} ({returnedItems.length})
                  </button>
                </div>
                {!showReturned ? (
                  returnedItems.length === 0 ? <div className="text-xs text-gray-400">None</div> : <div className="text-xs text-gray-500">Returned items hidden</div>
                ) : returnedItems.length === 0 ? (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-center text-xs text-gray-500">No returned items.</div>
                ) : (
                  <div className="space-y-3">
                    {returnedItems.map(it => (
                      <ItemRow key={it.id} item={it} qr={qrMap[it.id]} isReturned isNew={false} onOpen={() => setOpenItem(mapItemLike(it))} onEdit={() => setEditItem(it)} onMarkReturned={async () => { /* no-op: already returned */ }} onQr={async () => {
                        setQrBusy(true)
                        setQrBusyId(it.id)
                        setQrFor(it)
                        try {
                          const existing = await getItemQrCode(it.id)
                          const data = existing ?? await createItemQrCode(it.id)
                          setQr(data)
                          setQrMap(prev => ({ ...prev, [it.id]: data }))
                        } catch (e) {
                          alert((e as Error)?.message || 'Failed to get QR')
                        } finally {
                          setQrBusy(false); setQrBusyId(null)
                        }
                      }} qrBusy={qrBusyId === it.id} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </section>

        <ItemDetailsModal open={!!openItem} item={openItem} onClose={() => setOpenItem(null)} />
        <EditItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={async (payload) => {
            if (!editItem) return
            try {
              const updated = await adminUpdateItem(editItem.id, payload)
              setEditItem(null)
              if (tab === 'lost') setLost(prev => prev.map(x => x.id === updated.id ? updated : x))
              else setFound(prev => prev.map(x => x.id === updated.id ? updated : x))
            } catch (e) {
              alert((e as Error).message || 'Failed to update item')
            }
          }}
        />
        {qrFor && qr && (
          <QrPreviewModal
            item={qrFor}
            qr={qr}
            busy={qrBusy}
            onClose={() => { setQrFor(null); setQr(null) }}
      onRegenerate={async () => {
              if (!qrFor) return
              setQrBusy(true)
              try {
                const d = await createItemQrCode(qrFor.id, true)
        setQr(d)
        setQrMap(prev => ({ ...prev, [qrFor.id]: d }))
              } catch (e) {
                alert((e as Error)?.message || 'Failed to regenerate')
              } finally {
                setQrBusy(false)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

function ItemRow({ item, qr, onOpen, onEdit, onMarkReturned, onQr, isReturned, isNew, qrBusy }: { item: AdminItem; qr?: QrCodeDto; onOpen: () => void; onEdit: () => void; onMarkReturned: () => void; onQr: () => void; isReturned?: boolean; isNew?: boolean; qrBusy?: boolean }) {
  const uis = String(item.uiStatus || 'unclaimed').toLowerCase()
  const label = uis.replace('_', ' ')
  const cls = uis === 'claim_approved'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : uis === 'claim_rejected'
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : uis === 'returned'
    ? 'bg-sky-50 text-sky-700 border-sky-200'
    : uis === 'matched'
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
  const chip = (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  )
  return (
    <div className={`relative rounded-3xl border-2 p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 group ${
      uis === 'claim_approved' ? 'border-emerald-200 bg-emerald-50/40' :
      uis === 'claim_rejected' ? 'border-rose-200 bg-rose-50/40' :
      uis === 'returned' ? 'border-sky-200 bg-sky-50/60 opacity-80' :
      uis === 'matched' ? 'border-indigo-200 bg-indigo-50/40' :
      'border-gray-200 bg-white'
    } ${isReturned ? 'grayscale-[30%] hover:grayscale-0' : ''}`}>
      {/* Decorative gradient ring */}
      <div className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,.15),transparent_60%)]" />
      <div className="flex flex-col md:flex-row md:items-center gap-4 relative">
        <div className="shrink-0">
          {item.photoThumbUrl || item.photoUrl ? (
            <img src={item.photoThumbUrl || item.photoUrl || ''} alt="Item" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-gray-200 shadow-sm" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 grid place-items-center text-gray-400">📦</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-bold text-gray-900 truncate" title={item.title}>{item.title}</div>
            {chip}
            {isNew && <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px] font-semibold shadow">NEW</span>}
            {isReturned && <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-600/10 text-sky-700 ring-1 ring-sky-600/20 text-[10px] font-semibold">Returned</span>}
          </div>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 font-medium"><TypeIcon /> {item.type === 'found' ? 'Found' : 'Lost'}</span>
            <span className="inline-flex items-center gap-1 font-medium truncate"><MapPinIcon /> {item.location || '—'}</span>
            {item.occurredOn && <span className="inline-flex items-center gap-1 font-medium"><CalendarIcon /> {new Date(item.occurredOn).toLocaleDateString()}</span>}
            {item.reportedAt && <span className="inline-flex items-center gap-1 font-medium"><ClockIcon /> {relativeTime(item.reportedAt)}</span>}
            {item.reporter && <span className="inline-flex items-center gap-1 font-medium truncate col-span-2 sm:col-span-4"><UserIcon /> <strong className='font-semibold'>Finder:</strong> {item.reporter.email || [item.reporter.firstName, item.reporter.lastName].filter(Boolean).join(' ') || '—'}</span>}
          </div>
          {item.description && (
            <p className="mt-3 text-xs leading-relaxed text-gray-700 line-clamp-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
              {item.description}
            </p>
          )}
          {item.type === 'found' && qr && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
              <QrInline code={qr.code} />
              <code className="text-[11px] text-gray-700 select-all">{qr.code}</code>
              <button onClick={() => navigator.clipboard?.writeText(qr.code)} className="text-[11px] text-indigo-600 hover:underline">Copy</button>
            </div>
          )}
        </div>
        <div className="shrink-0 inline-flex items-center gap-2 self-start md:self-center flex-wrap">
          <button onClick={onOpen} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300"><EyeIcon /> View</button>
          <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50"><EditIcon /> Edit</button>
          {item.type === 'found' && (
            <button onClick={onQr} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed" disabled={qrBusy}>
              {qrBusy ? <SpinnerIcon /> : <QrIcon />}{qr ? 'QR Code' : 'Generate QR'}
            </button>
          )}
          {!isReturned && uis !== 'returned' && (
            <button onClick={onMarkReturned} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white"><ReturnIcon /> Returned</button>
          )}
          <DeleteItemButton itemId={item.id} title={item.title} />
        </div>
      </div>
      {isReturned && <div className="absolute inset-x-0 bottom-0 h-1 rounded-b-2xl bg-gradient-to-r from-sky-400/40 via-cyan-400/40 to-sky-400/40" />}
    </div>
  )
}

function DeleteItemButton({ itemId, title }: { itemId: number; title: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const onDelete = async () => {
    if (busy || done) return
    const confirm = window.confirm(`Delete this item?\n\n${title}\n\nThis action cannot be undone.`)
    if (!confirm) return
    try {
      setBusy(true)
      await adminDeleteItem(itemId)
      setDone(true)
      // Simple reload for now to refresh lists; could optimize by state removal
      setTimeout(() => window.location.reload(), 500)
    } catch (e) {
      alert((e as Error).message || 'Failed to delete item')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      onClick={onDelete}
      disabled={busy || done}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border-2 ${done ? 'border-rose-300 bg-rose-50 text-rose-500' : 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50'} ${busy ? 'opacity-60 cursor-wait' : ''}`}
      title={done ? 'Deleted' : 'Delete item'}
    >
      {busy ? <SpinnerIcon /> : <TrashIcon />}{done ? 'Deleted' : 'Delete'}
    </button>
  )
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 6l1 14c.1 1 1 2 2 2h6c1 0 1.9-1 2-2l1-14"/>
    </svg>
  )
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="10" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" />
    </svg>
  )
}

function MatchRow({ match, onOpenItem, busy, onConfirm, onDismiss }: {
  match: MatchWithItems
  onOpenItem: (it: ItemLike) => void
  busy?: boolean
  onConfirm: (matchId: number) => Promise<void>
  onDismiss: (matchId: number) => Promise<void>
}) {
  const s = String(match.status || 'pending').toLowerCase()
  const chip = (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
      s === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
      s === 'dismissed' ? 'bg-rose-50 text-rose-700 border-rose-200' :
      'bg-amber-50 text-amber-700 border-amber-200'
    }`}>
      {s.charAt(0).toUpperCase()+s.slice(1)}
    </span>
  )
  return (
    <div className={`rounded-2xl border-2 p-4 transition-all duration-300 ${
      s === 'confirmed' ? 'border-emerald-200 bg-emerald-50/30' :
      s === 'dismissed' ? 'border-rose-200 bg-rose-50/30' :
      'border-indigo-200 bg-indigo-50/30'
    } grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] items-center gap-3`}>
      {/* Lost item */}
      <div className="flex items-center gap-3 min-w-0">
        {match.lostItem?.photoThumbUrl || match.lostItem?.photoUrl ? (
          <img src={match.lostItem.photoThumbUrl || match.lostItem.photoUrl || ''} alt="Lost" className="size-12 rounded-xl object-cover ring-1 ring-black/10" />
        ) : (
          <div className="size-12 rounded-xl bg-gray-100 grid place-items-center text-gray-400">📦</div>
        )}
        <div className="min-w-0">
          <div className="font-semibold truncate" title={match.lostItem?.title || `#${match.lostItem?.id}`}>{match.lostItem?.title || `#${match.lostItem?.id}`}</div>
          <div className="text-xs text-[var(--ink-600)] truncate">{match.lostItem?.location || '—'}</div>
          <button onClick={() => onOpenItem(mapItemLike(match.lostItem))} className="mt-1 text-[11px] underline text-[color:var(--brand)]">View</button>
        </div>
      </div>

      {/* Middle: score and status */}
      <div className="text-center">
        <div className="text-xs text-[var(--ink-600)]">Score</div>
        <div className="text-lg font-semibold text-[color:var(--brand)]">{Math.round((match.score ?? 0) as number)}%</div>
        <div className="mt-1">{chip}</div>
      </div>

      {/* Found item */}
      <div className="flex items-center gap-3 min-w-0">
        {match.foundItem?.photoThumbUrl || match.foundItem?.photoUrl ? (
          <img src={match.foundItem.photoThumbUrl || match.foundItem.photoUrl || ''} alt="Found" className="size-12 rounded-xl object-cover ring-1 ring-black/10" />
        ) : (
          <div className="size-12 rounded-xl bg-gray-100 grid place-items-center text-gray-400">📦</div>
        )}
        <div className="min-w-0">
          <div className="font-semibold truncate" title={match.foundItem?.title || `#${match.foundItem?.id}`}>{match.foundItem?.title || `#${match.foundItem?.id}`}</div>
          <div className="text-xs text-[var(--ink-600)] truncate">{match.foundItem?.location || '—'}</div>
          <button onClick={() => onOpenItem(mapItemLike(match.foundItem))} className="mt-1 text-[11px] underline text-[color:var(--brand)]">View</button>
        </div>
      </div>

      {/* Actions */}
  <div className="justify-self-end inline-flex items-center gap-2">
        {s === 'pending' && (
          <>
    <button disabled={busy} onClick={() => onConfirm(match.id)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${busy ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'}`}>
              <CheckIcon /> Approve
            </button>
    <button disabled={busy} onClick={() => onDismiss(match.id)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${busy ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' : 'bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-700 hover:to-rose-700'}`}>
              <XIcon /> Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}

type ItemUnion = Partial<{
  id: number
  title: string
  description: string | null
  type: 'lost' | 'found' | string
  status: string
  uiStatus: AdminItemUiStatus
  location: string | null
  occurredOn: string | null
  reportedAt: string | null
  photoUrl: string | null
  photoThumbUrl: string | null
  reporter: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
}>

function mapItemLike(it?: ItemUnion | null): ItemLike {
  // Reporter object (if present) may include firstName/lastName/email
  const reporter = it?.reporter || undefined
  let finderName: string | null | undefined = undefined
  if (reporter) {
    const full = [reporter.firstName?.trim(), reporter.lastName?.trim()].filter(Boolean).join(' ').trim()
    finderName = full || reporter.email || null
  }
  return {
    id: Number(it?.id ?? 0),
    title: it?.title || `Item #${it?.id}`,
    description: it?.description ?? undefined,
    type: (it?.type as 'lost' | 'found' | undefined) ?? undefined,
    status: (it?.uiStatus as string | undefined) ?? it?.status ?? undefined,
    location: it?.location ?? undefined,
    occurredOn: it?.occurredOn ?? undefined,
    reportedAt: it?.reportedAt ?? undefined,
    photoUrl: it?.photoUrl ?? undefined,
    photoThumbUrl: it?.photoThumbUrl ?? undefined,
    finderName,
  }
}

function ItemSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="rounded-2xl border-2 border-gray-100 p-6 bg-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-200 animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-1/3 bg-gray-200 rounded animate-pulse" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            </div>
            <div className="inline-flex items-center gap-2">
              <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TypeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 7h10v10H7z" /><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z" />
    </svg>
  )
}
function MapPinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z"/><circle cx="12" cy="11" r="2.5"/>
    </svg>
  )
}
function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
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
function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function EditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/><path d="M14.06 4.94l3.75 3.75" />
    </svg>
  )
}
function ReturnIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polyline points="9 11 4 16 9 21"/><path d="M20 16a8 8 0 1 0-8 8" />
    </svg>
  )
}
function QrIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 20h-3v-3" />
    </svg>
  )
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/>
    </svg>
  )
}

// Edit Modal
function EditItemModal({ item, onClose, onSave }: { item: AdminItem | null; onClose: () => void; onSave: (payload: { title?: string; description?: string | null; location?: string | null; occurredOn?: string | null; statusUi?: AdminItemUiStatus }) => void }) {
  const [title, setTitle] = useState(item?.title || '')
  const [description, setDescription] = useState<string>(item?.description ?? '')
  const [location, setLocation] = useState<string>(item?.location ?? '')
  const [occurredOn, setOccurredOn] = useState<string>(item?.occurredOn ?? '')
  const [statusUi, setStatusUi] = useState<AdminItemUiStatus>(item?.uiStatus || 'unclaimed')

  useEffect(() => {
    setTitle(item?.title || '')
    setDescription(item?.description ?? '')
    setLocation(item?.location ?? '')
    setOccurredOn(item?.occurredOn ?? '')
    setStatusUi(item?.uiStatus || 'unclaimed')
  }, [item])

  if (!item) return null
  const canChangeStatus = statusUi === 'unclaimed' || statusUi === 'matched' || statusUi === 'returned' || ['unclaimed','matched','returned'].includes(String(statusUi))

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600"><TypeIcon /></div>
            <div className="text-[15px] font-semibold text-gray-900">Edit Item</div>
          </div>
          <button onClick={onClose} className="size-9 inline-grid place-items-center rounded-md hover:bg-gray-100"><XIcon /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700">Occurred On</label>
              <input type="date" value={occurredOn || ''} onChange={e => setOccurredOn(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700">Status</label>
              <select value={statusUi} onChange={e => setStatusUi(e.target.value as AdminItemUiStatus)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm">
                <option value="unclaimed">Unclaimed</option>
                <option value="matched">Matched</option>
                <option value="returned">Returned</option>
                <option value="claim_pending" disabled>Claim Pending</option>
                <option value="claim_approved" disabled>Claim Approved</option>
                <option value="claim_rejected" disabled>Claim Rejected</option>
              </select>
              {!canChangeStatus && <div className="mt-1 text-[11px] text-gray-500">Claim-based statuses are controlled via Claims.</div>}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => onSave({ title, description, location, occurredOn: occurredOn || null, statusUi })}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  )
}
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="m18 6-12 12"/><path d="m6 6 12 12"/>
    </svg>
  )
}

function QrPreviewModal({ item, qr, onClose, onRegenerate, busy }: { item: AdminItem; qr: QrCodeDto; onClose: () => void; onRegenerate: () => void; busy?: boolean }) {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
  const img = `${apiBase}/qrcodes/${qr.code}/image?size=8`
  const scanUrl = qr.canonicalUrl || qr.url || `${apiBase}/qrcodes/${qr.code}/item`
  // Public page URL intentionally removed for unified single QR link usage
  const onPrint = () => {
    // Ensure print section images are loaded before printing
    const targets = [
      document.getElementById('print-qr-img') as HTMLImageElement | null,
      document.getElementById('print-item-img') as HTMLImageElement | null,
    ].filter(Boolean) as HTMLImageElement[]
    const needs = targets.filter(el => el && !el.complete)
    if (needs.length > 0) {
      let remaining = needs.length
      const done = () => { remaining -= 1; if (remaining <= 0) window.print() }
      needs.forEach(el => el.addEventListener('load', done, { once: true }))
      // Fallback timeout in case of cached images not firing load
      setTimeout(() => window.print(), 800)
      return
    }
    window.print()
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = img
    a.download = `item-${item.id}-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  const copyLink = async () => {
    try { await navigator.clipboard?.writeText(scanUrl); alert('Link copied to clipboard') } catch { /* ignore */ }
  }
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-600/5 to-blue-600/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow"><QrIcon /></div>
            <div className="text-[15px] font-semibold text-gray-900">QR Code • Found Item #{item.id}</div>
          </div>
          <button onClick={onClose} className="size-9 inline-grid place-items-center rounded-lg hover:bg-black/5"><XIcon /></button>
        </div>
        <div className="p-6 flex flex-col md:flex-row gap-6">
          <div className="relative flex flex-col items-center justify-center">
            <div className="relative p-4 rounded-2xl bg-white shadow-inner ring-1 ring-gray-200">
              <img src={img} alt="QR Code" className="w-56 h-56 rounded-xl border border-gray-200" />
              {qr.scanCount !== undefined && (
                <div className="absolute -top-2 -right-2 rounded-full bg-indigo-600 text-white text-[10px] font-semibold px-2 py-1 shadow">
                  {qr.scanCount} scan{qr.scanCount === 1 ? '' : 's'}
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-600">
              {qr.lastScannedAt && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><ClockIcon /> Last {relativeTime(qr.lastScannedAt)}</span>}
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">Code: <code className="font-mono">{qr.code}</code></span>
            </div>
          </div>
          <div className="text-sm text-gray-800 min-w-0 flex-1">
            <div className="font-semibold text-lg truncate" title={item.title}>{item.title}</div>
            <div className="text-xs text-gray-600 truncate">{item.location || '—'}</div>
            <div className="mt-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Scan Link</div>
              <div className="text-xs break-all rounded-lg bg-gray-50 border border-gray-200 p-2 font-mono">
                <a href={scanUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{scanUrl}</a>
              </div>
            </div>
            {item.description && (
              <div className="mt-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Item Description</div>
                <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100 max-h-40 overflow-auto">
                  {item.description}
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button onClick={onRegenerate} disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                {busy ? <SpinnerIcon /> : <RefreshIcon />} Regenerate
              </button>
              <button onClick={onPrint} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"><PrintIcon /> Print</button>
              <button onClick={download} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-white border border-gray-300 hover:bg-gray-50"><DownloadIcon /> Download PNG</button>
              <button onClick={copyLink} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-white border border-gray-300 hover:bg-gray-50"><LinkIcon /> Copy Link</button>
            </div>
          </div>
        </div>
        {/* Print-only layout: A4 professional sheet */}
        <div id="print-area">
          <div className="print-sheet" style={{ fontFamily: 'var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em' }}>Found Item #{item.id}</div>
                <div style={{ fontSize: '14px', marginTop: '4px' }}>{item.title}</div>
                {item.location && <div className="print-muted" style={{ fontSize: '12px', marginTop: '2px' }}>Location: {item.location}</div>}
                <div className="print-muted" style={{ fontSize: '12px', marginTop: '2px' }}>Type: {item.type === 'found' ? 'Found' : (item.type === 'lost' ? 'Lost' : String(item.type || 'Item'))}</div>
                {item.occurredOn && <div className="print-muted" style={{ fontSize: '12px', marginTop: '2px' }}>Occurred: {new Date(item.occurredOn).toLocaleDateString()}</div>}
                {item.reportedAt && <div className="print-muted" style={{ fontSize: '12px', marginTop: '2px' }}>Reported: {new Date(item.reportedAt).toLocaleString()}</div>}
              </div>
              <img id="print-qr-img" src={img} alt="QR Code" style={{ width: '200px', height: '200px', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff' }} />
            </div>

            {/* Body grid: Item image + details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px', alignItems: 'start', marginTop: '8px' }}>
              {/* Item photo */}
              <div>
                { (item.photoUrl || item.photoThumbUrl) ? (
                  <img id="print-item-img" src={item.photoUrl || item.photoThumbUrl || ''} alt="Item" style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#fff' }} />
                ) : (
                  <div style={{ width: '100%', height: '220px', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#94a3b8', display: 'grid', placeItems: 'center' }}>No image</div>
                )}
              </div>
              {/* Details */}
              <div>
                {item.description && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#334155' }}>Description</div>
                    <div style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.45 }}>{item.description}</div>
                  </div>
                )}
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#334155' }}>Scan Link</div>
                <div className="print-small" style={{ marginTop: '6px', wordBreak: 'break-all' }}>{scanUrl}</div>
                {/* Public page removed for unified single QR link display */}
                {qr.scanCount !== undefined && (
                  <div className="print-muted print-small" style={{ marginTop: '8px' }}>Scans: {qr.scanCount ?? 0}{qr.lastScannedAt ? ` • Last: ${new Date(qr.lastScannedAt).toLocaleString()}` : ''}</div>
                )}
              </div>
            </div>

            {/* Footer note */}
            <div className="print-muted" style={{ fontSize: '11px', marginTop: '16px' }}>Scan this QR to view the item details and request a claim if this item belongs to you.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function QrInline({ code }: { code: string }) {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
  const img = `${apiBase}/qrcodes/${code}/image?size=2`
  return <img src={img} alt="QR" className="w-8 h-8 rounded border border-gray-200 bg-white" />
}

// Small utility: human friendly relative time
function relativeTime(date: string | number | Date): string {
  const d = new Date(date)
  const diffMs = Date.now() - d.getTime()
  const abs = Math.abs(diffMs)
  const sec = Math.round(abs / 1000)
  const min = Math.round(sec / 60)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)
  const fmt = (n: number, w: string) => `${n} ${w}${n !== 1 ? 's' : ''}`
  let value: string
  if (sec < 45) value = fmt(sec, 'second')
  else if (min < 45) value = fmt(min, 'minute')
  else if (hr < 24) value = fmt(hr, 'hour')
  else if (day < 30) value = fmt(day, 'day')
  else value = d.toLocaleDateString()
  return diffMs >= 0 ? `${value} ago` : `in ${value}`
}

function RefreshIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M3 3v6h6" /><path d="M21 21v-6h-6" /><path d="M21 12A9 9 0 0 0 6.3 5.3L3 9" /><path d="M3 12a9 9 0 0 0 14.7 6.7L21 15" />
    </svg>
  )
}
function PrintIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" />
    </svg>
  )
}
function DownloadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M12 3v14" /><path d="M6 13l6 6 6-6" /><path d="M5 21h14" />
    </svg>
  )
}
function LinkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.72-1.71" />
    </svg>
  )
}
