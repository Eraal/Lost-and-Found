import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../lib/useAuth'
import { createFoundItem, listItems, type CreateFoundItemInput, type ItemDto, getSuggestionsForItem, type Suggestion, autoReportFoundFromQr } from '../../../lib/api'
import QrCameraScanner from '../../../components/QrCameraScanner'

type FormState = {
  title: string
  description: string
  location: string
  occurredOn: string
  photoFile: File | null
}

export default function ReportFoundPage() {
  const { user } = useAuth()
  const [form, setForm] = useState<FormState>({ title: '', description: '', location: '', occurredOn: '', photoFile: null })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [successId, setSuccessId] = useState<number | null>(null)
  const [recent, setRecent] = useState<ItemDto[] | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [qrMode, setQrMode] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [autoFoundMessage, setAutoFoundMessage] = useState<string | null>(null)
  const [autoFoundLoading, setAutoFoundLoading] = useState(false)

  async function loadRecent() {
    if (!user) return
    setLoadingList(true)
    try {
      const items = await listItems({ type: 'found', reporterUserId: user.id, limit: 5 })
      setRecent(items)
    } catch {
      setRecent([])
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    loadRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const titleOk = useMemo(() => form.title.trim().length >= 3, [form.title])

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!titleOk) next.title = 'Please enter a short title'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    if (!user) return
    setSubmitting(true)
    setSuccessId(null)
    try {
      const payload: CreateFoundItemInput = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        occurredOn: form.occurredOn || undefined,
        photoFile: form.photoFile || undefined,
      }
      const created = await createFoundItem(payload, user.id)
      setSuccessId(created.id)
      setForm({ title: '', description: '', location: '', occurredOn: '', photoFile: null })
      loadRecent()
      try {
        const s = await getSuggestionsForItem(created.id, 5, 0.5)
        setSuggestions(s)
      } catch {
        setSuggestions([])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit report'
      setErrors((prev) => ({ ...prev, title: msg }))
    } finally {
      setSubmitting(false)
    }
  }

  // Simulated QR scanner integration: in a production scenario integrate a camera component (e.g., html5-qrcode or a small custom WebRTC reader)
  async function handleQrScanSubmit() {
    if (!qrResult || !user) return
    setAutoFoundLoading(true)
    setAutoFoundMessage(null)
    try {
      const resp = await autoReportFoundFromQr(qrResult, { reporterUserId: user.id, location: form.location || undefined })
      if ('error' in resp) {
        setAutoFoundMessage(resp.error)
      } else {
        setAutoFoundMessage(resp.message || 'Auto-found report created.')
        setSuccessId(resp.foundItem.id)
        loadRecent()
        try {
          const s = await getSuggestionsForItem(resp.foundItem.id, 5, 0.5)
          setSuggestions(s)
        } catch {
          setSuggestions([])
        }
      }
    } catch (e) {
      setAutoFoundMessage(e instanceof Error ? e.message : 'Failed to auto-report')
    } finally {
      setAutoFoundLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px-64px)] bg-academic">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="relative rounded-2xl border border-black/5 bg-white/80 backdrop-blur-sm shadow-xl shadow-black/5 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
          <div className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="relative inline-flex items-center justify-center size-9 rounded-full ring-2 ring-[color:var(--brand)]/20 bg-[color:var(--brand)]/5">
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[color:var(--accent)]" />
                <svg viewBox="0 0 24 24" className="size-5 text-[color:var(--brand)]" fill="currentColor" aria-hidden>
                  <path d="M12 2a4 4 0 0 1 4 4v3h2a2 2 0 0 1 2 2v9H4V11a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4Z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-[color:var(--brand)]">Report a Found Item</h1>
                <p className="text-sm text-[var(--ink-600)]">Share details so the owner can be identified and contacted.</p>
              </div>
            </div>

            {successId && (
              <div className="mb-4 rounded-lg bg-green-50 text-green-800 ring-1 ring-green-500/20 px-3 py-2 text-sm">
                Thank you! Your found item was submitted. Reference ID: <span className="font-medium">{successId}</span>
              </div>
            )}

            <div className="grid lg:grid-cols-[1fr_320px] gap-8">
              <form className="space-y-4" onSubmit={onSubmit} noValidate>
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-[var(--ink)]">Item title</label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    onBlur={validate}
                    aria-invalid={!!errors.title}
                    aria-describedby={errors.title ? 'title-error' : undefined}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${errors.title ? 'border-red-500/60' : 'border-black/10 hover:border-black/15'}`}
                    placeholder="e.g., Blue water bottle"
                  />
                  {errors.title && <p id="title-error" className="mt-1 text-sm text-red-600" role="alert">{errors.title}</p>}
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-[var(--ink)]">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 border-black/10 hover:border-black/15"
                    placeholder="Include brand, color, unique marks, etc."
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="location" className="block text-sm font-medium text-[var(--ink)]">Where you found it</label>
                    <input
                      id="location"
                      name="location"
                      type="text"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 border-black/10 hover:border-black/15"
                      placeholder="e.g., Library, Lab A, Cafeteria"
                    />
                  </div>
                  <div>
                    <label htmlFor="occurredOn" className="block text-sm font-medium text-[var(--ink)]">Date found</label>
                    <input
                      id="occurredOn"
                      name="occurredOn"
                      type="date"
                      value={form.occurredOn}
                      onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 border-black/10 hover:border-black/15"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="photo" className="block text-sm font-medium text-[var(--ink)]">Photo (optional)</label>
                  <input
                    id="photo"
                    name="photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setForm({ ...form, photoFile: e.currentTarget.files?.[0] ?? null })}
                    className="mt-1 block w-full text-sm text-[var(--ink-600)] file:mr-3 file:rounded-md file:border file:border-black/10 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-[color:var(--brand)] hover:file:bg-[color:var(--brand)]/10 focus:outline-none"
                  />
                  {form.photoFile && (
                    <p className="mt-1 text-xs text-[var(--ink-600)]">Selected: {form.photoFile.name}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--brand)] text-white px-4 py-2.5 font-medium shadow-sm shadow-[color:var(--brand)]/20 ring-1 ring-[color:var(--brand)]/20 transition-all hover:bg-[color:var(--brand-strong)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[color:var(--brand)]/50 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submitting && (
                      <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <circle cx="12" cy="12" r="9" className="opacity-25" />
                        <path d="M21 12a9 9 0 0 1-9 9" />
                      </svg>
                    )}
                    Submit report
                  </button>
                  <button
                    type="button"
                    onClick={() => { setQrMode(m => !m); setAutoFoundMessage(null); setQrResult(null) }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-white/80 px-4 py-2.5 text-sm font-medium hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40"
                  >
                    {qrMode ? 'Close QR Mode' : 'Scan QR Code'}
                  </button>
                  <p className="text-sm text-[var(--ink-600)]">We’ll notify when a student claims and verifies ownership.</p>
                </div>

                {qrMode && (
                  <div className="mt-4 rounded-lg border border-dashed border-[color:var(--brand)]/40 bg-[color:var(--brand)]/5 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-medium text-[color:var(--brand)]">QR Scan Mode</div>
                      <div className="text-[10px] text-[var(--ink-600)]">Point camera at item QR. Auto-stops on detection.</div>
                    </div>
                    <QrCameraScanner
                      onResult={(code) => { setQrResult(code); setTimeout(handleQrScanSubmit, 10) }}
                      onError={(e) => setAutoFoundMessage(e.message)}
                      continuous={false}
                      className="w-full"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Or paste QR code manually"
                        value={qrResult ?? ''}
                        onChange={(e) => setQrResult(e.target.value.trim())}
                        className="flex-1 min-w-[220px] rounded-md border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40"
                      />
                      <button
                        type="button"
                        disabled={!qrResult || autoFoundLoading}
                        onClick={handleQrScanSubmit}
                        className="inline-flex items-center gap-2 rounded-md bg-[color:var(--brand)] text-white px-4 py-2 text-sm font-medium ring-1 ring-[color:var(--brand)]/20 disabled:opacity-60"
                      >
                        {autoFoundLoading && <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" className="opacity-25" /><path d="M21 12a9 9 0 0 1-9 9" /></svg>}
                        Auto Report
                      </button>
                    </div>
                    {qrResult && !autoFoundLoading && <div className="text-[10px] text-[var(--ink-600)]">Detected: <span className="font-medium break-all">{qrResult}</span></div>}
                    {autoFoundMessage && <div className="text-xs text-[var(--ink-700)]">{autoFoundMessage}</div>}
                  </div>
                )}
              </form>
              {/* Sidebar: recent found reports */}
              <aside className="lg:border-l lg:pl-8 border-black/5 space-y-6">
                <h2 className="text-sm font-semibold text-[var(--ink)] mb-2">Your recent found reports</h2>
                {loadingList ? (
                  <div className="text-sm text-[var(--ink-600)]">Loading...</div>
                ) : recent && recent.length > 0 ? (
                  <ul className="divide-y divide-black/5 rounded-md ring-1 ring-black/5 overflow-hidden bg-white/60">
                    {recent.map((it) => (
                      <li key={it.id} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-[var(--ink)]">{it.title}</div>
                            <div className="text-xs text-[var(--ink-600)]">
                              {it.location ? `${it.location} • ` : ''}{it.occurredOn || (it.reportedAt ? new Date(it.reportedAt).toLocaleDateString() : '')}
                            </div>
                          </div>
                          <span className="text-xs rounded-full px-2 py-0.5 ring-1 ring-[color:var(--brand)]/30 bg-[color:var(--brand)]/10 text-[color:var(--brand)]">{it.status}</span>
                        </div>
                      </li>)
                    )}
                  </ul>
                ) : (
                  <div className="text-sm text-[var(--ink-600)]">No reports yet.</div>
                )}

                {Array.isArray(suggestions) && (
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--ink)] mt-4 mb-2">Suggested matches</h3>
                    {suggestions.length === 0 ? (
                      <div className="text-xs text-[var(--ink-600)]">No suggestions yet.</div>
                    ) : (
                      <ul className="space-y-2">
                        {suggestions.map(s => (
                          <li key={`${s.lostItemId}-${s.foundItemId}`} className="rounded-lg border border-black/10 bg-white/80 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold truncate" title={s.candidate.title}>{s.candidate.title}</div>
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-[color:var(--brand)]/30 bg-[color:var(--brand)]/10 text-[color:var(--brand)]">{Math.round(s.score)}% match</span>
                                </div>
                                <div className="mt-0.5 text-xs text-[var(--ink-600)] truncate">
                                  {s.candidate.location || '—'} {s.candidate.occurredOn ? `• ${new Date(s.candidate.occurredOn).toLocaleDateString()}` : ''}
                                </div>
                              </div>
                              <div className="shrink-0 inline-flex items-center gap-2">
                                <button onClick={() => window.open(`/admin/items/matched`, '_self')} className="rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 ring-black/10 bg-white hover:bg-black/5">View Details</button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
