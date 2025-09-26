import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAdminDailyStats,
  getAdminOverviewStats,
  getAdminReportsSeries,
  listAuditEvents,
  listUrgentClaims,
  listPendingMatches,
  type AdminDailyStats,
  type AdminOverviewStats,
  type ReportsPoint,
  type AuditEvent,
  type PendingMatchLite,
  type UrgentClaimLite,
  listItems,
  type ItemDto,
  confirmMatch,
  dismissMatch,
} from '../../../lib/api'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

type Activity = { id: string | number; type: string; message: string; user?: string; at: string }

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState<AdminDailyStats>({ newReports: 0, pendingClaims: 0, successfulReturns: 0 })
  const [priorityAlerts, setPriorityAlerts] = useState<Activity[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [matches, setMatches] = useState<PendingMatchLite[]>([])
  const [items, setItems] = useState<ItemDto[]>([])
  const [busyMatchId, setBusyMatchId] = useState<string | number | null>(null)
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState<AdminOverviewStats>({ lost: 0, found: 0, claimed: 0, pending: 0 })
  const [series, setSeries] = useState<ReportsPoint[]>([])
  const [rangeDays, setRangeDays] = useState(30)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [stats, urgent, events, pending, list, ov, pts] = await Promise.all([
          getAdminDailyStats().catch(() => ({ newReports: 0, pendingClaims: 0, successfulReturns: 0 })),
          listUrgentClaims(5).catch(() => [] as UrgentClaimLite[]),
          listAuditEvents(8).catch(() => [] as AuditEvent[]),
          listPendingMatches(5).catch(() => [] as PendingMatchLite[]),
          listItems({ limit: 500 }).catch(() => [] as ItemDto[]),
          getAdminOverviewStats().catch(() => ({ lost: 0, found: 0, claimed: 0, pending: 0 })),
          getAdminReportsSeries(rangeDays).catch(() => [] as ReportsPoint[]),
        ])
        if (cancelled) return
        setCounts(stats)
        setTotals(ov)
        setPriorityAlerts(
          urgent.map((u) => ({
            id: u.id,
            type: 'claim',
            message: `Urgent claim awaiting verification for ${u.itemTitle ?? 'item'}`,
            user: u.userEmail ?? undefined,
            at: u.createdAt,
          }))
        )
        setActivity(
          events.map((e) => ({
            id: e.id,
            type: e.type,
            message: e.message,
            user: e.userEmail ?? undefined,
            at: e.createdAt,
          }))
        )
        setMatches(pending)
        setItems(list)
        setSeries(pts)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [rangeDays])

  // gentle auto-refresh every 60s for live dashboard feel
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const [ov, pts, stats] = await Promise.all([
          getAdminOverviewStats().catch(() => totals),
          getAdminReportsSeries(rangeDays).catch(() => series),
          getAdminDailyStats().catch(() => counts),
        ])
        setTotals(ov)
        setSeries(pts)
        setCounts(stats)
      } catch {
        // Ignore errors during auto-refresh
      }
    }, 60_000)
    return () => clearInterval(t)
  }, [rangeDays, totals, series, counts])

  const successRate = useMemo(() => {
    const total = counts.successfulReturns + counts.pendingClaims + counts.newReports
    if (total > 0) return Math.round((counts.successfulReturns / total) * 100)
    // Fallback to items-based estimate (claimed/closed considered successful)
    if (items.length === 0) return 0
    const succ = items.filter(i => ['closed', 'claimed', 'resolved', 'returned'].includes(String(i.status).toLowerCase())).length
    return Math.round((succ / items.length) * 100)
  }, [counts, items])

  const topLocations = useMemo(() => {
    if (items.length === 0) return [] as string[]
    const map = new Map<string, number>()
    for (const it of items) {
      const loc = (it.location ?? '').trim()
      if (!loc) continue
      map.set(loc, (map.get(loc) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
  }, [items])

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const it of items) {
      const s = String(it.status ?? 'open').toLowerCase()
      counts[s] = (counts[s] ?? 0) + 1
    }
    const open = (counts['open'] ?? 0) + (counts['pending'] ?? 0)
    const matched = counts['matched'] ?? 0
    const closed = (counts['closed'] ?? 0) + (counts['claimed'] ?? 0) + (counts['resolved'] ?? 0)
    return { open, matched, closed }
  }, [items])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Daily overview, priorities, and insights • {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          
          {/* Live Status Banner */}
          <div className="rounded-2xl p-4 border-2 bg-green-50 border-green-200 text-green-800 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-200">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
              </div>
              <div>
                <div className="font-semibold">System Online</div>
                <div className="text-sm opacity-90">All services are operational • Auto-refresh every 60s</div>
              </div>
              <div className="ml-auto text-xs bg-green-200 px-3 py-1 rounded-full font-medium">
                Live Updates
              </div>
            </div>
          </div>
        </div>

        {/* Priority Alerts */}
        <section className="mb-8">
          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 text-red-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Priority Alerts</h2>
                  <p className="text-sm text-gray-600">Urgent claims requiring immediate attention</p>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading urgent claims...</p>
                  </div>
                </div>
              ) : priorityAlerts.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">All Clear!</h4>
                  <p className="text-gray-600">No urgent claims requiring attention at the moment.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {priorityAlerts.map((a) => (
                    <div key={a.id} className="rounded-xl border-2 border-red-200 bg-red-50/50 p-4 transition-all duration-300 hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-3 rounded-xl bg-red-100 text-red-600 shrink-0">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900 mb-1">{a.message}</div>
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="px-2 py-0.5 bg-gray-100 rounded-full font-medium">
                                {a.user ?? 'Unknown User'}
                              </span>
                              <span>•</span>
                              <span>{timeAgo(a.at)}</span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => navigate('/admin/claims/pending')} 
                          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-all shadow-lg"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                          </svg>
                          Review Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Overview totals */}
        <section className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{totals.lost}</div>
                <div className="text-xs text-gray-500 font-medium">Items</div>
              </div>
            </div>
            <div className="text-sm text-gray-700 font-medium">Total Lost</div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-green-100 text-green-600">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">{totals.found}</div>
                <div className="text-xs text-gray-500 font-medium">Items</div>
              </div>
            </div>
            <div className="text-sm text-gray-700 font-medium">Total Found</div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-600">{totals.claimed}</div>
                <div className="text-xs text-gray-500 font-medium">Items</div>
              </div>
            </div>
            <div className="text-sm text-gray-700 font-medium">Total Claimed</div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-amber-100 text-amber-600">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-amber-600">{totals.pending}</div>
                <div className="text-xs text-gray-500 font-medium">Items</div>
              </div>
            </div>
            <div className="text-sm text-gray-700 font-medium">Pending</div>
          </div>
        </section>

        {/* Today snapshot */}
        <section className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-indigo-100 text-indigo-600">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-indigo-600">{counts.newReports}</div>
                  <div className="text-sm font-semibold text-gray-900">New Reports Today</div>
                  <div className="text-xs text-gray-500">Fresh submissions</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (counts.newReports / 10) * 100)}%` }}></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{counts.pendingClaims}</div>
                  <div className="text-sm font-semibold text-gray-900">Pending Claims</div>
                  <div className="text-xs text-gray-500">Awaiting review</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-600 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (counts.pendingClaims / 20) * 100)}%` }}></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-green-100 text-green-600">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{counts.successfulReturns}</div>
                  <div className="text-sm font-semibold text-gray-900">Returns Today</div>
                  <div className="text-xs text-gray-500">Successfully returned</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (counts.successfulReturns / 5) * 100)}%` }}></div>
              </div>
            </div>
          </div>
        </section>

        {/* Grid: Quick actions, Activity, Matching, Analytics */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Quick actions */}
          <div className="xl:col-span-4">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
                    <p className="text-sm text-gray-600">Common admin tasks</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => navigate('/admin/claims/pending')} 
                    className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all shadow-lg hover:shadow-xl"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Approve Claims</span>
                  </button>
                  <button 
                    onClick={() => navigate('/admin/items/lost')} 
                    className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white transition-all shadow-lg hover:shadow-xl"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Moderate Reports</span>
                  </button>
                  <button 
                    onClick={() => navigate('/admin/social/posts')} 
                    className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white transition-all shadow-lg hover:shadow-xl"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span className="font-medium">Post to Facebook</span>
                  </button>
                  <button 
                    onClick={() => navigate('/admin/claims')} 
                    className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-all hover:border-blue-300"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">View All Claims</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="xl:col-span-4">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 text-green-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                    <p className="text-sm text-gray-600">Latest system events</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="w-6 h-6 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-sm text-gray-600">Loading activity...</p>
                    </div>
                  </div>
                ) : activity.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-600">No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activity.map((e) => (
                      <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 mb-1">{e.message}</div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="px-2 py-0.5 bg-white rounded-full font-medium">
                              {e.user ?? 'System'}
                            </span>
                            <span>•</span>
                            <span>{timeAgo(e.at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Matching Queue */}
          <div className="xl:col-span-4">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Matching Queue</h3>
                    <p className="text-sm text-gray-600">Items pending manual review</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-sm text-gray-600">Loading matches...</p>
                    </div>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-medium text-gray-900 mb-1">All caught up!</h4>
                    <p className="text-xs text-gray-600">No matches to review</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {matches.map((m) => (
                      <div key={m.id} className="rounded-xl border-2 border-purple-200 bg-purple-50/50 p-4 transition-all duration-300">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-900 mb-1">{m.itemTitle ?? 'Item'}</div>
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="px-2 py-0.5 bg-white rounded-full font-medium">
                                {m.claimantEmail ?? 'Unknown'}
                              </span>
                              <span>•</span>
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-bold">
                                {m.confidence ?? '—'}% match
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled={busyMatchId === m.id}
                            onClick={async () => {
                              try {
                                setBusyMatchId(m.id)
                                if (typeof m.id === 'number') await confirmMatch(m.id)
                              } catch (e) {
                                alert((e as Error).message || 'Failed to approve match')
                              } finally {
                                setBusyMatchId(null)
                              }
                            }}
                            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                          >
                            {busyMatchId === m.id ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            Approve
                          </button>
                          <button
                            disabled={busyMatchId === m.id}
                            onClick={async () => {
                              try {
                                setBusyMatchId(m.id)
                                if (typeof m.id === 'number') await dismissMatch(m.id)
                              } catch (e) {
                                alert((e as Error).message || 'Failed to reject match')
                              } finally {
                                setBusyMatchId(null)
                              }
                            }}
                            className="flex-1 flex items-center justify-center gap-2 border-2 border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                          >
                            {busyMatchId === m.id ? (
                              <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            )}
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Analytics */}
          <div className="xl:col-span-8">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Reports Over Time</h3>
                      <p className="text-sm text-gray-600">Track trends and patterns</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
                    {[7, 30, 90].map(d => (
                      <button 
                        key={d} 
                        onClick={() => setRangeDays(d)} 
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          rangeDays === d 
                            ? 'bg-white shadow-md text-indigo-600 border border-indigo-200' 
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                <div className="h-64 sm:h-80 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gLost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="gFound" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12, fill: '#6B7280' }} 
                        tickMargin={12} 
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        allowDecimals={false} 
                        width={40} 
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          fontSize: 12, 
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '12px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                        }} 
                        labelStyle={{ fontWeight: 600, color: '#374151' }} 
                      />
                      <Legend wrapperStyle={{ fontSize: 14, paddingTop: '20px' }} />
                      <Area 
                        type="monotone" 
                        dataKey="lost" 
                        name="Lost Items" 
                        stroke="#3B82F6" 
                        fill="url(#gLost)" 
                        strokeWidth={3} 
                        dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2, fill: 'white' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="found" 
                        name="Found Items" 
                        stroke="#10B981" 
                        fill="url(#gFound)" 
                        strokeWidth={3} 
                        dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: 'white' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 p-4 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-blue-700">{successRate}%</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-blue-800">Success Rate</div>
                    <div className="text-xs text-blue-600 opacity-90">Recovered vs total reports</div>
                  </div>

                  <div className="rounded-xl bg-gradient-to-br from-purple-50 to-pink-100 p-4 border border-purple-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-700 truncate">
                          {topLocations.slice(0, 2).join(', ') || '—'}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-purple-800">Top Locations</div>
                    <div className="text-xs text-purple-600 opacity-90">Most reported areas</div>
                  </div>

                  <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-100 p-4 border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 rounded-lg bg-green-100 text-green-600">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-700">
                          {statusBreakdown.open}/{statusBreakdown.matched}/{statusBreakdown.closed}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-green-800">Status Breakdown</div>
                    <div className="text-xs text-green-600 opacity-90">Open/Matched/Closed</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Spacer for layout balance */}
          <div className="xl:col-span-4 hidden xl:block" />
        </section>
      </div>
    </div>
  )
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - d)
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  return `${days}d ago`
}
