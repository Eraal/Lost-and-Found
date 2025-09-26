import { useEffect, useMemo, useState } from 'react'
import { listSocialPosts, retrySocialPost, type SocialPostDto } from '../../../lib/api'

type Tab = '' | 'sent' | 'failed' | 'queued'

export default function AdminSocialPosts() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<SocialPostDto[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('')
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const p = await listSocialPosts(limit)
        if (!cancelled) setPosts(p)
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Failed to load posts')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [limit])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return posts.filter(p => {
      const statusOk = tab ? String(p.status).toLowerCase() === tab : true
      if (!statusOk) return false
      if (!term) return true
      const hay = [p.message, p.item?.title, p.item?.id?.toString()].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(term)
    })
  }, [posts, q, tab])

  async function retry(id: number) {
    try {
      setBusyId(id)
      const next = await retrySocialPost(id)
      setPosts(prev => prev.map(p => p.id === id ? next : p))
    } catch (e) {
      alert((e as Error)?.message || 'Retry failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Social Posts</h1>
              <p className="text-gray-600 mt-1">Facebook post history • {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm p-1 shadow-lg">
              {(['','sent','failed','queued'] as const).map(v => (
                <button
                  key={v || 'all'}
                  onClick={() => setTab(v)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    tab === v
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg transform scale-105'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  aria-pressed={tab === v}
                >
                  {v ? v[0].toUpperCase()+v.slice(1) : 'All'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by message or item…" className="w-64 rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-blue-300 outline-none" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><SearchIcon /></span>
              </div>
              <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm">
                {[25,50,100,150,200].map(n => <option key={n} value={n}>Show {n}</option>)}
              </select>
              <button onClick={() => setLimit(l => l)} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50">
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4h14v2H3zM3 9h14v2H3zM3 14h14v2H3z"/></svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Facebook Posts</h2>
                <p className="text-sm text-gray-600">{loading ? 'Loading…' : `${filtered.length} post${filtered.length !== 1 ? 's' : ''}`}</p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="p-6"><div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-6 text-center text-red-700 text-sm">{error}</div></div>
          ) : loading ? (
            <div className="p-6"><PostSkeleton rows={8} /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-600">No posts found.</div>
          ) : (
            <div className="p-6 space-y-4">
              {filtered.map((p, idx) => (
                <PostRow key={p.id} post={p} latest={idx === 0} busy={busyId === p.id} onRetry={retry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function PostRow({ post, latest, busy, onRetry }: { post: SocialPostDto; latest?: boolean; busy?: boolean; onRetry: (id: number) => void }) {
  const s = String(post.status || 'queued').toLowerCase()
  const chipCls = s === 'sent' ? 'bg-green-100 text-green-800 border-green-200' : s === 'failed' ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-amber-100 text-amber-800 border-amber-200'
  const chip = (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${chipCls}`}>
      <span className={`w-2 h-2 rounded-full ${s === 'sent' ? 'bg-green-500' : s === 'failed' ? 'bg-rose-500' : 'bg-amber-500'}`} />
      {s.charAt(0).toUpperCase()+s.slice(1)}
    </span>
  )
  return (
    <div className={`relative rounded-2xl border-2 p-5 transition-all duration-300 ${
      s === 'sent' ? 'border-green-200 bg-green-50/30' : s === 'failed' ? 'border-rose-200 bg-rose-50/30' : 'border-gray-200 bg-white'
    } ${latest ? 'ring-2 ring-blue-500/10' : ''}`}>
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {post.item?.photoUrl ? (
            <img src={post.item.photoUrl} alt="Item" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-gray-200 shadow-sm" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 grid place-items-center text-gray-400">📣</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-bold text-gray-900 truncate" title={post.item?.title || `Post #${post.id}`}>{post.item?.title || `Post #${post.id}`}</div>
            {chip}
            {latest && <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[11px] rounded-full font-semibold">Latest</span>}
          </div>
          <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap bg-white/70 rounded-lg p-3 border border-gray-200">
            {post.message || '—'}
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 font-medium"><PlatformIcon /> Facebook</span>
            {post.item?.id && <span className="inline-flex items-center gap-1 font-medium"><HashIcon /> Item #{post.item.id}</span>}
            {post.createdAt && <span className="inline-flex items-center gap-1 font-medium"><ClockIcon /> {new Date(post.createdAt).toLocaleString()}</span>}
            {post.postedAt && <span className="inline-flex items-center gap-1 font-medium"><CalendarIcon /> {new Date(post.postedAt).toLocaleString()}</span>}
          </div>
        </div>
        <div className="shrink-0 inline-flex items-center gap-2">
          {s !== 'sent' && (
            <button disabled={busy} onClick={() => onRetry(post.id)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${busy ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'}`}>
              <RetryIcon /> Retry
            </button>
          )}
          {post.linkUrl && (
            <a href={post.linkUrl} target="_blank" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300">
              <ExternalIcon /> View Link
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function PostSkeleton({ rows = 6 }: { rows?: number }) {
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

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" />
    </svg>
  )
}
function PlatformIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 10h10M5 14h14M4 18h16" />
    </svg>
  )
}
function HashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M10 3L8 21M16 3l-2 18M4 8h16M3 16h16" />
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
function RetryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M20 4L4 20"/>
    </svg>
  )
}
function ExternalIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M10 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>
    </svg>
  )
}
