import { useEffect, useMemo, useState } from 'react'
import type { ClaimDto } from '../lib/api'
import { listClaims } from '../lib/api'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export default function ClaimReviewModal({
  claim,
  open,
  onClose,
  onAction,
  busy,
  onMarkReturned,
}: {
  claim: ClaimDto | null
  open: boolean
  onClose: () => void
  onAction: (status: ReviewStatus, adminNotes?: string) => Promise<void> | void
  busy?: boolean
  onMarkReturned?: () => Promise<void> | void
}) {
  const [relatedCount, setRelatedCount] = useState<number | null>(null)
  const [relLoading, setRelLoading] = useState(false)

  // Admin notes removed to simplify modal and reduce crowding

  const item = claim?.item
  const user = claim?.user
  const status = useMemo(() => (claim ? (claim.status === 'requested' ? 'pending' : claim.status) : 'pending'), [claim])
  const isReturned = !!claim?.returned
  const claimerName = claim?.returnClaimerName
  type FinderReporter = { id?: number; email?: string; firstName?: string; lastName?: string; studentId?: string }
  const finder: FinderReporter | undefined = (claim?.item && typeof (claim.item as Record<string, unknown>).reporter === 'object')
    ? ( (claim.item as Record<string, unknown>).reporter as FinderReporter )
    : undefined

  // Load other claims for the same item so admins see potential duplicates
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!open || !claim?.itemId) { setRelatedCount(null); return }
      try {
        setRelLoading(true)
        const rows = await listClaims({ itemId: claim.itemId, limit: 100 })
        if (!cancelled) setRelatedCount(rows.length)
      } catch {
        if (!cancelled) setRelatedCount(null)
      } finally {
        if (!cancelled) setRelLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [open, claim?.itemId])

  if (!open || !claim) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        {/* Enhanced Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-1.381z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold truncate" title={item?.title || `Item #${item?.id}`}>
                    {item?.title || `Item #${item?.id}`}
                  </h2>
                  <p className="text-blue-100 text-sm">
                    Claim Review • #{claim.id} • {claim.createdAt ? new Date(claim.createdAt).toLocaleString() : '—'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 flex-wrap">
                {isReturned ? (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border-2 shadow-sm bg-gradient-to-r from-sky-100 to-cyan-100 text-sky-800 border-sky-200">
                    <span>↩</span> Returned
                  </span>
                ) : (
                  <StatusBadge status={status as ReviewStatus} />
                )}
                {typeof claim?.matchScore === 'number' && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium px-3 py-1.5" title="Suggested match confidence">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12h4v8H3zM10 8h4v12h-4zM17 4h4v16h-4z"/>
                    </svg>
                    {Math.round(claim.matchScore!)}% Match Confidence
                  </span>
                )}
                {relatedCount != null && relatedCount > 1 && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 backdrop-blur-sm text-white text-sm font-medium px-3 py-1.5" title="Multiple claims for this item">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4h-3a4 4 0 0 0-4 4v2"/><circle cx="10.5" cy="7.5" r="3.5"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    {relatedCount} Total Claims
                  </span>
                )}
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-colors" 
              aria-label="Close"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m18 6-12 12"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Enhanced Body */}
        <div className="p-4 bg-gradient-to-br from-gray-50 to-white max-h-[calc(85vh-120px)] overflow-y-auto">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Left: Item Details & Claim Information */}
            <section className="xl:col-span-2 space-y-4">
              {/* Item Card */}
              <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M7.5 6v.75H5.513c-.96 0-1.764.724-1.865 1.679l-1.263 12A1.875 1.875 0 004.25 22.5h15.5a1.875 1.875 0 001.865-2.071l-1.263-12a1.875 1.875 0 00-1.865-1.679H16.5V6a4.5 4.5 0 10-9 0zM12 3a3 3 0 00-3 3v.75h6V6a3 3 0 00-3-3zm-3 8.25a3 3 0 106 0v-.75a.75.75 0 011.5 0v.75a4.5 4.5 0 11-9 0v-.75a.75.75 0 011.5 0v.75z" clipRule="evenodd" />
                    </svg>
                    Item Details
                  </h3>
                  <p className="text-purple-100 text-sm mt-1">Lost item information and photos</p>
                </div>
                
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Item Photo */}
                    <div className="relative">
                      {item?.photoUrl ? (
                        <img src={item.photoUrl} alt="Item" className="w-full h-40 md:h-full object-cover rounded-xl shadow-lg ring-2 ring-gray-200" />
                      ) : (
                        <div className="w-full h-40 md:h-full rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-lg">
                          <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    
                    {/* Item Information */}
                    <div className="md:col-span-2 space-y-3">
                      {/* Basic Info - simplified rows */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white">
                          <div className="p-1.5 rounded-md bg-gray-100 text-gray-700">
                            <TypeIcon />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 font-medium">Type</div>
                            <div className="text-sm font-semibold text-gray-900">{item?.type || '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white">
                          <div className="p-1.5 rounded-md bg-gray-100 text-gray-700">
                            <MapPinIcon />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-gray-500 font-medium">Location</div>
                            <div className="text-sm font-semibold text-gray-900 truncate">{item?.location || '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white">
                          <div className="p-1.5 rounded-md bg-gray-100 text-gray-700">
                            <BadgeIcon />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 font-medium">Status</div>
                            <div className="text-sm font-semibold text-gray-900 capitalize">{item?.status || '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white">
                          <div className="p-1.5 rounded-md bg-gray-100 text-gray-700">
                            <UsersIcon />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 font-medium">Claims</div>
                            <div className="text-sm font-semibold text-gray-900">
                              {relLoading ? 'Loading...' : `${relatedCount || 1} claim${(relatedCount || 1) === 1 ? '' : 's'}`}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Match Score Progress */}
                      {typeof claim?.matchScore === 'number' && (
                        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-indigo-900">Match Confidence</span>
                            <span className="text-lg font-bold text-indigo-600">{Math.round(claim.matchScore)}%</span>
                          </div>
                          <div className="w-full bg-white rounded-full h-3 shadow-inner overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${
                                claim.matchScore >= 75 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                                claim.matchScore >= 50 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                                'bg-gradient-to-r from-red-500 to-rose-500'
                              } shadow-lg`}
                              style={{ width: `${Math.max(5, Math.min(100, Math.round(claim.matchScore)))}%` }}
                            />
                          </div>
                          {/* Explanatory text removed to reduce visual noise */}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Claim Reasoning */}
              <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-green-600 to-teal-600 p-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zM14.625 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
                    </svg>
                    Student's Claim Reasoning
                  </h3>
                  <p className="text-green-100 text-sm mt-1">Why the student believes this item belongs to them</p>
                </div>
                
                <div className="p-6">
                  <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 p-6 min-h-[120px] shadow-inner">
                    <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">
                      {claim?.notes || (
                        <span className="text-gray-500 italic">No reasoning provided by the student.</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Timeline (simplified) */}
              <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ClockIcon />
                    Claim Timeline
                  </h3>
                </div>
                <div className="p-4">
                  <ul className="divide-y divide-gray-200">
                    <li className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2 text-gray-700">
                        <div className="p-1.5 rounded-md bg-gray-100 text-gray-700"><ClockIcon /></div>
                        <span className="text-sm font-medium">Submitted</span>
                      </div>
                      <span className="text-sm text-gray-600">{claim?.createdAt ? new Date(claim.createdAt).toLocaleString() : 'Unknown'}</span>
                    </li>
                    <li className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2 text-gray-700">
                        <div className="p-1.5 rounded-md bg-gray-100 text-gray-700"><CheckIcon /></div>
                        <span className="text-sm font-medium">Approved</span>
                      </div>
                      <span className="text-sm text-gray-600">{claim?.approvedAt ? new Date(claim.approvedAt).toLocaleString() : (status === 'approved' ? 'Just now' : '—')}</span>
                    </li>
                    <li className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2 text-gray-700">
                        <div className="p-1.5 rounded-md bg-gray-100 text-gray-700"><BadgeIcon /></div>
                        <span className="text-sm font-medium">Current Status</span>
                      </div>
                      <span className="text-sm text-gray-700 capitalize font-medium">{status}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Right: Student Info & Actions */}
            <section className="xl:col-span-1 space-y-4">
              {/* Student Information */}
              <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clipRule="evenodd" />
                    </svg>
                    Student Information
                  </h3>
                </div>
                
                <div className="p-4">
                  {/* Student Avatar & Name */}
                    <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-lg">
                      {((user?.firstName?.[0] || '') + (user?.lastName?.[0] || '')).toUpperCase() || 'S'}
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-gray-900">
                        {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
                      </h4>
                      <p className="text-gray-600 text-sm truncate">{user?.email || '—'}</p>
                    </div>
                  </div>
                    {isReturned && claimerName && (
                      <div className="mb-4 p-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-medium flex items-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h13a5 5 0 1 1 0 10H7"/><polyline points="9,15 3,12 9,9"/></svg>
                        Returned to: <span className="font-semibold">{claimerName}</span>{claim?.returnOverride ? <span className="ml-1 text-[10px] uppercase tracking-wide bg-sky-200 text-sky-800 px-1.5 py-0.5 rounded">override</span> : null}
                      </div>
                    )}
                    {finder && (
                      <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs font-medium">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/></svg>
                          <span className="font-semibold">Finder (Reporter)</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          <div><span className="font-semibold">Name:</span> {[finder.firstName, finder.lastName].filter(Boolean).join(' ') || '—'}</div>
                          <div><span className="font-semibold">Email:</span> {finder.email || '—'}</div>
                          {finder.studentId && <div><span className="font-semibold">Student ID:</span> {finder.studentId}</div>}
                        </div>
                      </div>
                    )}

                  {/* Student Details (simplified) */}
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg border border-gray-200 bg-white">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-gray-100 text-gray-700">
                          <BadgeIcon />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 font-medium">Student ID</div>
                          <div className="text-sm font-bold text-gray-900">{user?.studentId || '—'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-gray-200 bg-white">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-gray-100 text-gray-700">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
                            <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 font-medium">Email Address</div>
                          <div className="text-sm font-bold text-gray-900 truncate">{user?.email || '—'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Contact Student Button */}
                    {user?.email && (
                      <a 
                        href={`mailto:${user.email}?subject=Regarding your item claim #${claim.id}&body=Dear ${user.firstName || 'Student'},%0A%0ARegarding your claim for "${item?.title || 'item'}"...`}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
                          <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
                        </svg>
                        Contact Student
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Admin Notes removed to declutter modal */}

              {/* Action Buttons */}
              <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 p-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.814 3.932 10.708 9.26 12.292a.75.75 0 00.98 0C17.818 20.458 21.75 15.564 21.75 9.75a12.74 12.74 0 00-.635-4.435.75.75 0 00-.722-.515 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                    </svg>
                    Actions
                  </h3>
                </div>
                
                <div className="p-4 space-y-3">
                  {!isReturned && status !== 'rejected' && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => onAction('approved')}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                          busy 
                            ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                            : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                        }`}
                      >
                        {busy ? (
                          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <CheckIcon />
                        )}
                        Approve Claim
                      </button>
                      
                      <button
                        disabled={busy}
                        onClick={() => onAction('rejected')}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                          busy 
                            ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                            : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                        }`}
                      >
                        {busy ? (
                          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <XIcon />
                        )}
                        Reject Claim
                      </button>

                      <button
                        disabled={busy}
                        onClick={() => onAction('pending')}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                          busy 
                            ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                            : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                        }`}
                      >
                        {busy ? (
                          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
                          </svg>
                        )}
                        Mark as Pending
                      </button>
                    </>
                  )}
                  
                  {status === 'approved' && !isReturned && onMarkReturned && (
                    <button
                      disabled={busy}
                      onClick={() => onMarkReturned()}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                        busy 
                          ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500' 
                          : 'bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                      }`}
                      title="Mark item as successfully returned to student"
                    >
                      {busy ? (
                        <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <ReturnIcon />
                      )}
                      Mark as Returned
                    </button>
                  )}

                  {status === 'rejected' && !isReturned && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
                      <div className="text-red-600 font-semibold mb-2">❌ Claim Rejected</div>
                      <p className="text-red-700 text-sm">This claim has been rejected and cannot be modified.</p>
                    </div>
                  )}
                  {isReturned && (
                    <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-center text-sky-800">
                      <div className="font-semibold mb-1">Item Returned</div>
                      <p className="text-sm">This claim has been fulfilled and the item was returned to the student.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const config = {
    approved: { 
      bg: 'bg-gradient-to-r from-green-100 to-emerald-100', 
      text: 'text-green-800', 
      border: 'border-green-200',
      icon: '✅'
    },
    rejected: { 
      bg: 'bg-gradient-to-r from-red-100 to-rose-100', 
      text: 'text-red-800', 
      border: 'border-red-200',
      icon: '❌'
    },
    pending: { 
      bg: 'bg-gradient-to-r from-amber-100 to-orange-100', 
      text: 'text-amber-800', 
      border: 'border-amber-200',
      icon: '⏳'
    }
  }[status] || { 
    bg: 'bg-gradient-to-r from-gray-100 to-slate-100', 
    text: 'text-gray-800', 
    border: 'border-gray-200',
    icon: '❓'
  }

  return (
    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border-2 shadow-sm ${config.bg} ${config.text} ${config.border}`}>
      <span>{config.icon}</span>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
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
function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4h-3a4 4 0 0 0-4 4v2"/><circle cx="10.5" cy="7.5" r="3.5"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
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
function BadgeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h10M7 12h6"/>
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
