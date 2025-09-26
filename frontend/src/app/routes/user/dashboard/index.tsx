import { Link, NavLink } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { 
  getRecentItems,
  listItems,
  listClaims,
  type ItemDto,
  type ClaimDto,
  smartSearch,
  upsertMatch,
  confirmMatch,
  dismissMatch,
  type SmartMatch
} from '../../../../lib/api.ts'
import { useAuth } from '../../../../lib/useAuth.ts'

type Activity = {
  id: number | string
  title: string
  date?: string
  status?: 'pending' | 'matched' | 'resolved' | string
  type?: 'lost' | 'found' | 'claim'
  location?: string | null
  photoThumbUrl?: string | null
}

type Recommendation = {
  id: string
  lostItemId: number
  foundItemId: number
  title: string
  score: number // 0..1 (convert to % when persisting)
  occurredOn?: string | null
  location?: string | null
  photoUrl?: string | null
  candidateType?: 'lost' | 'found'
}

type DashboardStats = {
  totalReports: number
  activeReports: number
  matchesFound: number
  successfulReturns: number
}

export default function UserDashboard() {
  const { user } = useAuth()
  const [lost, setLost] = useState<Activity[]>([])
  const [found, setFound] = useState<Activity[]>([])
  const [claims, setClaims] = useState<Activity[]>([])
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [recsLoading, setRecsLoading] = useState(false)
  const [matchActionBusy, setMatchActionBusy] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'matched' | 'resolved'>('all')
  const [stats, setStats] = useState<DashboardStats>({
    totalReports: 0,
    activeReports: 0,
    matchesFound: 0,
    successfulReturns: 0
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!user) {
          // Fallback demo data when user is not ready
          const items = await getRecentItems(8)
          if (cancelled) return
          const toAct = (arr: typeof items) => arr.map((x, i) => ({
            id: x.id ?? i,
            title: x.name ?? 'Item',
            date: x.date,
            status: ['pending', 'matched', 'resolved'][Math.floor(Math.random() * 3)] as 'pending' | 'matched' | 'resolved',
            type: ['lost', 'found'][i % 2] as 'lost' | 'found',
          }))
          const lostItems = toAct(items.slice(0, 4))
          const foundItems = toAct(items.slice(4, 8))
          setLost(lostItems)
          setFound(foundItems)
          setClaims([])
          setStats({
            totalReports: lostItems.length + foundItems.length,
            activeReports: [...lostItems, ...foundItems].filter(item => item.status === 'pending').length,
            matchesFound: [...lostItems, ...foundItems].filter(item => item.status === 'matched').length,
            successfulReturns: [...lostItems, ...foundItems].filter(item => item.status === 'resolved').length,
          })
          return
        }

        // Live data
        const [lostRes, foundRes, claimsRes] = await Promise.all([
          listItems({ type: 'lost', reporterUserId: user.id, limit: 20 }).catch<ItemDto[]>(() => []),
          listItems({ type: 'found', reporterUserId: user.id, limit: 20 }).catch<ItemDto[]>(() => []),
          listClaims({ claimantUserId: user.id, limit: 20 }).catch<ClaimDto[]>(() => []),
        ])

        if (cancelled) return

        const toActivity = (arr: ItemDto[], type: 'lost' | 'found'): Activity[] => arr.map((it) => ({
          id: it.id,
          title: it.title,
          date: it.reportedAt ?? it.occurredOn ?? undefined,
          status: (it.status as Activity['status']) ?? 'pending',
          type,
          location: it.location ?? null,
          photoThumbUrl: it.photoThumbUrl ?? null,
        }))

        const lostItems = toActivity(lostRes, 'lost')
        const foundItems = toActivity(foundRes, 'found')
        const claimActs: Activity[] = claimsRes.map((c) => ({
          id: c.id,
          title: `Claim #${c.id} • Item ${c.itemId}`,
          date: c.createdAt ?? undefined,
          status: c.status as Activity['status'],
          type: 'claim',
        }))

        setLost(lostItems)
        setFound(foundItems)
        setClaims(claimActs)

        const activeLost = lostItems.filter(i => String(i.status).toLowerCase() !== 'resolved')
        const activeFound = foundItems.filter(i => String(i.status).toLowerCase() !== 'resolved')
        const matchedCount = [...lostItems, ...foundItems].filter(i => String(i.status).toLowerCase() === 'matched').length
        const resolvedCount = [...lostItems, ...foundItems].filter(i => String(i.status).toLowerCase() === 'resolved').length
        setStats({
          totalReports: lostItems.length + foundItems.length,
          activeReports: activeLost.length + activeFound.length,
          matchesFound: matchedCount,
          successfulReturns: resolvedCount,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  // Recommendations via Smart Search: for each of user's lost & found items, fetch matches and suggest >= 50% confidence
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user || (lost.length === 0 && found.length === 0)) {
        setRecs([])
        return
      }
      setRecsLoading(true)
      try {
        const lostChunksPromise = Promise.all(
          lost.slice(0, 6).map(async (li) => {
            try {
              const m: SmartMatch[] = await smartSearch({ itemId: Number(li.id), limit: 5 })
              return m
                .filter(x => x.score >= 0.5)
                .map(x => ({
                  id: `${x.lostItem ?? li.id}-${x.foundItem}`,
                  lostItemId: (x.lostItem ?? Number(li.id)) as number,
                  foundItemId: (x.foundItem ?? 0) as number,
                  title: x.candidate?.title ?? 'Potential match',
                  score: x.score,
                  occurredOn: x.candidate?.occurredOn ?? null,
                  location: x.candidate?.location ?? null,
                  photoUrl: x.candidate?.photoUrl ?? null,
                  candidateType: x.candidate?.type ?? 'found',
                })) as Recommendation[]
            } catch {
              return [] as Recommendation[]
            }
          })
        )
        const foundChunksPromise = Promise.all(
          found.slice(0, 6).map(async (fi) => {
            try {
              const m: SmartMatch[] = await smartSearch({ itemId: Number(fi.id), limit: 5 })
              return m
                .filter(x => x.score >= 0.5)
                .map(x => ({
                  id: `${x.lostItem}-${x.foundItem ?? fi.id}`,
                  lostItemId: (x.lostItem ?? 0) as number,
                  foundItemId: (x.foundItem ?? Number(fi.id)) as number,
                  title: x.candidate?.title ?? 'Potential match',
                  score: x.score,
                  occurredOn: x.candidate?.occurredOn ?? null,
                  location: x.candidate?.location ?? null,
                  photoUrl: x.candidate?.photoUrl ?? null,
                  candidateType: x.candidate?.type ?? 'lost',
                })) as Recommendation[]
            } catch {
              return [] as Recommendation[]
            }
          })
        )
        const [lostChunks, foundChunks] = await Promise.all([lostChunksPromise, foundChunksPromise])
        if (cancelled) return
        // Deduplicate by foundItemId (prefer higher score)
        const flat = [...lostChunks.flat(), ...foundChunks.flat()]
        const dedupMap = new Map<number, Recommendation>()
        for (const r of flat) {
          const existing = dedupMap.get(r.foundItemId)
          if (!existing || r.score > existing.score) dedupMap.set(r.foundItemId, r)
        }
        setRecs(Array.from(dedupMap.values()))
      } finally {
        if (!cancelled) setRecsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, lost, found])

  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening'
  const normalizeStatus = (s?: string): 'pending' | 'matched' | 'resolved' | null => {
    const v = String(s ?? '').toLowerCase()
    if (v === 'pending' || v === 'matched' || v === 'resolved') return v
    return null
  }
  const filteredLost = useMemo(
    () => lost.filter(i => filter === 'all' ? true : normalizeStatus(String(i.status)) === filter),
    [lost, filter]
  )
  const filteredFound = useMemo(
    () => found.filter(i => filter === 'all' ? true : normalizeStatus(String(i.status)) === filter),
    [found, filter]
  )

  return (
    <div className="min-h-[calc(100vh-64px-64px)] bg-academic">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Enhanced Header with better visual hierarchy */}
        <header className="mb-8">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/20 shadow-lg p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20 backdrop-blur-sm">
                    <div className="size-2 rounded-full bg-[color:var(--accent)] animate-pulse" />
                    Student Dashboard
                  </div>
                  <div className="text-sm text-[var(--ink-600)] font-medium">
                    {new Date().toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--ink)] leading-tight mb-2">
                    {greeting}{user?.firstName ? `, ${user.firstName}` : ''}! 👋
                  </h1>
                  <p className="text-lg text-[var(--ink-600)] max-w-2xl leading-relaxed">
                    Welcome back to your Lost & Found hub. Track reports, discover smart matches, and connect with our campus community.
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Mobile-friendly filter buttons */}
                <div className="flex items-center gap-1 rounded-2xl border border-black/10 bg-white/90 backdrop-blur-sm p-1 shadow-sm">
                  {(['all','pending','matched','resolved'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setFilter(v)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        filter === v 
                          ? 'bg-[color:var(--brand)] text-white shadow-md transform scale-105' 
                          : 'text-[var(--ink-600)] hover:bg-black/5 hover:text-[var(--ink)]'
                      }`}
                      aria-pressed={filter === v}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
                
                <NavLink 
                  to="/settings" 
                  className="group inline-flex items-center gap-3 rounded-2xl border border-black/10 bg-white/90 backdrop-blur-sm px-5 py-3 text-sm font-medium text-[var(--ink-600)] shadow-sm hover:bg-white hover:border-black/20 hover:shadow-md transition-all duration-200 transform hover:scale-105"
                >
                  <svg className="size-5 text-[var(--ink-600)] group-hover:text-[color:var(--brand)] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>
                    <path d="m2 12 3 1 1 3 3 1 1 3h4l1-3 3-1 1-3 3-1-3-1-1-3-3-1-1-3h-4l-1 3-3 1-1 3-3 1Z"/>
                  </svg>
                  Settings
                </NavLink>
              </div>
            </div>
          </div>
        </header>

        {/* Enhanced Statistics Cards */}
        <section className="mb-8" aria-labelledby="dashboard-stats">
          <h2 id="dashboard-stats" className="text-xl font-semibold text-[var(--ink)] mb-4">Your Activity Overview</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Reports"
              value={stats.totalReports}
              icon={<ReportsIcon />}
              color="blue"
              trend="+2 this week"
              description="Items you've reported"
            />
            <StatCard
              title="Active Reports"
              value={stats.activeReports}
              icon={<ActiveIcon />}
              color="amber"
              trend="Needs attention"
              description="Pending resolution"
            />
            <StatCard
              title="Matches Found"
              value={stats.matchesFound}
              icon={<MatchIcon />}
              color="emerald"
              trend="+1 today"
              description="Potential connections"
            />
            <StatCard
              title="Successful Returns"
              value={stats.successfulReturns}
              icon={<SuccessIcon />}
              color="purple"
              trend="87% success rate"
              description="Items reunited"
            />
          </div>
        </section>

        {/* Enhanced Quick Actions */}
        <section className="mb-8" aria-labelledby="quick-actions">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 id="quick-actions" className="text-xl font-semibold text-[var(--ink)] mb-1">Quick Actions</h2>
              <p className="text-sm text-[var(--ink-600)]">Most common tasks to get you started</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ActionCard
              to="/report/lost"
              title="Report Lost Item"
              description={`${filteredLost.filter(i => String(i.status).toLowerCase() !== 'resolved').length} active lost items`}
              color="red"
              icon={<LostIcon />}
              badge={lost.length > 0 ? `${lost.length}` : undefined}
              priority="high"
            />
            <ActionCard
              to="/report/found"
              title="Report Found Item"
              description={`${filteredFound.filter(i => String(i.status).toLowerCase() !== 'resolved').length} active found items`}
              color="emerald"
              icon={<FoundIcon />}
              badge={found.length > 0 ? `${found.length}` : undefined}
              priority="high"
            />
            <ActionCard
              to="/search"
              title="Smart Search"
              description={`${recs.length} AI-powered recommendations available`}
              color="blue"
              icon={<SearchIcon />}
              badge={recs.length > 0 ? `${recs.length}` : undefined}
              priority="medium"
            />
          </div>
        </section>

        {/* Main Content Layout - Enhanced */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2">
            <section aria-labelledby="my-activity">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 id="my-activity" className="text-xl font-semibold text-[var(--ink)] mb-1">My Activity</h2>
                  <p className="text-sm text-[var(--ink-600)]">Your recent reports and claims</p>
                </div>
                <Link
                  to="/my-reports"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--brand)] hover:text-[color:var(--brand-strong)] transition-colors group"
                >
                  View All
                  <svg className="size-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </Link>
              </div>

              <div className="space-y-6">
                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="bg-white/80 backdrop-blur-sm border border-black/10 rounded-2xl p-6 shadow-sm">
                        <div className="h-6 w-40 bg-gray-200 rounded mb-4 animate-pulse" />
                        {[...Array(3)].map((_, j) => (
                          <div key={j} className="h-16 rounded-xl bg-gray-100 animate-pulse mb-3 last:mb-0" />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ActivityCard
                        title="Lost Items"
                        items={filteredLost}
                        emptyTitle="No lost items reported"
                        emptyDescription="When you report a lost item, it will appear here for tracking."
                        color="red"
                        icon={<LostIcon />}
                      />
                      <ActivityCard
                        title="Found Items"
                        items={filteredFound}
                        emptyTitle="No found items reported"
                        emptyDescription="Items you've found and reported will be tracked here."
                        color="emerald"
                        icon={<FoundIcon />}
                      />
                    </div>

                    {claims.length > 0 && (
                      <ActivityCard
                        title="My Claims"
                        items={claims}
                        emptyTitle="No active claims"
                        emptyDescription="Claims you've made for found items will appear here."
                        color="blue"
                        icon={<ClaimIcon />}
                        fullWidth
                      />
                    )}
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Enhanced Recommendations Sidebar */}
          <div>
            <section aria-labelledby="recommendations">
              <div className="mb-4">
                <h2 id="recommendations" className="text-xl font-semibold text-[var(--ink)] mb-1 flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  AI Recommendations
                </h2>
                <p className="text-sm text-[var(--ink-600)]">Smart matches powered by machine learning</p>
              </div>

              <div className="bg-white/80 backdrop-blur-sm border border-black/10 rounded-2xl shadow-sm overflow-hidden">
        {recsLoading ? (
                  <div className="p-6 text-center">
                    <div className="inline-flex items-center gap-3 text-sm text-[var(--ink-600)]">
                      <div className="size-5 rounded-full border-2 border-[color:var(--brand)] border-t-transparent animate-spin" />
                      Analyzing your items for smart matches...
                    </div>
                  </div>
                ) : recs.length > 0 ? (
                  <div className="divide-y divide-black/5">
          <div className="p-4 bg-gradient-to-r from-[color:var(--brand)]/5 to-[color:var(--accent)]/5">
                      <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--brand)]">
                        <span className="size-2 rounded-full bg-[color:var(--accent)] animate-pulse" />
            {recs.length} potential match{recs.length !== 1 ? 'es' : ''} found
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {recs.map(rec => (
                        <RecommendationItem 
                          key={rec.id} 
                          item={rec} 
                          busy={matchActionBusy === rec.foundItemId}
                          onConfirm={async () => {
                            try {
                              setMatchActionBusy(rec.foundItemId)
                const saved = await upsertMatch(rec.lostItemId, rec.foundItemId, Math.round(rec.score * 100))
                              await confirmMatch(saved.id)
                              setRecs(prev => prev.filter(r => r.foundItemId !== rec.foundItemId))
                            } catch (e) {
                              alert((e as Error).message || 'Failed to confirm match')
                            } finally {
                              setMatchActionBusy(null)
                            }
                          }}
                          onDismiss={async () => {
                            try {
                              setMatchActionBusy(rec.foundItemId)
                const saved = await upsertMatch(rec.lostItemId, rec.foundItemId, Math.round(rec.score * 100))
                              await dismissMatch(saved.id)
                              setRecs(prev => prev.filter(r => r.foundItemId !== rec.foundItemId))
                            } catch (e) {
                              alert((e as Error).message || 'Failed to dismiss match')
                            } finally {
                              setMatchActionBusy(null)
                            }
                          }}
                        />
                      ))}
                    </div>
                    <div className="p-4 bg-gray-50">
                      <Link
                        to="/search"
            className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--brand)] hover:text-[color:var(--brand-strong)] transition-colors group"
                      >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle cx="11" cy="11" r="7"/>
                          <path d="m21 21-4.3-4.3"/>
                        </svg>
                        Explore Advanced Search
                        <svg className="size-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={<RecommendationIcon />}
                    title="No matches yet"
          description="Our System will automatically suggest potential matches when you report lost items. The more details you provide, the better our recommendations become."
                    action={
                      <Link 
                        to="/report/lost" 
            className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--brand)] hover:text-[color:var(--brand-strong)] transition-colors"
                      >
                        <span className="text-lg">📱</span>
                        Report your first lost item
                      </Link>
                    }
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

// Enhanced Component Definitions

function StatCard({ 
  title, 
  value, 
  icon, 
  color, 
  trend, 
  description 
}: { 
  title: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'amber' | 'emerald' | 'purple'
  trend: string
  description: string 
}) {
  const colorMap = {
    blue: {
      bg: 'from-[color:var(--brand)]/10 via-[color:var(--brand)]/5 to-transparent',
      text: 'text-[color:var(--brand)]',
      ring: 'ring-[color:var(--brand)]/20',
      iconBg: 'bg-[color:var(--brand)]/10',
      iconText: 'text-[color:var(--brand)]'
    },
    amber: {
      bg: 'from-[color:var(--support)]/10 via-[color:var(--support)]/5 to-transparent',
      text: 'text-[color:var(--support)]',
      ring: 'ring-[color:var(--support)]/20',
      iconBg: 'bg-[color:var(--support)]/10',
      iconText: 'text-[color:var(--support)]'
    },
    emerald: {
      bg: 'from-[color:var(--accent)]/10 via-[color:var(--accent)]/5 to-transparent',
      text: 'text-[color:var(--accent)]',
      ring: 'ring-[color:var(--accent)]/20',
      iconBg: 'bg-[color:var(--accent)]/10',
      iconText: 'text-[color:var(--accent)]'
    },
    purple: {
      bg: 'from-[color:var(--support)]/10 via-[color:var(--support)]/5 to-transparent',
      text: 'text-[color:var(--support)]',
      ring: 'ring-[color:var(--support)]/20',
      iconBg: 'bg-[color:var(--support)]/10',
      iconText: 'text-[color:var(--support)]'
    }
  }

  const colors = colorMap[color]

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br ${colors.bg} bg-white/80 backdrop-blur-sm p-5 shadow-sm hover:shadow-lg hover:border-white/50 transition-all duration-300 transform hover:scale-105`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`inline-flex items-center justify-center size-12 rounded-2xl ${colors.iconBg} ${colors.iconText} shadow-sm`}>
          {icon}
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold ${colors.text} mb-0.5`}>{value}</p>
          <p className="text-xs text-[var(--ink-600)] font-medium">{trend}</p>
        </div>
      </div>
      <div>
        <p className="font-semibold text-[var(--ink)] mb-1">{title}</p>
        <p className="text-sm text-[var(--ink-600)]">{description}</p>
      </div>
      <div className="absolute -bottom-2 -right-2 size-20 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors" />
    </div>
  )
}

function ActionCard({ 
  to, 
  title, 
  description, 
  color, 
  icon, 
  badge,
  priority
}: { 
  to: string
  title: string
  description: string
  color: 'red' | 'emerald' | 'blue'
  icon: React.ReactNode
  badge?: string
  priority: 'high' | 'medium' | 'low'
}) {
  const colorMap = {
    red: {
      bg: 'from-[color:var(--support)]/10 via-[color:var(--support)]/5 to-transparent',
      text: 'text-[color:var(--support)]',
      iconBg: 'bg-[color:var(--support)]/10',
      iconText: 'text-[color:var(--support)]',
      button: 'bg-[color:var(--support)] hover:bg-[color:var(--brand-strong)]',
      border: 'border-[color:var(--support)]/20 hover:border-[color:var(--support)]/30'
    },
    emerald: {
      bg: 'from-[color:var(--accent)]/10 via-[color:var(--accent)]/5 to-transparent',
      text: 'text-[color:var(--accent)]',
      iconBg: 'bg-[color:var(--accent)]/10',
      iconText: 'text-[color:var(--accent)]',
      button: 'bg-[color:var(--accent)] hover:bg-[color:var(--brand-strong)]',
      border: 'border-[color:var(--accent)]/20 hover:border-[color:var(--accent)]/30'
    },
    blue: {
      bg: 'from-[color:var(--brand)]/10 via-[color:var(--brand)]/5 to-transparent',
      text: 'text-[color:var(--brand)]',
      iconBg: 'bg-[color:var(--brand)]/10',
      iconText: 'text-[color:var(--brand)]',
      button: 'bg-[color:var(--brand)] hover:bg-[color:var(--brand-strong)]',
      border: 'border-[color:var(--brand)]/20 hover:border-[color:var(--brand)]/30'
    }
  }

  const colors = colorMap[color]
  const priorityRing = priority === 'high' ? 'ring-2 ring-[color:var(--support)]/20' : ''

  return (
    <NavLink 
      to={to} 
      className={`group relative overflow-hidden rounded-2xl border ${colors.border} bg-gradient-to-br ${colors.bg} bg-white/80 backdrop-blur-sm p-6 shadow-sm hover:shadow-lg transition-all duration-300 transform hover:scale-105 ${priorityRing}`}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`inline-flex items-center justify-center size-14 rounded-2xl ${colors.iconBg} ${colors.iconText} shadow-sm`}>
            {icon}
          </div>
          {badge && (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${colors.text} bg-white/90 shadow-sm border ${colors.border.split(' ')[0]}`}>
              {badge}
            </span>
          )}
        </div>
        <h3 className="font-bold text-[var(--ink)] text-lg mb-2 group-hover:text-[var(--ink)] transition-colors">
          {title}
        </h3>
        <p className="text-sm text-[var(--ink-600)] mb-4 leading-relaxed">
          {description}
        </p>
        <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white ${colors.button} shadow-md group-hover:shadow-lg transition-all duration-200 transform group-hover:scale-105`}>
          <span>Open</span>
          <svg className="size-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </div>
      </div>
      <div className="absolute -bottom-4 -right-4 size-32 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors" />
    </NavLink>
  )
}

function ActivityCard({ 
  title, 
  items, 
  emptyTitle, 
  emptyDescription, 
  color, 
  icon,
  fullWidth = false
}: { 
  title: string
  items: Activity[]
  emptyTitle: string
  emptyDescription: string
  color: 'red' | 'emerald' | 'blue'
  icon: React.ReactNode
  fullWidth?: boolean
}) {
  const colorMap = {
    red: {
      text: 'text-[color:var(--support)]',
      iconBg: 'bg-[color:var(--support)]/10',
      iconText: 'text-[color:var(--support)]'
    },
    emerald: {
      text: 'text-[color:var(--accent)]',
      iconBg: 'bg-[color:var(--accent)]/10',
      iconText: 'text-[color:var(--accent)]'
    },
    blue: {
      text: 'text-[color:var(--brand)]',
      iconBg: 'bg-[color:var(--brand)]/10',
      iconText: 'text-[color:var(--brand)]'
    }
  }

  const colors = colorMap[color]

  return (
    <div className={`bg-white/80 backdrop-blur-sm border border-black/10 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${fullWidth ? 'col-span-full' : ''}`}>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={`inline-flex items-center justify-center size-12 rounded-2xl ${colors.iconBg} ${colors.iconText} shadow-sm`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[var(--ink)] text-lg mb-1">{title}</h3>
            <p className="text-sm text-[var(--ink-600)]">
              {items.length} item{items.length !== 1 ? 's' : ''} 
              {items.length > 0 && (
                <span className="ml-2">
                  • {items.filter(i => String(i.status).toLowerCase() === 'pending').length} pending
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto">
          {items.length > 0 ? items.slice(0, 5).map(item => (
            <ActivityItem key={item.id} item={item} />
          )) : (
            <EmptyState 
              title={emptyTitle}
              description={emptyDescription}
              compact
            />
          )}
          {items.length > 5 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm text-[var(--ink-600)] text-center">
                And {items.length - 5} more item{items.length - 5 !== 1 ? 's' : ''}...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityItem({ item }: { item: Activity }) {
  const statusColors = {
    pending: 'bg-[color:var(--support)]/10 text-[color:var(--support)] border-[color:var(--support)]/20',
    matched: 'bg-[color:var(--brand)]/10 text-[color:var(--brand)] border-[color:var(--brand)]/20',
    resolved: 'bg-[color:var(--accent)]/10 text-[color:var(--accent)] border-[color:var(--accent)]/20'
  }

  const typeIcons = {
    lost: '🔍',
    found: '📦',
    claim: '✋'
  }

  return (
  <div className="group flex items-center gap-4 p-4 rounded-xl bg-white/60 border border-gray-100 hover:bg-white hover:border-black/10 hover:shadow-sm transition-all duration-200">
      <div className="shrink-0">
        {item.photoThumbUrl ? (
          <img 
            src={item.photoThumbUrl} 
            alt="Item thumbnail" 
            className="size-12 rounded-xl object-cover ring-2 ring-gray-100 group-hover:ring-gray-200 transition-all" 
          />
        ) : (
          <div className="size-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl group-hover:bg-gray-200 transition-colors">
            {typeIcons[item.type as keyof typeof typeIcons] || '📄'}
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
    <p className="font-semibold text-[var(--ink)] truncate group-hover:text-[color:var(--brand)] transition-colors" title={item.title}>
          {item.title}
        </p>
    <div className="flex items-center gap-2 mt-1 text-xs text-[var(--ink-600)]">
          {item.type && (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/5 text-[var(--ink)] font-medium">
              {typeIcons[item.type as keyof typeof typeIcons]}
              {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
            </span>
          )}
          {item.location && (
            <span className="flex items-center gap-1">
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m18 6-12 12"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {item.location}
            </span>
          )}
          {item.date && (
            <span className="flex items-center gap-1">
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
              {new Date(item.date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      
      {item.status && (
        <div className="shrink-0">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${statusColors[(String(item.status).toLowerCase() as 'pending'|'matched'|'resolved') in statusColors ? String(item.status).toLowerCase() as 'pending'|'matched'|'resolved' : 'pending']}`}>
            {String(item.status).charAt(0).toUpperCase() + String(item.status).slice(1)}
          </span>
        </div>
      )}
    </div>
  )
}

