import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClaim, type ClaimDto } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'

export default function ClaimStatusPage() {
  const { claimId } = useParams<{ claimId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [claim, setClaim] = useState<ClaimDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let active = true
    async function run() {
      if (!claimId) return
      setLoading(true); setError(null)
      try {
        const c = await getClaim(Number(claimId))
        if (!active) return
        if (!c) { setError('Claim not found'); setClaim(null) }
        else setClaim(c)
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Failed to load claim')
      } finally { if (active) setLoading(false) }
    }
    run()
    return () => { active = false }
  }, [claimId, refreshTick])

  const uiStatus = useMemo<'pending' | 'approved' | 'rejected' | 'returned'>(() => {
    if (!claim) return 'pending'
    const s = claim.status.toLowerCase()
    if (s === 'rejected') return 'rejected'
    if (claim.item && (claim.item.status === 'closed' || claim.item.status === 'returned')) return 'returned'
    if (s === 'approved') return 'approved'
    return 'pending'
  }, [claim])

  const steps = useMemo(() => [
    { key: 'pending', label: 'Requested' },
    { key: 'approved', label: 'Approved' },
    { key: 'returned', label: 'Returned' },
  ] as const, [])

  const index = steps.findIndex(s => s.key === uiStatus)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900">
      <div className="sticky top-0 z-40 backdrop-blur-md bg-white/80 border-b border-black/5">
        <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent)] bg-clip-text text-transparent">Claim Status</h1>
            <p className="text-slate-600 text-sm mt-1">Real-time progress for your claim.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRefreshTick(t => t + 1)} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-white border border-[color:var(--brand)]/30 text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5 font-medium shadow-sm">
              <svg className="size-4" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
              Refresh
            </button>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-white border border-black/10 text-slate-700 hover:bg-black/5 font-medium shadow-sm">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              Back
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-10">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-center mb-6">{error}</div>
        )}
        {loading ? <Skeleton /> : !claim ? <EmptyState /> : (
          <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="relative w-full max-w-sm aspect-video rounded-2xl overflow-hidden bg-gray-100 ring-1 ring-black/10">
                {claim.item?.photoUrl ? (
                  <img src={claim.item.photoUrl} className="size-full object-cover" alt={claim.item.title || ''} />
                ) : (
                  <div className="w-full h-full grid place-items-center text-gray-300">
                    <svg className="size-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11.5" r="2.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${badge(uiStatus)}`}>{capitalize(uiStatus)}</span>
                  {claim.item?.status && (<span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-black/40 text-white backdrop-blur-sm">Item: {capitalize(claim.item.status)}</span>)}
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">{claim.item?.title || `Claim #${claim.id}`}</h2>
                  <p className="text-sm text-slate-600">Claim ID #{claim.id} • Item #{claim.itemId}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Info label="Requested" value={formatDateTime(claim.createdAt)} />
                  <Info label="Approved" value={formatDateTime(claim.approvedAt) || '—'} />
                  <Info label="Match Score" value={typeof claim.matchScore === 'number' ? Math.round(claim.matchScore) + '%' : '—'} />
                  <Info label="Item Status" value={capitalize(claim.item?.status || '—')} />
                </div>
                <Progress steps={steps} currentIndex={index < 0 ? 0 : index} finalStatus={uiStatus} />
              </div>
            </header>

            {(claim.notes || claim.adminNote) && (
              <section className="grid md:grid-cols-2 gap-6">
                {claim.notes && (
                  <Note title="Your Notes" body={claim.notes} accent="brand" />
                )}
                {claim.adminNote && (
                  <Note title="Admin Note" body={claim.adminNote} accent={uiStatus === 'rejected' ? 'danger' : 'accent'} />
                )}
              </section>
            )}

            {uiStatus === 'pending' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm flex items-start gap-3">
                <svg className="size-4 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l2.5 2.5"/></svg>
                Your claim is awaiting review by the Lost & Found team.
              </div>
            )}
            {uiStatus === 'approved' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm flex items-start gap-3">
                <svg className="size-4 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
                Approved! Please proceed to pick up the item. Bring a valid ID for verification.
              </div>
            )}
            {uiStatus === 'rejected' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm flex items-start gap-3">
                <svg className="size-4 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01"/><path d="M2.5 19h19L12 3 2.5 19Z"/></svg>
                Unfortunately this claim was rejected{claim.adminNote ? ': ' + claim.adminNote : '.'}
              </div>
            )}
            {uiStatus === 'returned' && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-700 text-sm flex items-start gap-3">
                <svg className="size-4 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
                Item returned and process complete. Thank you!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Progress({ steps, currentIndex, finalStatus }: { steps: readonly { key: string; label: string }[]; currentIndex: number; finalStatus: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-medium text-slate-600">
        {steps.map((s,i) => (
          <span key={s.key} className={`flex-1 text-center ${i===0?'text-left':''} ${i===steps.length-1?'text-right':''}`}>{s.label}</span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {steps.map((s,i) => {
          const active = i === currentIndex
          const done = i < currentIndex || finalStatus === 'returned' || (finalStatus === 'approved' && s.key === 'approved')
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none last:w-5">
              <div className={`size-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow transition-all ${done || active ? 'bg-[color:var(--brand)] text-white' : 'bg-slate-200 text-slate-500'} ${active && !done ? 'ring-4 ring-[color:var(--brand)]/30' : ''}`}>{i+1}</div>
              {i < steps.length -1 && <div className={`h-1 flex-1 rounded-full mx-1 ${i < currentIndex ? 'bg-[color:var(--brand)]' : 'bg-slate-200'}`}></div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/80 backdrop-blur-sm px-3 py-2 shadow-sm">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
        <div className="text-sm font-semibold text-slate-800 truncate" title={value}>{value || '—'}</div>
      </div>
    </div>
  )
}

function Note({ title, body, accent }: { title: string; body: string; accent: 'brand' | 'accent' | 'danger' }) {
  const cls = accent === 'brand' ? 'from-[color:var(--brand)]/10 via-[color:var(--brand)]/5' : accent === 'accent' ? 'from-[color:var(--accent)]/10 via-[color:var(--accent)]/5' : 'from-rose-300/20 via-rose-300/10'
  return (
    <div className={`rounded-xl border border-black/10 bg-gradient-to-br ${cls} to-transparent p-4 space-y-1`}>      
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-64 w-full rounded-2xl bg-gradient-to-br from-gray-200 to-gray-300" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_,i) => <div key={i} className="h-16 rounded-xl bg-gray-200" />)}
      </div>
      <div className="h-24 rounded-xl bg-gray-200" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-24 bg-white/70 backdrop-blur-sm rounded-2xl border border-black/10">
      <div className="inline-flex items-center justify-center size-20 rounded-2xl bg-[color:var(--brand)]/10 text-[color:var(--brand)] mb-6">
        <svg className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Claim Not Found</h2>
      <p className="text-slate-600 max-w-md mx-auto text-sm leading-relaxed">We couldn\'t locate that claim. It may have been deleted or the ID is incorrect.</p>
    </div>
  )
}

function badge(ui: string) {
  switch (ui) {
    case 'pending': return 'bg-amber-100 text-amber-700'
    case 'approved': return 'bg-emerald-100 text-emerald-700'
    case 'rejected': return 'bg-rose-100 text-rose-700'
    case 'returned': return 'bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
    default: return 'bg-slate-200 text-slate-700'
  }
}
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
function formatDateTime(iso?: string | null) { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString() }
