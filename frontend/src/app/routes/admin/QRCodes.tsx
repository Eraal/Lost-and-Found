import { useEffect, useMemo, useState } from 'react'
import { adminListItems, type AdminItem, type QrCodeDto, createItemQrCode, getItemQrCode } from '../../../lib/api'

export default function AdminQRCodes() {
  const [found, setFound] = useState<AdminItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminItem | null>(null)
  const [qr, setQr] = useState<QrCodeDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [qrBusyId, setQrBusyId] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const items = await adminListItems({ type: 'found', limit: 300 })
        if (!cancelled) setFound(items)
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return found
    return found.filter(it => (
      (it.title || '').toLowerCase().includes(term) ||
      (it.location || '').toLowerCase().includes(term) ||
      String(it.id).includes(term)
    ))
  }, [q, found])

  const stats = useMemo(() => {
    const total = found.length
    const withPhoto = found.filter(f => f.photoUrl || f.photoThumbUrl).length
    const today = found.filter(f => f.reportedAt && isToday(f.reportedAt)).length
    return { total, withPhoto, today }
  }, [found])

  async function ensureQr(it: AdminItem, regen = false) {
    if (qrBusyId) return
    setBusy(true)
    setQrBusyId(it.id)
    try {
      const existing = await getItemQrCode(it.id)
      const data = existing && !regen ? existing : await createItemQrCode(it.id, regen)
      setQr(data)
      setSelected(it)
      setShowPreview(true)
    } catch (e) {
      alert((e as Error)?.message || 'Failed to generate QR')
    } finally {
      setBusy(false)
      setQrBusyId(null)
    }
  }

  function onPrint() {
    if (!qr || !selected) return
    const imageUrl = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'}/qrcodes/${qr.code}/image?size=8`
  const scanUrl = qr.canonicalUrl || qr.url || `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'}/qrcodes/${qr.code}/item`
    const itemImg = selected.photoUrl || selected.photoThumbUrl || ''
    const publicPage = ((import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '') + `/scan/${qr.code}`
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return
    const content = `<!doctype html>
      <html><head><meta charset="utf-8"><title>QR Code • Found Item #${selected.id}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;margin:0;padding:8mm;background:#fff}
        .sheet{page-break-after:avoid}
        .header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px}
        .title{font-size:20px;font-weight:800;letter-spacing:-0.01em}
        .muted{color:#475569}
        .qr{width:200px;height:200px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
        .grid{display:grid;grid-template-columns:1fr 1.2fr;gap:16px;align-items:start}
        .photo{width:100%;max-height:260px;object-fit:cover;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
        .placeholder{width:100%;height:220px;border:1px dashed #cbd5e1;border-radius:10px;color:#94a3b8;display:grid;place-items:center}
        .section-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#334155}
        .small{font-size:11px}
      </style></head>
      <body>
        <div class="sheet">
          <div class="header">
            <div>
              <div class="title">Found Item #${selected.id}</div>
              <div style="font-size:14px;margin-top:4px">${escapeHtml(selected.title)}</div>
              ${selected.location ? `<div class="muted" style="font-size:12px;margin-top:2px">Location: ${escapeHtml(selected.location)}</div>` : ''}
              ${selected.type ? `<div class="muted" style="font-size:12px;margin-top:2px">Type: ${escapeHtml(String(selected.type))}</div>` : ''}
              ${selected.occurredOn ? `<div class="muted" style="font-size:12px;margin-top:2px">Occurred: ${new Date(selected.occurredOn).toLocaleDateString()}</div>` : ''}
              ${selected.reportedAt ? `<div class="muted" style="font-size:12px;margin-top:2px">Reported: ${new Date(selected.reportedAt).toLocaleString()}</div>` : ''}
            </div>
            <img class="qr" src="${imageUrl}" alt="QR Code" />
          </div>
          <div class="grid">
            <div>
              ${itemImg ? `<img class="photo" src="${itemImg}" alt="Item"/>` : `<div class="placeholder">No image</div>`}
            </div>
            <div>
              ${selected.description ? `<div style="margin-bottom:12px"><div class="section-label">Description</div><div style="font-size:13px;margin-top:6px;line-height:1.45">${escapeHtml(selected.description || '')}</div></div>` : ''}
              <div class="section-label">Scan Link</div>
              <div class="small" style="margin-top:6px;word-break:break-all">${scanUrl}</div>
              <div class="small" style="margin-top:4px;word-break:break-all">Public page: ${publicPage}</div>
              ${typeof qr.scanCount === 'number' ? `<div class="muted small" style="margin-top:8px">Scans: ${qr.scanCount}${qr.lastScannedAt ? ` • Last: ${new Date(qr.lastScannedAt).toLocaleString()}` : ''}</div>` : ''}
            </div>
          </div>
          <div class="muted small" style="margin-top:16px">Scan this QR to view the item details and request a claim if this item belongs to you.</div>
        </div>
        <script>window.onload=() => window.print()</script>
      </body></html>`
    w.document.write(content)
    w.document.close()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg">
              <QrIcon />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">QR Codes • Found Items</h1>
              <p className="mt-1 text-sm text-slate-600">Generate, manage and print QR codes for rapid identification & claim routing.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
                <Badge color="indigo">Total: {stats.total}</Badge>
                <Badge color="sky">With Photo: {stats.withPhoto}</Badge>
                <Badge color="emerald">Today: {stats.today}</Badge>
              </div>
            </div>
          </div>
          {selected && qr && (
            <div className="inline-flex flex-wrap gap-2">
              <button onClick={() => ensureQr(selected, true)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white border-2 border-gray-200 text-gray-800 hover:bg-gray-50 disabled:opacity-50"><RefreshIcon /> Regenerate</button>
              <button onClick={onPrint} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow hover:from-indigo-700 hover:to-blue-700"><PrintIcon /> Print</button>
            </div>
          )}
        </div>

        {/* Search & Hints */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-6">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-700">Search Items</label>
            <div className="mt-1 relative">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title, location, or ID…" className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-300 outline-none shadow-sm" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 backdrop-blur p-4 text-[11px] text-slate-600 shadow-sm flex-1">
            <p className="font-semibold mb-1 text-slate-700">Tips</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Click Generate to open QR preview modal</li>
              <li>Regenerate only if code was compromised</li>
              <li>Print includes item photo & metadata</li>
            </ul>
          </div>
        </div>

        {/* Content */}
        {error ? (
          <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/60 p-6 text-rose-700 text-sm">{error}</div>
        ) : loading ? (
          <CardSkeleton rows={9} />
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-sm text-slate-600 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50">No found items match your search.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(it => (
              <ItemCard key={it.id} item={it} busy={qrBusyId === it.id} onGenerate={() => ensureQr(it)} />
            ))}
          </div>
        )}

        {/* QR Preview Modal */}
        {showPreview && selected && qr && (
          <QrModal item={selected} qr={qr} busy={busy} onClose={() => setShowPreview(false)} onRegenerate={() => ensureQr(selected, true)} onPrint={onPrint} />
        )}
      </div>
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/* -------------------------------------------------------------------------- */
/*  UI Subcomponents                                                          */
/* -------------------------------------------------------------------------- */

function ItemCard({ item, onGenerate, busy }: { item: AdminItem; onGenerate: () => void; busy?: boolean }) {
  const isNew = item.reportedAt ? (Date.now() - Date.parse(item.reportedAt)) < 48 * 36e5 : false
  return (
    <div className="group relative rounded-2xl border-2 border-slate-200 bg-white p-4 flex gap-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="size-20 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 grid place-items-center overflow-hidden ring-1 ring-slate-300/50">
        {item.photoThumbUrl || item.photoUrl ? (
          <img src={item.photoThumbUrl || item.photoUrl || ''} alt="" className="object-cover w-full h-full" />
        ) : (
          <span className="text-slate-400 text-xl">📦</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-semibold truncate max-w-[180px]" title={item.title}>{item.title}</div>
          {isNew && <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px] font-semibold shadow">NEW</span>}
        </div>
        <div className="mt-0.5 text-xs text-slate-600 truncate flex items-center gap-1">
          <MapPinIcon className="size-3.5" /> {item.location || '—'}
        </div>
        {item.reportedAt && (
          <div className="mt-0.5 text-[11px] text-slate-500">Reported {relativeTime(item.reportedAt)}</div>
        )}
        <div className="mt-3 inline-flex items-center gap-2">
          <button disabled={busy} onClick={onGenerate} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm border-2 transition-colors ${busy ? 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400'}`}>
            {busy ? <SpinnerIcon /> : <QrIcon />} {busy ? 'Working…' : 'Generate QR'}
          </button>
          {item.description && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Desc</span>}
        </div>
      </div>
      <div className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,.18),transparent_60%)]" />
    </div>
  )
}

function QrModal({ item, qr, onClose, onRegenerate, onPrint, busy }: { item: AdminItem; qr: QrCodeDto; onClose: () => void; onRegenerate: () => void; onPrint: () => void; busy?: boolean }) {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
  const img = `${apiBase}/qrcodes/${qr.code}/image?size=8`
  const scanUrl = qr.canonicalUrl || qr.url || `${apiBase}/qrcodes/${qr.code}/item`
  const download = () => { const a = document.createElement('a'); a.href = img; a.download = `item-${item.id}-qr.png`; document.body.appendChild(a); a.click(); a.remove() }
  const copy = async () => { try { await navigator.clipboard?.writeText(scanUrl); } catch {/* ignore */} }
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(820px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-indigo-600/5 to-blue-600/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow"><QrIcon /></div>
            <div className="text-[15px] font-semibold text-slate-900">QR Code • Found Item #{item.id}</div>
          </div>
          <button onClick={onClose} className="size-9 inline-grid place-items-center rounded-lg hover:bg-black/5"><XIcon /></button>
        </div>
        <div className="p-6 flex flex-col md:flex-row gap-8">
          <div className="relative flex flex-col items-center">
            <div className="relative p-5 rounded-2xl bg-white shadow-inner ring-1 ring-slate-200">
              <img src={img} alt="QR" className="w-60 h-60 rounded-xl border border-slate-200" />
              {typeof qr.scanCount === 'number' && <div className="absolute -top-2 -right-2 rounded-full bg-indigo-600 text-white text-[10px] font-semibold px-2 py-1 shadow">{qr.scanCount} scan{qr.scanCount === 1 ? '' : 's'}</div>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
              {qr.lastScannedAt && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1"><ClockIcon /> Last {relativeTime(qr.lastScannedAt)}</span>}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">Code: <code className="font-mono">{qr.code}</code></span>
            </div>
          </div>
          <div className="flex-1 min-w-0 text-sm text-slate-800">
            <div className="font-semibold text-lg truncate" title={item.title}>{item.title}</div>
            <div className="text-xs text-slate-600 truncate flex items-center gap-1 mt-0.5"><MapPinIcon className="size-3.5" /> {item.location || '—'}</div>
            {item.description && (
              <div className="mt-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Description</div>
                <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-100 max-h-40 overflow-auto">{item.description}</p>
              </div>
            )}
            <div className="mt-5 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Scan Link</div>
              <div className="text-xs break-all rounded-lg bg-slate-50 border border-slate-200 p-2 font-mono">
                <a href={scanUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{scanUrl}</a>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button onClick={onRegenerate} disabled={busy} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50"><RefreshIcon /> Regenerate</button>
              <button onClick={onPrint} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"><PrintIcon /> Print</button>
              <button onClick={download} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-white border border-slate-300 hover:bg-slate-50"><DownloadIcon /> PNG</button>
              <button onClick={copy} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-white border border-slate-300 hover:bg-slate-50"><LinkIcon /> Copy Link</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: 'indigo' | 'sky' | 'emerald' }) {
  const map: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-semibold ${map[color]}`}>{children}</span>
}

function CardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border-2 border-slate-200 bg-white p-4 flex gap-4 animate-pulse">
          <div className="size-20 rounded-xl bg-slate-200" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
            <div className="h-8 w-24 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* Utilities */
function isToday(d: string) { const dt = new Date(d); const now = new Date(); return dt.getDate() === now.getDate() && dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear() }
function relativeTime(date: string | number | Date): string { const d = new Date(date); const diffMs = Date.now() - d.getTime(); const abs = Math.abs(diffMs); const sec = Math.round(abs/1000); const min = Math.round(sec/60); const hr = Math.round(min/60); const day = Math.round(hr/24); const fmt = (n:number,w:string)=>`${n} ${w}${n!==1?'s':''}`; let value: string; if (sec<45) value=fmt(sec,'second'); else if (min<45) value=fmt(min,'minute'); else if (hr<24) value=fmt(hr,'hour'); else if (day<30) value=fmt(day,'day'); else return d.toLocaleDateString(); return diffMs>=0?`${value} ago`:`in ${value}` }

/* Icons reused from Items page (assumed globally available styles) */
function QrIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 20h-3v-3" /></svg>) }
function RefreshIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><path d="M3 3v6h6" /><path d="M21 21v-6h-6" /><path d="M21 12A9 9 0 0 0 6.3 5.3L3 9" /><path d="M3 12a9 9 0 0 0 14.7 6.7L21 15" /></svg>) }
function PrintIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>) }
function DownloadIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><path d="M12 3v14" /><path d="M6 13l6 6 6-6" /><path d="M5 21h14" /></svg>) }
function LinkIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.72-1.71" /></svg>) }
function XIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><path d="M18 6 6 18M6 6l12 12" /></svg>) }
function MapPinIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z"/><circle cx="12" cy="11" r="2.5"/></svg>) }
function ClockIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>) }
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M22 12a10 10 0 0 1-10 10" /></svg>) }
function SearchIcon(props: React.SVGProps<SVGSVGElement>) { return (<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" /></svg>) }
