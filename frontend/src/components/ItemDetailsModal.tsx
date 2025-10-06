import { useEffect, useRef } from 'react'

export type ItemLike = {
  id: number | string
  title: string
  description?: string | null
  type?: 'lost' | 'found'
  status?: string
  location?: string | null
  occurredOn?: string | null
  reportedAt?: string | null
  photoUrl?: string | null
  photoThumbUrl?: string | null
  finderName?: string | null
}

export default function ItemDetailsModal({
  open,
  item,
  onClose,
  onRequestClaim,
  isOwner,
}: {
  open: boolean
  item: ItemLike | null
  onClose: () => void
  onRequestClaim?: (itemId: number, title?: string) => void
  isOwner?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !item) return null

  const img = item.photoUrl || item.photoThumbUrl || ''

  const dateLabel = item.occurredOn || item.reportedAt
    ? new Date(item.occurredOn || item.reportedAt || '').toLocaleString()
    : undefined

  const status = (item.status || 'open').toLowerCase()
  const statusTheme = status === 'claimed'
    ? 'bg-emerald-600/90'
    : status === 'matched'
    ? 'bg-amber-600/90'
    : status === 'closed'
    ? 'bg-gray-600/90'
    : 'bg-[color:var(--accent)]/90'

  const canClaim = item.type === 'found' && status === 'open' && typeof onRequestClaim === 'function'

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center" aria-modal="true" role="dialog" onMouseDown={handleBackdrop}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative w-[min(980px,94vw)] max-h-[92vh] overflow-auto rounded-3xl border border-white/20 bg-white/95 backdrop-blur shadow-2xl shadow-black/10 ring-1 ring-black/5"
      >
        {/* Accent strip */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-black/10 bg-white/85 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white text-[color:var(--brand-strong)] text-[11px] font-semibold px-2.5 py-1 border border-[color:var(--brand)]/30">
              {item.type === 'found' ? 'Found' : item.type === 'lost' ? 'Lost' : 'Item'}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full text-white text-[11px] font-semibold px-2.5 py-1 ${statusTheme}`}>
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M20 7L9 18l-5-5" />
              </svg>
              {status.charAt(0).toUpperCase()+status.slice(1)}
            </span>
            {isOwner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white text-[color:var(--brand-strong)] text-[11px] font-semibold px-2.5 py-1 border border-[color:var(--brand)]/30" title="You reported this">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 6v12M6 12h12"/>
                </svg>
                You reported this
              </span>
            )}
          </div>
          <button onClick={onClose} className="inline-flex items-center justify-center rounded-md p-2 text-[var(--ink-700)] hover:bg-black/5" aria-label="Close">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 md:p-6 grid gap-6 md:grid-cols-2">
          {/* Left: Image */}
          <div className="relative rounded-2xl overflow-hidden border border-black/10 bg-gradient-to-br from-[color:var(--brand)]/5 to-[color:var(--accent)]/5 shadow-sm">
            <div className="aspect-video bg-white/60">
              {img ? (
                <img src={img} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-[color:var(--brand)]/40">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
                </div>
              )}
            </div>
            {/* Corner chips */}
            <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 text-[color:var(--brand-strong)] text-[10px] font-medium px-2 py-1 border border-[color:var(--brand)]/20 backdrop-blur">
              #{String(item.id)}
            </div>
            {item.type && (
              <div className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 text-[color:var(--brand-strong)] text-[10px] font-medium px-2 py-1 border border-[color:var(--brand)]/20 backdrop-blur">
                {item.type === 'found' ? 'Found' : 'Lost'}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="space-y-4">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-[color:var(--brand)] break-words">{item.title}</h2>
            {item.description && (
              <p className="text-sm md:text-[15px] leading-relaxed text-[var(--ink-700)] whitespace-pre-wrap break-words bg-white/70 rounded-xl border border-black/5 p-3">
                {item.description}
              </p>
            )}

            {/* Meta grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MetaTile label="Location" value={item.location || '—'} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z"/><circle cx="12" cy="11" r="2.5"/></svg>
              )} />
              <MetaTile label="Date" value={dateLabel || '—'} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              )} />
              <MetaTile label="Status" value={status.charAt(0).toUpperCase()+status.slice(1)} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22c4.97 0 9-8 9-12a9 9 0 1 0-18 0c0 4 4.03 12 9 12Z"/><path d="M9 12l2 2 4-4"/></svg>
              )} />
              <MetaTile label="Item ID" value={`#${String(item.id)}`} icon={(
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 7h10v10H7z"/><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z"/></svg>
              )} />
              {item.type === 'found' && (
                <MetaTile label="Finder" value={item.finderName || (isOwner ? 'You' : '—')} icon={(
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/></svg>
                )} />
              )}
            </div>

            {/* Actions */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {canClaim ? (
                <button
                  onClick={() => { if (typeof item.id === 'number') onRequestClaim?.(item.id, item.title); else onRequestClaim?.(Number(item.id), item.title) }}
                  className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-[color:var(--brand)]/30 hover:bg-[color:var(--brand-strong)]"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                  Request Claim
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-[12px] text-[var(--ink-700)]">
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22a10 10 0 1 1 10-10"/><path d="M12 6v6l4 2"/></svg>
                  Contact staff for assistance if needed.
                </div>
              )}
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink-800)] hover:bg-black/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaTile({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/80 backdrop-blur-sm p-3 shadow-sm">
      <div className="flex items-start gap-2">
        {icon && (
          <div className="mt-0.5 inline-flex items-center justify-center size-7 rounded-md bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/15">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[11px] text-[var(--ink-600)]">{label}</div>
          <div className="text-sm font-semibold text-[var(--ink)] truncate" title={value}>{value}</div>
        </div>
      </div>
    </div>
  )
}