function RecommendationItem({ 
  item, 
  busy, 
  onConfirm, 
  onDismiss 
}: { 
  item: Recommendation
  busy?: boolean
  onConfirm?: () => Promise<void> | void
  onDismiss?: () => Promise<void> | void 
}) {
  const pct = Math.round(item.score * 100)
  
  return (
    <div className="group relative overflow-hidden rounded-xl border border-black/10 bg-white p-4 hover:border-[color:var(--brand)]/40 hover:shadow-md transition-all duration-200">
      <div className="flex items-start gap-3">
          <div className="shrink-0 size-12 rounded-xl bg-gradient-to-br from-[color:var(--brand)]/10 to-[color:var(--support)]/10 flex items-center justify-center shadow-sm">
          <div className="size-6 rounded-full bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] flex items-center justify-center text-white text-xs font-bold">
            {pct}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-[var(--ink)] truncate group-hover:text-[color:var(--brand)] transition-colors" title={item.title}>
              {item.title}
            </p>
            {item.candidateType && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/5 text-[var(--ink-700)]">
                {item.candidateType.charAt(0).toUpperCase() + item.candidateType.slice(1)}
              </span>
            )}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
              pct >= 95 ? 'bg-[color:var(--accent)]/10 text-[color:var(--accent)]' :
              pct >= 90 ? 'bg-[color:var(--brand)]/10 text-[color:var(--brand)]' :
              'bg-gray-100 text-gray-800'
            }`}>
              {pct}% match
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--ink-600)]">
            <span className="flex items-center gap-1">
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              AI Recommended
            </span>
            {item.location && (
              <span className="flex items-center gap-1 truncate max-w-[40%]">
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m18 6-12 12"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span className="truncate" title={item.location}>{item.location}</span>
              </span>
            )}
            {item.occurredOn && (
              <span className="flex items-center gap-1">
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12,6 12,12 16,14"/>
                </svg>
                {new Date(item.occurredOn).toLocaleDateString()}
              </span>
            )}
          </div>
          {/* Visual match strength bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${pct >= 90 ? 'bg-[color:var(--accent)]' : pct >= 75 ? 'bg-[color:var(--brand)]' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-4">
        <button 
          disabled={!!busy} 
          onClick={onConfirm} 
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            busy 
              ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
              : 'bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-strong)] shadow-md hover:shadow-lg transform hover:scale-105'
          } transition-all duration-200`}
        >
          {busy ? (
            <div className="size-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
          ) : (
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          )}
          Confirm Match
        </button>
        <button 
          disabled={!!busy} 
          onClick={onDismiss} 
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            busy 
              ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 transform hover:scale-105'
          } transition-all duration-200`}
        >
          {busy ? (
            <div className="size-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
          ) : (
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m18 6-12 12"/>
              <path d="m6 6 12 12"/>
            </svg>
          )}
          Not Mine
        </button>
      </div>
      
      <div className="absolute -top-2 -right-2 size-16 bg-gradient-to-br from-[color:var(--brand)]/5 to-[color:var(--support)]/5 rounded-full blur-xl" />
    </div>
  )
}

function EmptyState({ 
  icon, 
  title, 
  description, 
  action, 
  compact = false 
}: { 
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  compact?: boolean 
}) {
  if (compact) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gray-100 text-gray-400 mb-4">
          {icon || <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>}
        </div>
        <p className="font-semibold text-gray-600 mb-2">{title}</p>
        <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto leading-relaxed">{description}</p>
        {action && <div>{action}</div>}
      </div>
    )
  }

  return (
    <div className="text-center py-12">
      {icon && (
        <div className="inline-flex items-center justify-center size-20 rounded-2xl bg-gray-100 text-gray-400 mb-6">
          {icon}
        </div>
      )}
      <p className="text-lg font-semibold text-gray-600 mb-3">{title}</p>
      <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  )
}

// Enhanced Icon Components with better visual consistency
function ReportsIcon() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10,9 9,9 8,9"/>
    </svg>
  )
}

function ActiveIcon() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </svg>
  )
}

function MatchIcon() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <polyline points="16,11 18,13 22,9"/>
    </svg>
  )
}

function SuccessIcon() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22,4 12,14.01 9,11.01"/>
    </svg>
  )
}

function LostIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7"/>
      <path d="m21 21-4.3-4.3"/>
      <path d="M11 8v3l2 2"/>
    </svg>
  )
}

function FoundIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22,4 12,14.01 9,11.01"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7"/>
      <path d="m21 21-4.3-4.3"/>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}

function ClaimIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/>
      <line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  )
}

function RecommendationIcon() {
  return (
    <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}