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

  async function ensureQr(it: AdminItem, regen = false) {
    setBusy(true)
    try {
      const existing = await getItemQrCode(it.id)
      if (existing && !regen) {
        setQr(existing)
      } else {
        const created = await createItemQrCode(it.id, regen)
        setQr(created)
      }
      setSelected(it)
    } catch (e) {
      alert((e as Error)?.message || 'Failed to generate QR')
    } finally {
      setBusy(false)
    }
  }

  function onPrint() {
    if (!qr || !selected) return
    const imageUrl = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'}/qrcodes/${qr.code}/image?size=8`
    const scanUrl = qr.url || `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'}/qrcodes/${qr.code}/item`
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
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">QR Codes for Found Items</h1>
            <p className="text-sm text-gray-600">Generate and print QR codes that link to item details.</p>
          </div>
          {selected && qr && (
            <div className="inline-flex items-center gap-2">
              <button onClick={() => ensureQr(selected, true)} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50">Regenerate</button>
              <button onClick={onPrint} className="rounded-lg px-3 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700">Print</button>
            </div>
          )}
        </div>

        <div className="mb-4">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search found items…" className="w-full max-w-md rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm" />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">{error}</div>
        ) : loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(it => (
              <div key={it.id} className="rounded-xl border-2 border-gray-200 bg-white p-4 flex gap-4">
                <div className="size-20 rounded-lg bg-gray-100 grid place-items-center overflow-hidden">
                  {it.photoThumbUrl || it.photoUrl ? (
                    <img src={it.photoThumbUrl || it.photoUrl || ''} alt="" className="object-cover w-full h-full" />
                  ) : (
                    <span className="text-gray-400">📦</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" title={it.title}>{it.title}</div>
                  <div className="text-xs text-gray-600 truncate">{it.location || '—'}</div>
                  <div className="mt-2 inline-flex items-center gap-2">
                    <button disabled={busy} onClick={() => ensureQr(it)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700">Generate QR</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && qr && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold">Preview</div>
                <div className="text-xs text-gray-600">Code: {qr.code} • Scans: {qr.scanCount ?? 0}</div>
              </div>
              <div className="inline-flex items-center gap-2">
                <button onClick={() => ensureQr(selected, true)} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-semibold bg-white border border-gray-200 hover:bg-gray-50">Regenerate</button>
                <button onClick={onPrint} className="rounded-lg px-3 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700">Print</button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <img src={`${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'}/qrcodes/${qr.code}/image?size=8`} alt="QR Code" className="w-48 h-48 rounded-lg border border-gray-200" />
              <div className="text-sm text-gray-700">
                <div className="font-medium">Found Item #{selected.id}</div>
                <div className="text-gray-600">{selected.title}</div>
                <div className="text-xs text-gray-500 mt-2">Scan to view details and claim instructions.</div>
                <a href={qr.url || '#'} target="_blank" className="text-xs text-indigo-600 underline break-all">{qr.url}</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
