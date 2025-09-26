import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { listClaims, updateClaimStatus, markClaimReturned, type ClaimDto, type ClaimItemLite, type ClaimUserLite } from '../../../lib/api'
import ClaimReviewModal from '../../../components/ClaimReviewModal'

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

export default function AdminClaims() {
  const location = useLocation()
  const navigate = useNavigate()

  const path = location.pathname.toLowerCase()
  const routeFilter: Filter = path.endsWith('/pending')
    ? 'pending'
    : path.endsWith('/approved')
    ? 'approved'
    : path.endsWith('/rejected')
    ? 'rejected'
    : 'all'

  const [filter, setFilter] = useState<Filter>(routeFilter)
  const [claims, setClaims] = useState<ClaimDto[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewClaim, setReviewClaim] = useState<ClaimDto | null>(null)

  useEffect(() => {
    setFilter(routeFilter)
  }, [routeFilter])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await listClaims({ status: filter === 'all' ? undefined : filter, limit: 200 })
        if (!cancelled) setClaims(res)
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Failed to load claims')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [filter])

  const filtered = useMemo(() => {
    if (filter === 'all') return claims
    return claims.filter(c => (c.status === 'requested' ? 'pending' : c.status) === filter)
  }, [claims, filter])

  const setRouteFilter = (f: Filter) => {
    setFilter(f)
    if (f === 'all') navigate('/admin/claims', { replace: true })
    else navigate(`/admin/claims/${f}`, { replace: true })
  }

  const handleUpdate = async (id: number, status: 'pending' | 'approved' | 'rejected', adminNotes?: string) => {
    try {
      setBusyId(id)
      const updated = await updateClaimStatus(id, status, undefined, adminNotes)
      setClaims(prev => prev.map(c => (c.id === id ? { ...c, ...updated } : c)))
    } catch (e) {
      alert((e as Error).message || 'Failed to update claim')
    } finally {
      setBusyId(null)
    }
  }

  const handleReturned = async (id: number) => {
    try {
      setBusyId(id)
      const updated = await markClaimReturned(id)
      setClaims(prev => prev.map(c => (c.id === id ? { ...c, ...updated } : c)))
    } catch (e) {
      alert((e as Error).message || 'Failed to mark returned')
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
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-1.381z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Claims Management
              </h1>
              <p className="text-gray-600 mt-1">Review and approve student item claim requests • {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          
          {/* Filter Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              Admin Dashboard
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm p-1 shadow-lg">
              {(['all','pending','approved','rejected'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setRouteFilter(v)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    filter === v 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg transform scale-105' 
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  aria-pressed={filter === v}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                  {v === 'pending' && filtered.filter(c => c.status === 'requested').length > 0 && (
                    <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {filtered.filter(c => c.status === 'requested').length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Claims List Section */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-1.381z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {filter === 'all' ? 'All Claims' : 
                     filter === 'pending' ? 'Pending Review' :
                     filter === 'approved' ? 'Approved Claims' :
                     'Rejected Claims'}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {loading ? 'Loading claims...' : 
                     `${filtered.length} claim${filtered.length !== 1 ? 's' : ''} ${filter === 'all' ? 'in total' : `marked as ${filter}`}`}
                  </p>
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-600">{claims.filter(c => c.status === 'requested').length}</div>
                  <div className="text-xs text-gray-500">Pending</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{claims.filter(c => c.status === 'approved').length}</div>
                  <div className="text-xs text-gray-500">Approved</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{claims.filter(c => c.status === 'rejected').length}</div>
                  <div className="text-xs text-gray-500">Rejected</div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6">
            {error ? (
              <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Claims</h3>
                <p className="text-red-700">{error}</p>
              </div>
            ) : loading ? (
              <ClaimSkeleton />
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-1.381z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {filter === 'all' ? 'No Claims Found' :
                   filter === 'pending' ? 'No Pending Claims' :
                   filter === 'approved' ? 'No Approved Claims' :
                   'No Rejected Claims'}
                </h3>
                <p className="text-gray-600">
                  {filter === 'pending' ? 'All caught up! No claims awaiting your review.' :
                   filter === 'all' ? 'No students have submitted any claims yet.' :
                   `No claims have been ${filter} at this time.`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map(c => (
                  <ClaimRow
                    key={c.id}
                    claim={c}
                    onUpdate={handleUpdate}
                    onReturned={handleReturned}
                    busy={busyId === c.id}
                    onOpen={() => { setReviewClaim(c); setReviewOpen(true) }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <ClaimReviewModal
          claim={reviewClaim}
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          busy={busyId === (reviewClaim?.id ?? -1)}
          onAction={async (status, adminNotes) => {
            if (!reviewClaim) return
            await handleUpdate(reviewClaim.id, status, adminNotes)
            setReviewOpen(false)
          }}
          onMarkReturned={async () => {
            if (!reviewClaim) return
            await handleReturned(reviewClaim.id)
            setReviewOpen(false)
          }}
        />
      </div>
    </div>
  )
}

function ClaimRow({ claim, onUpdate, onReturned, busy, onOpen }: { claim: ClaimDto; onUpdate: (id: number, status: 'pending'|'approved'|'rejected', adminNotes?: string) => void; onReturned: (id: number) => void; busy?: boolean; onOpen: () => void }) {
  const s = (claim.status === 'requested' ? 'pending' : claim.status) as 'pending' | 'approved' | 'rejected' | 'verified' | 'cancelled'
  const item = claim.item as ClaimItemLite | undefined
  const user = claim.user as ClaimUserLite | undefined

  const statusConfig = {
    approved: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', icon: '✓' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', icon: '✗' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: '⏳' },
    verified: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', icon: '✓' },
    cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', icon: '✗' }
  }[s] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', icon: '?' }

  const priority = claim.matchScore && claim.matchScore >= 80 ? 'high' : claim.matchScore && claim.matchScore >= 60 ? 'medium' : 'normal'

  return (
    <div className={`relative rounded-2xl border-2 p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
      s === 'approved' ? 'border-green-200 bg-green-50/30' :
      s === 'rejected' ? 'border-red-200 bg-red-50/30' :
      s === 'pending' ? 'border-amber-200 bg-amber-50/30' :
      'border-gray-200 bg-white'
    } ${priority === 'high' ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}>
      
      {/* Priority Badge */}
      {priority === 'high' && (
        <div className="absolute -top-2 -right-2">
          <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-bold shadow-lg">
            HIGH MATCH
          </div>
        </div>
      )}

      <div className="flex items-center gap-6">
        {/* Item Image */}
        <div className="shrink-0">
          {item?.photoUrl ? (
            <img 
              src={item.photoUrl} 
              alt="Item" 
              className="w-20 h-20 rounded-2xl object-cover ring-2 ring-gray-200 shadow-lg" 
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* Claim Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <h3 
              className="text-lg font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors truncate" 
              onClick={onOpen}
              title={item?.title || `Claim #${claim.id}`}
            >
              {item?.title || `Claim #${claim.id}`}
            </h3>
            
            {/* Status Badge */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border-2 ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} shadow-sm`}>
              <span>{statusConfig.icon}</span>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>

            {/* Match Score */}
            {typeof claim.matchScore === 'number' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 12h4v8H3zM10 8h4v12h-4zM17 4h4v16h-4z"/>
                </svg>
                {Math.round(claim.matchScore)}% Match
              </div>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="p-1.5 rounded-lg bg-purple-100 text-purple-600">
                <TypeIcon />
              </div>
              <span className="font-medium">{item?.type ? item.type.charAt(0).toUpperCase()+item.type.slice(1) : '—'}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="p-1.5 rounded-lg bg-green-100 text-green-600">
                <MapPinIcon />
              </div>
              <span className="font-medium truncate">{item?.location || '—'}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                <UserIcon />
              </div>
              <span className="font-medium truncate">{user?.email || '—'}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600">
                <BadgeIcon />
              </div>
              <span className="font-medium">{user?.studentId || '—'}</span>
            </div>
          </div>

          {/* Additional Info */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            {claim.createdAt && (
              <div className="flex items-center gap-1">
                <ClockIcon />
                <span>Submitted {new Date(claim.createdAt).toLocaleString()}</span>
              </div>
            )}
            {claim.notes && (
              <div className="flex items-center gap-1" title={claim.notes}>
                <NoteIcon />
                <span>{claim.notes.length > 30 ? claim.notes.slice(0, 30) + '…' : claim.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="shrink-0 flex flex-col gap-2">
          {s !== 'rejected' && (
            <>
              <button
                disabled={busy}
                onClick={() => onUpdate(claim.id, 'approved')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  busy 
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                }`}
              >
                <CheckIcon />
                Approve
              </button>
              
              <button
                disabled={busy}
                onClick={() => onUpdate(claim.id, 'rejected')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  busy 
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                    : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                }`}
              >
                <XIcon />
                Reject
              </button>
            </>
          )}
          
          <button
            disabled={busy}
            onClick={onOpen}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              busy 
                ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                : 'border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 shadow-sm hover:shadow-md'
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            Review
          </button>

          {s === 'approved' && (
            <button
              disabled={busy}
              onClick={() => onReturned(claim.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                busy 
                  ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                  : 'bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
              }`}
              title="Mark as Returned"
            >
              <ReturnIcon />
              Returned
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ClaimSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-2xl border-2 border-gray-100 p-6 bg-white">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gray-200 animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-6 w-24 bg-gray-200 rounded-lg animate-pulse" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-gray-200 rounded-lg animate-pulse" />
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-40 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse" />
              <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse" />
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
function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/>
    </svg>
  )
}
function BadgeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h10M7 12h6"/>
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
function ReturnIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M3 12h13a5 5 0 1 1 0 10H7"/><polyline points="9,15 3,12 9,9"/>
    </svg>
  )
}
function NoteIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 3h12l4 4v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v4h4"/>
    </svg>
  )
}
