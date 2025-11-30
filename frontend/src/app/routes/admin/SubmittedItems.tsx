import { useEffect, useMemo, useState } from 'react'
import { adminListItems, type AdminItem, adminDeleteItem, adminApproveItem } from '../../../lib/api'

// A focused admin view for newly submitted items awaiting verification.
// Approval is implicit (keep item as-is). Rejection deletes the item to prevent public display.
export default function SubmittedItems() {
  const [items, setItems] = useState<AdminItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // Load both lost and found that are unclaimed (fresh submissions)
        const [lost, found] = await Promise.all([
          adminListItems({ type: 'lost', uiStatus: 'unclaimed', q: q || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit: 500 }).catch(() => [] as AdminItem[]),
          adminListItems({ type: 'found', uiStatus: 'unclaimed', q: q || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit: 500 }).catch(() => [] as AdminItem[]),
        ])
        if (!cancelled) setItems([...lost, ...found].filter(x => !x.approved))
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Failed to load submitted items')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [q, dateFrom, dateTo])

  const ordered = useMemo(() => {
    const rows = items.slice()
    const ts = (d?: string | null, id?: number) => {
      if (d) {
        const t = Date.parse(d)
        if (!Number.isNaN(t)) return t
      }
      return (id || 0) * 1000
    }
    rows.sort((a, b) => ts(b.reportedAt, b.id) - ts(a.reportedAt, a.id))
    return rows
  }, [items])

  const approve = async (it: AdminItem) => {
    try {
      await adminApproveItem(Number(it.id))
      setItems(prev => prev.filter(x => x.id !== it.id))
    } catch (e) {
      alert((e as Error)?.message || 'Failed to approve item')
    }
  }

  const reject = async (it: AdminItem) => {
    if (!confirm(`Reject and remove “${it.title}”? This cannot be undone.`)) return
    setBusyId(Number(it.id))
    try {
      await adminDeleteItem(Number(it.id))
      setItems(prev => prev.filter(x => x.id !== it.id))
    } catch (e) {
      alert((e as Error)?.message || 'Failed to reject item')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6 6 .9-4.5 4.4L18 20l-6-3.2L6 20l1.5-6.7L3 8.9 9 8z"/></svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">Submitted Items</h1>
            <p className="text-gray-600">Review new reports and approve or reject</p>
          </div>
        </div>

        {/* Filters */}
        <section className="mb-6 rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-gray-700">Search</label>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Keywords: title, location, reporter…" className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-300 outline-none" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-700">From date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-300 outline-none" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-700">To date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-300 outline-none" />
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-6 text-gray-600">Loading…</div>
          ) : error ? (
            <div className="p-6 text-red-600">{error}</div>
          ) : ordered.length === 0 ? (
            <div className="p-6 text-gray-600">No submitted items awaiting review.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {ordered.map(it => (
                <div key={it.id} className="p-4 sm:p-6 flex items-start gap-4 hover:bg-gray-50">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                    {it.photoThumbUrl ? (
                      <img src={it.photoThumbUrl || it.photoUrl || undefined} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16v14H4z M9 9l2.5 3 2.5-3 4 6H6z"/></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white bg-indigo-600">
                        {it.type === 'found' ? 'Found' : 'Lost'}
                      </span>
                      <h2 className="text-lg font-semibold text-gray-900 truncate">{it.title}</h2>
                    </div>
                    {it.description && (
                      <p className="mt-1 text-gray-700 line-clamp-2">{it.description}</p>
                    )}
                    <div className="mt-2 text-sm text-gray-600 flex flex-wrap gap-3">
                      {it.location && (<span>📍 {it.location}</span>)}
                      {it.reportedAt && (<span>🗓️ {new Date(it.reportedAt).toLocaleString()}</span>)}
                      {it.reporter && (
                        <span>👤 {(it.reporter.firstName || '') + ' ' + (it.reporter.lastName || '') || (it.reporter.email || 'Reporter')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => approve(it)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5 1.4-1.4L9 13.4l8.1-8.1 1.4 1.4z"/></svg>
                      Approve
                    </button>
                    <button onClick={() => reject(it)} disabled={busyId === Number(it.id)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6l12 12M6 18L18 6"/></svg>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
