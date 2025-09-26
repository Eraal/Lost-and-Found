import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { resolveQrCode, type ItemDto } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'

export default function ScanItemPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [item, setItem] = useState<ItemDto | null>(null)
  const [instructions, setInstructions] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!code) {
      setError('QR code missing')
      setLoading(false)
      return
    }
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await resolveQrCode(code)
        if ('error' in res) throw new Error(res.error)
        if (!cancelled) {
          setItem(res.item ?? null)
          setInstructions(res.instructions ?? null)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Invalid QR code')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [code])

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-academic">
        <div className="rounded-xl border border-black/10 bg-white/80 px-6 py-4 text-sm">Loading item…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-academic p-4">
        <div className="max-w-md w-full rounded-xl border-2 border-rose-200 bg-rose-50/70 px-5 py-4 text-rose-700 text-sm">
          {error}
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="min-h-screen grid place-items-center bg-academic">
        <div className="rounded-xl border border-black/10 bg-white/80 px-6 py-4 text-sm">No item associated with this code.</div>
      </div>
    )
  }

  const occurredOn = item.occurredOn ?? undefined

  return (
    <div className="min-h-screen bg-academic p-4">
      <div className="mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/90 shadow-xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                {item.photoThumbUrl || item.photoUrl ? (
                  <img src={item.photoThumbUrl || item.photoUrl || ''} alt="Item" className="w-28 h-28 rounded-xl object-cover ring-1 ring-black/10" />
                ) : (
                  <div className="w-28 h-28 rounded-xl bg-gray-100 grid place-items-center text-3xl">📦</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--ink)]">{item.title}</h1>
                <div className="mt-1 text-sm text-[var(--ink-700)]">
                  <span className="inline-flex items-center gap-1 mr-3"><TypeIcon /> {item.type === 'found' ? 'Found Item' : 'Lost Item'}</span>
                  {item.location && <span className="inline-flex items-center gap-1 mr-3"><MapPinIcon /> {item.location}</span>}
                  {occurredOn ? <span className="inline-flex items-center gap-1"><CalendarIcon /> {new Date(occurredOn).toLocaleDateString()}</span> : null}
                </div>
                {item.description && (
                  <p className="mt-3 text-[15px] leading-6 text-[var(--ink-800)] whitespace-pre-line">{item.description}</p>
                )}
                <div className="mt-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${item.status === 'closed' ? 'bg-sky-50 text-sky-700 ring-sky-200' : item.status === 'claimed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                    Status: {item.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-black/10 bg-gray-50 p-4">
              <div className="text-sm text-[var(--ink-700)]">
                {instructions || 'If this item belongs to you, log in and request a claim. An admin will verify ownership.'}
              </div>
              <div className="mt-3 flex gap-2">
                {user ? (
                  <button onClick={() => navigate('/my-reports')} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand)] text-white px-4 py-2 text-sm font-medium ring-1 ring-[color:var(--brand)]/20 hover:bg-[color:var(--brand-strong)]">
                    Go to My Reports
                  </button>
                ) : (
                  <>
                    <button onClick={() => navigate('/login')} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand)] text-white px-4 py-2 text-sm font-medium ring-1 ring-[color:var(--brand)]/20 hover:bg-[color:var(--brand-strong)]">Login to Claim</button>
                    <button onClick={() => navigate('/register')} className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">Register</button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

function TypeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 7h10v10H7z" /><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z" />
    </svg>
  )
}
function MapPinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z"/><circle cx="12" cy="11" r="2.5"/>
    </svg>
  )
}
function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}
