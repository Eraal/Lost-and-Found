import { useEffect, useRef, useState } from 'react'

type Props = {
  open: boolean
  itemTitle?: string
  onCancel: () => void
  onSubmit: (notes?: string) => Promise<void> | void
}

export default function RequestClaimModal({ open, itemTitle, onCancel, onSubmit }: Props) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    // autofocus textarea shortly after open for smoother UX
    const t = setTimeout(() => textareaRef.current?.focus(), 50)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [open, onCancel])

  useEffect(() => {
    if (!open) setNotes('')
  }, [open])

  if (!open) return null

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel()
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit(notes.trim() ? notes.trim() : undefined)
    } finally {
      setSubmitting(false)
    }
  }

  return (
  <div className="fixed inset-0 z-[100] overflow-y-auto flex items-start justify-center p-4 sm:p-6" aria-modal="true" role="dialog" onMouseDown={handleBackdrop}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
  <div ref={dialogRef} className="relative w-full max-w-md mx-4 sm:mx-6 rounded-xl border border-black/10 bg-white shadow-2xl animate-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
        <div className="p-4 border-b border-black/10 flex items-center justify-between">
          <h2 className="text-base font-semibold">Request to claim</h2>
          <button
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--ink-700)] hover:bg-black/5"
            aria-label="Close"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {itemTitle && (
            <div className="text-sm text-[var(--ink-700)]">Item: <span className="font-medium text-[var(--ink)]">{itemTitle}</span></div>
          )}
          <div>
            <label className="block text-xs text-[var(--ink-600)] mb-1">Proof / notes (optional)</label>
            <textarea
              ref={textareaRef}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Describe unique marks, purchase receipt, photos you can show on pickup, etc."
              className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-[color:var(--brand)]/30"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-600)]">Your request will be reviewed by staff. You may be contacted for verification.</p>
          </div>
        </div>

        <div className="p-4 border-t border-black/10 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md px-3 py-2 text-sm font-medium ring-1 ring-black/10 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-white ${submitting ? 'bg-[color:var(--brand)]/80' : 'bg-[color:var(--brand)] hover:bg-[color:var(--brand-strong)]'}`}
          >
            {submitting ? (
              <>
                <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" className="opacity-25"/><path d="M21 12a9 9 0 0 1-9 9"/></svg>
                Submitting…
              </>
            ) : (
              <>
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                Submit request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
