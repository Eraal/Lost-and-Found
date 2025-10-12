import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecentItems, getMonthlyStats } from '../../lib/api'
import landingImg from '../../assets/landingpageImage.png'

type ItemCard = {
  id: string | number
  name: string
  type?: string
  location?: string
  date?: string
  imageUrl?: string
  // Optional; backend may add this later. We'll default to 'unclaimed' when absent.
  status?: 'unclaimed' | 'claimed' | 'matched' | string
  description?: string
}

export default function LandingPage() {
  const [items, setItems] = useState<ItemCard[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{ recoveredThisMonth: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Browse UI state
  const [q, setQ] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [hasPhotoOnly, setHasPhotoOnly] = useState(false)
  const [sort, setSort] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest')
  const [visible, setVisible] = useState(12)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const [recent, s] = await Promise.all([
          // Fetch a larger batch so filtering feels useful on the landing page
          getRecentItems(48).catch(() => []),
          getMonthlyStats().catch(() => ({ recoveredThisMonth: 0 })),
        ])
        if (!cancelled) {
          setItems(recent)
          setStats(s)
        }
  } catch {
        if (!cancelled) setError('Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Only show 'Found' reports on landing; derive facets from this subset
  const foundOnly = useMemo(() => items.filter(i => (i.type ?? '').toLowerCase() === 'found'), [items])
  // Distinct facets (derived from found-only items)
  const locations = useMemo(
    () => Array.from(new Set(foundOnly.map(i => i.location).filter((x): x is string => Boolean(x)))).sort(),
    [foundOnly]
  )

  // Filter + sort
  const filtered = useMemo(() => {
    const qlc = q.trim().toLowerCase()
    const matchQ = (it: ItemCard) =>
      !qlc ||
      it.name.toLowerCase().includes(qlc) ||
      (it.type?.toLowerCase().includes(qlc) ?? false) ||
      (it.location?.toLowerCase().includes(qlc) ?? false)

    const passLoc = (it: ItemCard) => locationFilter === 'all' || (it.location ?? '').toLowerCase() === locationFilter
    const passPhoto = (it: ItemCard) => !hasPhotoOnly || Boolean(it.imageUrl)

    const byDate = (a?: string, b?: string) => {
      const da = a ? Date.parse(a) : 0
      const db = b ? Date.parse(b) : 0
      return db - da
    }

  // Apply filters on found-only items
  let out = foundOnly.filter(it => matchQ(it) && passLoc(it) && passPhoto(it))
    switch (sort) {
      case 'newest':
        out = out.sort((a, b) => byDate(a.date, b.date))
        break
      case 'oldest':
        out = out.sort((a, b) => -byDate(a.date, b.date))
        break
      case 'az':
        out = out.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'za':
        out = out.sort((a, b) => b.name.localeCompare(a.name))
        break
    }
    return out
  }, [foundOnly, q, locationFilter, hasPhotoOnly, sort])

  const toShow = useMemo(() => filtered.slice(0, visible), [filtered, visible])

  return (
  <div className="font-sans bg-academic text-[var(--ink)]" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[color:var(--surface)] to-transparent" />
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,_white_20%,_transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--brand)]/20 bg-white/80 px-3 py-1 text-xs text-[color:var(--brand-strong)] shadow-sm backdrop-blur">
              <span className="size-2 rounded-full bg-[color:var(--accent)]" /> CCS Department
            </span>
            <h1 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight">
              Lost & Found
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-[var(--ink-600)]">
              An academic, student-first hub to report, find, and recover items across the College of Computer Studies.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/report/lost" className="inline-flex items-center justify-center rounded-md bg-[color:var(--brand)] px-5 py-2.5 text-white font-semibold shadow-sm hover:bg-[color:var(--brand-strong)] transition-colors">
                Report Lost Item
              </Link>
              <Link to="/search" className="inline-flex items-center justify-center rounded-md border border-[color:var(--brand)]/20 bg-white/90 px-5 py-2.5 text-[var(--ink)] font-semibold hover:bg-[color:var(--brand)]/10 transition-colors backdrop-blur">
                Search Found Items
              </Link>
            </div>
            {stats && (
              <p className="mt-4 text-sm text-[var(--ink-600)]">
                <span className="font-semibold text-[color:var(--brand-strong)]">{stats.recoveredThisMonth}</span> items recovered this month
              </p>
            )}
          </div>
          <div className="relative">
            <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 shadow-xl ring-1 ring-black/5 animate-floaty">
              <img src={landingImg} alt="CCS Lost & Found" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-4 -left-4 hidden md:block rounded-xl bg-white/90 px-4 py-3 shadow ring-1 ring-black/5 animate-fade-up backdrop-blur" style={{animationDelay: '100ms'}}>
              <p className="text-sm text-[var(--ink-600)]"><span className="font-semibold text-[color:var(--brand)]">Secure claims</span> with staff verification</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid md:grid-cols-3 gap-5">
          <ActionCard
            title="Report Lost"
            to="/report/lost"
            desc="Create a report in under a minute with details and a photo."
            icon={
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
            }
          />
          <ActionCard
            title="Search Items"
            to="/search"
            desc="Filter by type, location, date, and keywords."
            icon={
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4Zm8.32 13.91-3.86-3.86" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            }
          />
          <ActionCard
            title="Track Claims"
            to="/login"
            desc="View your reports, matches, and claim status in your dashboard."
            icon={
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z"/></svg>
            }
          />
        </div>
      </section>

      {/* Browse items */}
      <section className="bg-gradient-to-b from-[color:var(--surface)] to-[color:var(--brand)]/5">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-2xl font-bold text-[var(--ink)]">Browse Unclaimed Items</h2>
            <Link to="/search" className="text-sm text-[color:var(--brand)] hover:underline">Open advanced search</Link>
          </div>
          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}

          {/* Filters */}
          <div className="rounded-xl border border-[color:var(--brand)]/10 bg-white/90 backdrop-blur p-3 md:p-4 shadow-sm">
    <div className="grid gap-2 md:grid-cols-12">
      <div className="md:col-span-6">
                <label className="block text-xs text-[var(--ink-600)] mb-1">Search</label>
                <div className="relative">
                  <input
                    value={q}
        onChange={e => { setQ(e.target.value); setVisible(12) }}
                    placeholder="Keywords (e.g., wallet, library)"
                    className="w-full rounded-md border border-black/10 bg-white px-9 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
                  />
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-[var(--ink-600)]" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4Zm8.32 13.91-3.86-3.86" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
              </div>
      <div className="md:col-span-3">
                <label className="block text-xs text-[var(--ink-600)] mb-1">Location</label>
                <select
                  value={locationFilter}
                  onChange={e => { setLocationFilter(e.target.value.toLowerCase()); setVisible(12) }}
                  className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
                >
                  <option value="all">All</option>
                  {locations.map(l => <option key={l} value={l.toLowerCase()}>{l}</option>)}
                </select>
              </div>
      <div className="md:col-span-3">
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
      <div className="md:col-span-12 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-700)]">
                  <input type="checkbox" checked={hasPhotoOnly} onChange={e => { setHasPhotoOnly(e.target.checked); setVisible(12) }} className="size-4 rounded border-black/20" />
                  Has photo
                </label>
              </div>
            </div>
          </div>

          {/* Results */}
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
                const friendlyDate = it.date ? new Date(it.date).toLocaleDateString() : undefined
                const status = (it.status ?? 'unclaimed').toLowerCase()
                const rawType = (it.type ?? '').toLowerCase()
                const isLost = rawType === 'lost'
                const isFound = rawType === 'found'
                const statusTheme = status === 'claimed'
                  ? 'bg-emerald-600/90'
                  : status === 'matched'
                  ? 'bg-amber-600/90'
                  : 'bg-[color:var(--accent)]/90'

                const statusLabel = status === 'claimed' ? 'Claimed' : status === 'matched' ? 'Matched' : (isLost ? 'Missing' : 'Unclaimed')

                const Inner = (
                  <div
                    className={`group rounded-2xl bg-white/95 backdrop-blur overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300 animate-fade-up`}
                    style={{animationDelay: `${idx * 30}ms`}}
                  >
                    <div className="relative aspect-video bg-gray-50 overflow-hidden">
                      {it.imageUrl ? (
                        <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[color:var(--brand)]/30 bg-gradient-to-br from-gray-100 to-gray-200">
                          <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
                        </div>
                      )}
                      {/* Status chip (no Found/Lost indicator) */}
                      <div className="absolute top-3 left-3 inline-flex items-center gap-2">
                        <span className={`${statusTheme} rounded-full px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm`}>{statusLabel}</span>
                        {/* Keep category chip only if type is not the record type (lost/found) */}
                        {!!it.type && !(isLost || isFound) && (
                          <span className="shrink-0 rounded-full bg-white/95 text-[color:var(--brand-strong)] text-[10px] font-semibold px-3 py-1.5 border border-[color:var(--brand)]/20 backdrop-blur shadow-sm">{it.type}</span>
                        )}
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-bold text-[1.05rem] leading-tight line-clamp-1 group-hover:text-[color:var(--brand)] transition-colors">{it.name}</h3>
                          {it.description && (
                            <p className="mt-1 text-sm text-[var(--ink-600)] line-clamp-2">{it.description}</p>
                          )}
                        </div>
                        <Link
                          to={`/search?item=${encodeURIComponent(String(it.name))}`}
                          className="inline-flex items-center justify-center shrink-0 rounded-md border border-[color:var(--brand)]/20 text-[color:var(--brand-strong)] px-2.5 py-1 text-xs font-semibold hover:bg-[color:var(--brand)]/5 transition-colors"
                          title="Open in search"
                        >
                          View
                        </Link>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--ink-600)]">
                        <div className="inline-flex items-center gap-1.5 min-w-0">
                          <svg className="size-4 opacity-70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>
                          <span className="truncate" title={it.location || ''}>{it.location || 'Unknown location'}</span>
                        </div>
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <svg className="size-4 opacity-70" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6c0-1.1-.9-2-2-2Zm0 15H5V10h14v9Zm0-11H5V6h14v2Z"/></svg>
                          <span>{friendlyDate || '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )

                // Wrap with gradient border matching Browse Items page
                if (isLost) {
                  return (
                    <div key={it.id} className="rounded-2xl p-[2px] bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)]">
                      {Inner}
                    </div>
                  )
                }
                if (isFound) {
                  return (
                    <div key={it.id} className="rounded-2xl p-[2px] bg-gradient-to-r from-emerald-500 to-green-300">
                      {Inner}
                    </div>
                  )
                }
                // Unknown type: keep subtle bordered card
                return (
                  <div key={it.id} className="rounded-2xl border border-[color:var(--brand)]/10">{Inner}</div>
                )
              })
            )}
          </div>

          {/* Load more */}
          {filtered.length > toShow.length && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setVisible(v => v + 12)}
                className="inline-flex items-center justify-center rounded-md border border-[color:var(--brand)]/20 bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/10 shadow-sm"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
    <section className="mx-auto max-w-7xl px-4 py-12">
  <h2 className="text-2xl font-bold mb-6">How it works</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <Step n={1} title="Report or Find" desc="Submit a lost item report or browse found items." />
          <Step n={2} title="Smart Matching" desc="Our system suggests likely matches automatically." />
          <Step n={3} title="Secure Claim" desc="Request to claim and verify ownership with staff." />
          <Step n={4} title="Get Notified" desc="Receive updates and alerts when a match is found." />
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--brand-strong)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-white">
          <div className="animate-fade-up">
            <h3 className="text-xl md:text-2xl font-semibold">Ready to help or find your item?</h3>
            <p className="text-white/80">Join the CCS community in keeping items safe and returning them quickly.</p>
          </div>
          <div className="flex gap-3">
      <Link to="/report/lost" className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2.5 text-[color:var(--brand-strong)] font-semibold hover:bg-white/90 transition-colors">Report</Link>
      <Link to="/search" className="inline-flex items-center justify-center rounded-md border border-white/30 px-4 py-2.5 text-white font-semibold hover:bg-white/10 transition-colors">Search</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function ActionCard({ title, desc, to, icon }: { title: string; desc: string; to: string; icon?: React.ReactNode }) {
  return (
    <Link to={to} className="group rounded-2xl border border-[color:var(--brand)]/10 p-5 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 bg-white/95 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-lg bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/15">
          {icon}
        </span>
        <div>
          <div className="font-semibold">{title}</div>
          <p className="text-sm text-[var(--ink-600)] mt-1">{desc}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm text-[color:var(--accent)] group-hover:translate-x-0.5 transition-transform">Go <svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 10h8.586l-3.293 3.293 1.414 1.414L17.414 10l-5.707-5.707-1.414 1.414L13.586 8H5v2z"/></svg></span>
        </div>
      </div>
    </Link>
  )
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--brand)]/10 p-4 bg-white/95 backdrop-blur">
      <div className="size-8 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center font-bold">{n}</div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="text-sm text-[var(--ink-600)] mt-1">{desc}</p>
    </div>
  )
}
