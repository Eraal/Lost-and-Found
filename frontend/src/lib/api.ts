// Resolve API base URL with safe defaults:
// - Use explicit VITE_API_BASE_URL when provided (e.g., '/api/v1' for same-origin)
// - Else prefer same-origin '/api/v1' in the browser to avoid CORS in production
// - Fallback to localhost only for non-browser contexts (SSR/dev tooling)
const API_BASE = (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim())
  || (typeof window !== 'undefined' ? '/api/v1' : 'http://localhost:5000/api/v1')

// Normalize image URLs to avoid mixed-content and host mismatches in production.
// If the URL points to the same origin (including http/https) or is an absolute
// uploads URL on the same host, convert it to a path-only URL. Leave third-party
// hosts (e.g., S3) untouched.
function normalizeImageUrl(input?: string): string | undefined {
  try {
    if (!input) return undefined
    // Already a path
    if (input.startsWith('/uploads/')) return input
    // Absolute URL
    if (/^https?:\/\//i.test(input)) {
      if (typeof window === 'undefined') return input
      const u = new URL(input)
      // If the path is /uploads on ANY host, force same-origin path so Nginx can proxy it
      if (u.pathname.startsWith('/uploads/')) {
        return u.pathname + (u.search || '')
      }
      // Otherwise leave as-is (e.g., S3 or CDN)
      return input
    }
    return input
  } catch {
    return input
  }
}

function currentToken(): string | null {
  try {
    const raw = localStorage.getItem('ccslf:user')
    if (!raw) return null
    const u = JSON.parse(raw)
    if (u && typeof u === 'object' && typeof u.token === 'string' && u.token) return u.token
    return null
  } catch { return null }
}

function authHeaders(devUserId?: number): Record<string, string> {
  const headers: Record<string, string> = {}
  const t = currentToken()
  if (t) headers['Authorization'] = `Bearer ${t}`
  if (typeof devUserId === 'number' && !t) headers['X-User-Id'] = String(devUserId)
  return headers
}

type ItemLite = {
  id: string | number
  name: string
  type?: string
  location?: string
  date?: string
  imageUrl?: string
  description?: string
  status?: string
}

function toItemLite(x: unknown, fallbackId: number): ItemLite {
  if (typeof x === 'object' && x !== null) {
    const obj = x as Record<string, unknown>
    const id = (typeof obj.id === 'string' || typeof obj.id === 'number') ? obj.id : fallbackId
    // Prefer explicit name, else fall back to title
    const title = typeof obj.title === 'string' ? obj.title : undefined
    const name = typeof obj.name === 'string' ? obj.name : (title ?? 'Item')
    // "type" may be category (Wallet, ID) or record type (lost/found) depending on API; pass through
    const type = typeof obj.type === 'string' ? obj.type : (typeof obj.category === 'string' ? (obj.category as string) : undefined)
    const location = typeof obj.location === 'string' ? obj.location : undefined
    // Derive date from common fields
    const date = typeof obj.date === 'string' ? obj.date : (typeof obj.occurredOn === 'string' ? (obj.occurredOn as string) : (typeof obj.reportedAt === 'string' ? (obj.reportedAt as string) : undefined))
    // Accept either imageUrl or photoUrl
  let imageUrl = typeof obj.imageUrl === 'string' ? obj.imageUrl : (typeof obj.photoThumbUrl === 'string' ? (obj.photoThumbUrl as string) : (typeof obj.photoUrl === 'string' ? (obj.photoUrl as string) : undefined))
  imageUrl = normalizeImageUrl(imageUrl)
    const description = typeof obj.description === 'string' ? obj.description : undefined
    const status = typeof obj.status === 'string' ? obj.status : undefined
    return { id, name, type, location, date, imageUrl, description, status }
  }
  return { id: fallbackId, name: 'Item' }
}

export async function getRecentItems(limit = 8) {
  try {
    const res = await fetch(`${API_BASE}/items?limit=${limit}`)
    if (!res.ok) throw new Error('Failed')
  const data = await res.json() as { items?: unknown[] }
  return (data.items ?? []).map((x: unknown, i: number) => toItemLite(x, i))
  } catch {
    // Fallback sample data
    return [
      { id: 1, name: 'Black Wallet', type: 'Wallet', location: 'Library', date: '2025-09-01', description: 'Leather wallet with several cards inside.' },
      { id: 2, name: 'Red Umbrella', type: 'Umbrella', location: 'Gate 3', date: '2025-09-02', description: 'Compact umbrella, red canopy with black handle.' },
      { id: 3, name: 'Blue Water Bottle', type: 'Bottle', location: 'Room 204', date: '2025-09-03', description: 'Reusable bottle (1L), sticker on the side.' },
      { id: 4, name: 'USB Drive 32GB', type: 'USB', location: 'Lab A', date: '2025-09-03', description: 'Silver USB thumb drive, 32GB capacity.' },
      { id: 5, name: 'ID Card', type: 'ID', location: 'Cafeteria', date: '2025-09-03', description: 'Student ID card with lanyard.' },
      { id: 6, name: 'Earbuds', type: 'Electronics', location: 'Gym', date: '2025-09-03', description: 'Wireless earbuds in a black case.' },
      { id: 7, name: 'Math Notebook', type: 'Notebook', location: 'Hallway', date: '2025-09-03', description: 'Spiral notebook, grid paper with formulas.' },
      { id: 8, name: 'Power Bank', type: 'Electronics', location: 'Library', date: '2025-09-03', description: '10,000 mAh power bank, slightly scratched.' },
    ]
  }
}

export async function getMonthlyStats() {
  try {
    const res = await fetch(`${API_BASE}/public/stats/monthly`)
  const data = await res.json().catch(() => ({})) as unknown as { recoveredThisMonth?: unknown }
    if (!res.ok) throw new Error('Failed')
  const raw = data && (data as { recoveredThisMonth?: unknown }).recoveredThisMonth
  const n = typeof raw === 'number' ? raw : Number(raw)
    return { recoveredThisMonth: Number.isFinite(n) ? n : 0 }
  } catch {
    return { recoveredThisMonth: 0 }
  }
}

// Notifications (User)
export type NotificationDto = {
  id: number
  title: string
  message?: string
  createdAt: string // ISO
  read?: boolean
  type?: 'match' | 'status' | 'system'
}

export async function getUserNotifications(userId: number, limit = 10): Promise<NotificationDto[]> {
  try {
    const qs = new URLSearchParams({ userId: String(userId), limit: String(limit) })
    const res = await fetch(`${API_BASE}/notifications?${qs.toString()}`, { headers: authHeaders(userId) })
    if (!res.ok) throw new Error('Failed')
    const data = await res.json().catch(() => ({})) as { notifications?: NotificationDto[] }
    return data.notifications ?? []
  } catch {
    // Fallback sample data
    const now = new Date()
    return [
      { id: 1, title: 'New potential match found', message: 'We found an item that may match your lost report.', createdAt: new Date(now.getTime() - 15 * 60_000).toISOString(), read: false, type: 'match' },
      { id: 2, title: 'Claim approved', message: 'Your claim for “Black Wallet” was approved. Check pickup details.', createdAt: new Date(now.getTime() - 2 * 60 * 60_000).toISOString(), read: false, type: 'status' },
      { id: 3, title: 'Reminder', message: 'Remember to bring a valid ID when picking up items.', createdAt: new Date(now.getTime() - 26 * 60 * 60_000).toISOString(), read: true, type: 'system' },
    ]
  }
}

export async function markNotificationRead(notificationId: number, userId?: number): Promise<NotificationDto | null> {
  const qs = new URLSearchParams()
  if (typeof userId === 'number') qs.set('userId', String(userId))
  const res = await fetch(`${API_BASE}/notifications/${notificationId}/read${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'PATCH', headers: authHeaders(userId) })
  const data = await res.json().catch(() => ({})) as { notification?: NotificationDto }
  if (!res.ok) return null
  return data.notification ?? null
}

export function subscribeNotifications(userId: number): EventSource {
  const url = `${API_BASE}/notifications/stream?userId=${encodeURIComponent(String(userId))}`
  const es = new EventSource(url)
  return es
}

// Items (DB-backed)
export type CreateLostItemInput = {
  title: string
  description?: string
  location?: string
  occurredOn?: string // yyyy-mm-dd
  photoFile?: File | null
}

// Found reports have the same input shape as lost reports
export type CreateFoundItemInput = CreateLostItemInput

export type ItemDto = {
  id: number
  type: 'lost' | 'found'
  title: string
  description?: string | null
  location?: string | null
  occurredOn?: string | null
  reportedAt?: string | null
  status: string
  photoUrl?: string | null
  photoThumbUrl?: string | null
  reporterUserId?: number | null
  reporter?: { id?: number | null; email?: string | null; firstName?: string | null; lastName?: string | null; studentId?: string | null } | null
}

export async function createLostItem(input: CreateLostItemInput, reporterUserId?: number): Promise<ItemDto> {
  const fd = new FormData()
  fd.set('type', 'lost')
  fd.set('title', input.title)
  if (input.description) fd.set('description', input.description)
  if (input.location) fd.set('location', input.location)
  if (input.occurredOn) fd.set('occurredOn', input.occurredOn)
  if (input.photoFile instanceof File) fd.set('photo', input.photoFile)
  const headers: Record<string, string> = authHeaders(reporterUserId)
  const res = await fetch(`${API_BASE}/items`, { method: 'POST', body: fd, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || 'Failed to submit report'
    throw new Error(msg)
  }
  const it = data as ItemDto
  it.photoUrl = normalizeImageUrl(it.photoUrl || undefined) ?? null
  it.photoThumbUrl = normalizeImageUrl(it.photoThumbUrl || undefined) ?? null
  return it
}

export async function createFoundItem(input: CreateFoundItemInput, reporterUserId?: number): Promise<ItemDto> {
  const fd = new FormData()
  fd.set('type', 'found')
  fd.set('title', input.title)
  if (input.description) fd.set('description', input.description)
  if (input.location) fd.set('location', input.location)
  if (input.occurredOn) fd.set('occurredOn', input.occurredOn)
  if (input.photoFile instanceof File) fd.set('photo', input.photoFile)
  const headers: Record<string, string> = authHeaders(reporterUserId)
  const res = await fetch(`${API_BASE}/items`, { method: 'POST', body: fd, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || 'Failed to submit report'
    throw new Error(msg)
  }
  const it = data as ItemDto
  it.photoUrl = normalizeImageUrl(it.photoUrl || undefined) ?? null
  it.photoThumbUrl = normalizeImageUrl(it.photoThumbUrl || undefined) ?? null
  return it
}

export async function listItems(params?: { type?: 'lost' | 'found', reporterUserId?: number, limit?: number }): Promise<ItemDto[]> {
  const qs = new URLSearchParams()
  if (params?.type) qs.set('type', params.type)
  if (typeof params?.reporterUserId === 'number') qs.set('reporterUserId', String(params.reporterUserId))
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit))
  const res = await fetch(`${API_BASE}/items${qs.toString() ? `?${qs.toString()}` : ''}`, { headers: authHeaders(params?.reporterUserId) })
  const data = await res.json().catch(() => ({})) as { items?: ItemDto[], error?: string }
  if (!res.ok) {
    const msg = (data && data.error) || 'Failed to load items'
    throw new Error(msg)
  }
  const items = (data.items ?? []) as ItemDto[]
  return items.map((it) => ({
    ...it,
    photoUrl: normalizeImageUrl(it.photoUrl || undefined) ?? null,
    photoThumbUrl: normalizeImageUrl(it.photoThumbUrl || undefined) ?? null,
  }))
}

// Admin Items search/filter and update
export type AdminItemUiStatus = 'unclaimed' | 'matched' | 'claim_pending' | 'claim_approved' | 'claim_rejected' | 'returned'
export type AdminItem = ItemDto & {
  uiStatus: AdminItemUiStatus
  reporter?: { id?: number | null; email?: string | null; firstName?: string | null; lastName?: string | null; studentId?: string | null } | null
}

export async function adminListItems(params?: { q?: string; type?: 'lost' | 'found'; uiStatus?: AdminItemUiStatus; reporter?: string; dateFrom?: string; dateTo?: string; limit?: number }): Promise<AdminItem[]> {
  const qs = new URLSearchParams()
  if (params?.q) qs.set('q', params.q)
  if (params?.type) qs.set('type', params.type)
  if (params?.uiStatus) qs.set('uiStatus', params.uiStatus)
  if (params?.reporter) qs.set('reporter', params.reporter)
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params?.dateTo) qs.set('dateTo', params.dateTo)
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit))
  const res = await fetch(`${API_BASE}/admin/items${qs.toString() ? `?${qs.toString()}` : ''}`, { headers: authHeaders() })
  const data = await res.json().catch(() => ({})) as { items?: AdminItem[]; error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to load admin items')
  const items = (data.items ?? []) as AdminItem[]
  return items.map((it) => ({
    ...it,
    photoUrl: normalizeImageUrl(it.photoUrl || undefined) ?? null,
    photoThumbUrl: normalizeImageUrl((it as unknown as ItemDto).photoThumbUrl || undefined) ?? null,
  }))
}

export type UpdateAdminItemInput = Partial<{ title: string; description: string | null; location: string | null; occurredOn: string | null; statusUi: AdminItemUiStatus }>
export async function adminUpdateItem(itemId: number, payload: UpdateAdminItemInput): Promise<AdminItem> {
  const res = await fetch(`${API_BASE}/admin/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({})) as { item?: AdminItem; error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to update item')
  return (data.item as AdminItem)
}

export async function adminMarkReturned(itemId: number): Promise<AdminItem> {
  const res = await fetch(`${API_BASE}/admin/items/${itemId}/return`, { method: 'POST', headers: authHeaders() })
  const data = await res.json().catch(() => ({})) as { item?: AdminItem; error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to mark returned')
  return (data.item as AdminItem)
}

export async function adminDeleteItem(itemId: number): Promise<{ deleted: boolean; id: number }> {
  const res = await fetch(`${API_BASE}/admin/items/${itemId}`, { method: 'DELETE', headers: authHeaders() })
  const data = await res.json().catch(() => ({})) as { deleted?: boolean; id?: number; error?: string }
  if (!res.ok || !data.deleted) throw new Error((data && data.error) || 'Failed to delete item')
  return { deleted: true, id: Number(data.id || itemId) }
}

// QR Codes
export type QrCodeDto = { code: string; itemId?: number | null; scanCount?: number; lastScannedAt?: string | null; url?: string; canonicalUrl?: string }
export async function getItemQrCode(itemId: number): Promise<QrCodeDto | null> {
  const res = await fetch(`${API_BASE}/qrcodes/item/${itemId}`, { headers: authHeaders() })
  const data = await res.json().catch(() => ({})) as { qrcode?: QrCodeDto | null; error?: string }
  if (!res.ok) return null
  return data.qrcode ?? null
}
export async function createItemQrCode(itemId: number, regenerate = false): Promise<QrCodeDto> {
  const res = await fetch(`${API_BASE}/qrcodes/item/${itemId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ regenerate }) })
  const data = await res.json().catch(() => ({})) as { qrcode?: QrCodeDto; error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to create QR code')
  return (data.qrcode as QrCodeDto)
}
export type ScanResult = { item?: ItemDto; qrcode?: QrCodeDto; instructions?: string; error?: string }
export async function scanQrCode(code: string): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/qrcodes/${encodeURIComponent(code)}/item`)
  const data = await res.json().catch(() => ({})) as ScanResult
  if (!res.ok) throw new Error((data && (data.error as string)) || 'QR code not found')
  return data
}

// Auto-found reporting: scan a QR code belonging to a LOST item and auto-create a FOUND report
export type AutoFoundResponse = {
  lostItem: ItemDto
  foundItem: ItemDto
  match: { lostItemId: number; foundItemId: number; score: number; status: string }
  message?: string
} | { error: string; detail?: string }

export async function autoReportFoundFromQr(code: string, params?: { reporterUserId?: number; location?: string }): Promise<AutoFoundResponse> {
  const body: Record<string, unknown> = {}
  // Reporter inferred via header now; legacy body field omitted unless older backend
  if (params?.location) body.location = params.location
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders(params?.reporterUserId) }
  const res = await fetch(`${API_BASE}/qrcodes/${encodeURIComponent(code)}/auto-found`, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({})) as AutoFoundResponse
  if (!res.ok) return data
  return data
}

// Claims
export type ClaimUserLite = {
  id?: number
  email?: string
  firstName?: string
  lastName?: string
  studentId?: string | null
}

export type ClaimItemLite = {
  id?: number
  title?: string
  type?: 'lost' | 'found' | string
  location?: string | null
  status?: string
  photoUrl?: string | null
}

export type ClaimDto = {
  id: number
  itemId: number
  claimantUserId: number
  status: 'requested' | 'verified' | 'approved' | 'rejected' | 'cancelled'
  createdAt?: string | null
  approvedAt?: string | null
  notes?: string | null
  item?: ClaimItemLite
  user?: ClaimUserLite
  matchScore?: number
  adminNote?: string | null
  returned?: boolean
  returnClaimerUserId?: number | null
  returnClaimerName?: string | null
  returnOverride?: boolean | null
}

type ClaimRecord = {
  id: number
  itemId: number
  claimantId: number
  status: ClaimDto['status']
  createdAt?: string | null
  approvedAt?: string | null
  notes?: string | null
  item?: ClaimItemLite
  user?: ClaimUserLite
  adminNote?: string | null
  returned?: boolean
  returnClaimerUserId?: number | null
  returnClaimerName?: string | null
  returnOverride?: boolean | null
}

export async function requestClaim(itemId: number, claimantUserId: number, notes?: string): Promise<ClaimDto> {
  // Delegate to createClaim to keep one code-path and consistent mapping
  return createClaim(itemId, claimantUserId, notes)
}

export async function listClaims(params?: { claimantUserId?: number, itemId?: number, status?: string, limit?: number }): Promise<ClaimDto[]> {
  const qs = new URLSearchParams()
  if (typeof params?.claimantUserId === 'number') qs.set('claimantId', String(params.claimantUserId))
  if (typeof params?.itemId === 'number') qs.set('itemId', String(params.itemId))
  if (params?.status) qs.set('status', params.status)
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit))
  const res = await fetch(`${API_BASE}/claims${qs.toString() ? `?${qs.toString()}` : ''}`, { headers: authHeaders(params?.claimantUserId) })
  const data = await res.json().catch(() => ({})) as { claims?: ClaimRecord[], error?: string }
  if (!res.ok) {
    const msg = (data && data.error) || 'Failed to load claims'
    throw new Error(msg)
  }
  return (data.claims ?? []).map((c: ClaimRecord) => ({
    id: c.id,
    itemId: c.itemId,
    claimantUserId: c.claimantId,
    status: c.status,
    createdAt: c.createdAt ?? null,
    approvedAt: c.approvedAt ?? null,
    notes: c.notes ?? null,
  item: c.item ? { ...c.item, photoUrl: (normalizeImageUrl(c.item.photoUrl || undefined) ?? null) } : c.item,
  user: c.user,
  adminNote: c.adminNote ?? null,
  returned: c.returned ?? false,
  returnClaimerUserId: c.returnClaimerUserId ?? null,
  returnClaimerName: c.returnClaimerName ?? null,
  returnOverride: c.returnOverride ?? null,
  }))
}

// Compatibility helper for current UI usage
export async function createClaim(itemId: number, claimantId: number, notes?: string): Promise<ClaimDto> {
  const res = await fetch(`${API_BASE}/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(claimantId) },
    body: JSON.stringify({ itemId, claimantId, notes }),
  })
  const data = await res.json().catch(() => ({})) as { claim?: ClaimRecord, error?: string }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Failed to create claim')
  }
  const c = data.claim as ClaimRecord
  return {
    id: c.id,
    itemId: c.itemId,
    claimantUserId: c.claimantId,
    status: c.status,
    createdAt: c.createdAt ?? null,
    approvedAt: c.approvedAt ?? null,
    notes: c.notes ?? null,
    item: c.item,
    user: c.user,
  adminNote: c.adminNote ?? null,
  returned: c.returned ?? false,
  returnClaimerUserId: c.returnClaimerUserId ?? null,
  returnClaimerName: c.returnClaimerName ?? null,
  returnOverride: c.returnOverride ?? null,
  }
}

export async function updateClaimStatus(
  claimId: number,
  status: 'pending' | 'approved' | 'rejected',
  notes?: string,
  adminNotes?: string,
  adminId?: number,
  currentUserId?: number,
): Promise<ClaimDto> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders(currentUserId) }
  const res = await fetch(`${API_BASE}/claims/${claimId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status, notes, adminId, adminNotes }),
  })
  const data = await res.json().catch(() => ({})) as { claim?: ClaimRecord, error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to update claim')
  const c = data.claim as ClaimRecord
  return {
    id: c.id,
    itemId: c.itemId,
    claimantUserId: c.claimantId,
    status: c.status,
    createdAt: c.createdAt ?? null,
    approvedAt: c.approvedAt ?? null,
    notes: c.notes ?? null,
    item: c.item,
    user: c.user,
  adminNote: c.adminNote ?? null,
  returned: c.returned ?? false,
  returnClaimerUserId: c.returnClaimerUserId ?? null,
  returnClaimerName: c.returnClaimerName ?? null,
  returnOverride: c.returnOverride ?? null,
  }
}

export async function markClaimReturned(claimId: number, currentUserId?: number, override?: { claimerUserId?: number; claimerName?: string }): Promise<ClaimDto> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders(currentUserId) }
  const body: Record<string, unknown> = {}
  if (override?.claimerUserId) body.claimerUserId = override.claimerUserId
  if (override?.claimerName) body.claimerName = override.claimerName
  const res = await fetch(`${API_BASE}/claims/${claimId}/return`, { method: 'POST', headers, body: Object.keys(body).length ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({})) as { claim?: ClaimRecord, error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to mark returned')
  const c = data.claim as ClaimRecord
  return {
    id: c.id,
    itemId: c.itemId,
    claimantUserId: c.claimantId,
    status: c.status,
    createdAt: c.createdAt ?? null,
    approvedAt: c.approvedAt ?? null,
    notes: c.notes ?? null,
    item: c.item,
    user: c.user,
  adminNote: c.adminNote ?? null,
  }
}

export async function getClaim(claimId: number): Promise<ClaimDto | null> {
  const res = await fetch(`${API_BASE}/claims/${claimId}`, { headers: authHeaders() })
  const data = await res.json().catch(() => ({})) as { claim?: ClaimRecord, error?: string }
  if (!res.ok) return null
  const c = data.claim as ClaimRecord | undefined
  if (!c) return null
  return {
    id: c.id,
    itemId: c.itemId,
    claimantUserId: c.claimantId,
    status: c.status,
    createdAt: c.createdAt ?? null,
    approvedAt: c.approvedAt ?? null,
    notes: c.notes ?? null,
    item: c.item,
    user: c.user,
    adminNote: c.adminNote ?? null,
    returned: c.returned ?? false,
    returnClaimerUserId: c.returnClaimerUserId ?? null,
    returnClaimerName: c.returnClaimerName ?? null,
    returnOverride: c.returnOverride ?? null,
  }
}

// Registration
export type RegisterStudentInput = {
  studentId: string
  firstName: string
  middleName?: string
  lastName: string
  email: string
  password: string
}

export type UserLite = {
  id: number
  email: string
  role: 'student' | 'admin'
  token?: string
  studentId?: string
  firstName?: string
  middleName?: string | null
  lastName?: string
}

export async function registerStudent(input: RegisterStudentInput): Promise<UserLite> {
  const res = await fetch(`${API_BASE}/auth/register/student`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || 'Registration failed'
    throw new Error(msg)
  }
  return data as UserLite
}

export async function loginUser(params: { email: string; password: string }): Promise<UserLite> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || 'Login failed'
    throw new Error(msg)
  }
  return data as UserLite
}

// Admin creation
export type CreateAdminInput = {
  email: string
  firstName: string
  middleName?: string
  lastName: string
  password: string
}

export async function createAdmin(input: CreateAdminInput): Promise<UserLite> {
  const res = await fetch(`${API_BASE}/auth/register/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || 'Failed to create admin'
    throw new Error(msg)
  }
  return data as UserLite
}

// Smart Search & Matches
export type SmartCandidate = {
  id: number
  type: 'lost' | 'found'
  title: string
  description?: string | null
  location?: string | null
  occurredOn?: string | null
  reportedAt?: string | null
  status: string
  photoUrl?: string | null
}

export type SmartMatch = {
  lostItem: number | null
  foundItem: number | null
  score: number
  candidate: SmartCandidate
}

export async function smartSearch(params: { itemId?: number, q?: string, type?: 'lost' | 'found', location?: string, date?: string, limit?: number }): Promise<SmartMatch[]> {
  const qs = new URLSearchParams()
  if (typeof params.itemId === 'number') qs.set('itemId', String(params.itemId))
  if (params.q) qs.set('q', params.q)
  if (params.type) qs.set('type', params.type)
  if (params.location) qs.set('location', params.location)
  if (params.date) qs.set('date', params.date)
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit))
  const res = await fetch(`${API_BASE}/search/smart${qs.toString() ? `?${qs.toString()}` : ''}`)
  const data = await res.json().catch(() => ({})) as { matches?: SmartMatch[], error?: string }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Smart search failed')
  }
  return data.matches ?? []
}

export type Suggestion = { lostItemId: number; foundItemId: number; score: number; candidate: ItemDto }

export async function getSuggestionsForItem(itemId: number, limit = 5, threshold = 0.5): Promise<Suggestion[]> {
  const qs = new URLSearchParams({ itemId: String(itemId), limit: String(limit), threshold: String(threshold) })
  const res = await fetch(`${API_BASE}/matches/suggestions?${qs.toString()}`)
  const data = await res.json().catch(() => ({})) as { suggestions?: Suggestion[], error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to load suggestions')
  return data.suggestions ?? []
}

export type MatchRecord = { id: number, lostItemId: number, foundItemId: number, score: number, status: 'pending' | 'confirmed' | 'dismissed', createdAt?: string | null }

export async function upsertMatch(lostItemId: number, foundItemId: number, score: number): Promise<MatchRecord> {
  const res = await fetch(`${API_BASE}/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lostItemId, foundItemId, score }),
  })
  const data = await res.json().catch(() => ({})) as { match?: MatchRecord, error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to save match')
  return data.match as MatchRecord
}

export async function confirmMatch(matchId: number): Promise<MatchRecord> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/confirm`, { method: 'POST' })
  const data = await res.json().catch(() => ({})) as { match?: MatchRecord, error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to confirm match')
  return data.match as MatchRecord
}

export async function dismissMatch(matchId: number): Promise<MatchRecord> {
  const res = await fetch(`${API_BASE}/matches/${matchId}/dismiss`, { method: 'POST' })
  const data = await res.json().catch(() => ({})) as { match?: MatchRecord, error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to dismiss match')
  return data.match as MatchRecord
}

// Matches with items (for Admin Items page)
export type MatchWithItems = MatchRecord & {
  lostItem?: ItemDto
  foundItem?: ItemDto
}

export async function listMatches(params?: { status?: 'pending' | 'confirmed' | 'dismissed', limit?: number, includeItems?: boolean }): Promise<MatchWithItems[]> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit))
  if (params?.includeItems) qs.set('includeItems', '1')
  const res = await fetch(`${API_BASE}/matches${qs.toString() ? `?${qs.toString()}` : ''}`)
  const data = await res.json().catch(() => ({})) as { matches?: unknown[], error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to load matches')
  const rows: unknown[] = Array.isArray(data.matches) ? data.matches as unknown[] : []
  return rows.map((raw) => {
    const m = (raw ?? {}) as Record<string, unknown>
    const base: MatchRecord = {
      id: Number((m.id as number | string | undefined) ?? 0),
      lostItemId: Number((m.lostItemId as number | string | undefined) ?? (m.lost_item_id as number | string | undefined) ?? 0),
      foundItemId: Number((m.foundItemId as number | string | undefined) ?? (m.found_item_id as number | string | undefined) ?? 0),
      score: Number((m.score as number | string | undefined) ?? 0),
      status: (m.status as 'pending'|'confirmed'|'dismissed' | undefined) ?? 'pending',
      createdAt: (m.createdAt as string | undefined) ?? (m.created_at as string | undefined) ?? null,
    }
    const lost = (m.lostItem as Record<string, unknown> | undefined)
    const found = (m.foundItem as Record<string, unknown> | undefined)
    return {
      ...base,
      lostItem: lost ? {
        id: Number((lost.id as number | string | undefined) ?? base.lostItemId),
        type: (lost.type as 'lost' | 'found' | undefined) ?? 'lost',
        title: String((lost.title as string | undefined) ?? `Item #${(lost.id as number | string | undefined) ?? base.lostItemId}`),
        description: (lost.description as string | null | undefined) ?? null,
        location: (lost.location as string | null | undefined) ?? null,
        occurredOn: (lost.occurredOn as string | null | undefined) ?? null,
        reportedAt: (lost.reportedAt as string | null | undefined) ?? null,
        status: String((lost.status as string | undefined) ?? 'open'),
        photoUrl: (lost.photoUrl as string | null | undefined) ?? null,
        photoThumbUrl: (lost.photoThumbUrl as string | null | undefined) ?? null,
        reporterUserId: (lost.reporterUserId as number | null | undefined) ?? null,
      } : undefined,
      foundItem: found ? {
        id: Number((found.id as number | string | undefined) ?? base.foundItemId),
        type: (found.type as 'lost' | 'found' | undefined) ?? 'found',
        title: String((found.title as string | undefined) ?? `Item #${(found.id as number | string | undefined) ?? base.foundItemId}`),
        description: (found.description as string | null | undefined) ?? null,
        location: (found.location as string | null | undefined) ?? null,
        occurredOn: (found.occurredOn as string | null | undefined) ?? null,
        reportedAt: (found.reportedAt as string | null | undefined) ?? null,
        status: String((found.status as string | undefined) ?? 'open'),
        photoUrl: (found.photoUrl as string | null | undefined) ?? null,
        photoThumbUrl: (found.photoThumbUrl as string | null | undefined) ?? null,
        reporterUserId: (found.reporterUserId as number | null | undefined) ?? null,
      } : undefined,
    }
  })
}

// Admin: Stats & Management
export type AdminDailyStats = {
  newReports: number
  pendingClaims: number
  successfulReturns: number
}

export async function getAdminDailyStats(): Promise<AdminDailyStats> {
  const res = await fetch(`${API_BASE}/admin/stats/daily`)
  const data = await res.json().catch(() => ({})) as Partial<AdminDailyStats> & { error?: string }
  if (!res.ok) {
    // Fully dynamic: surface zeros on failure; caller can decide UI
    return { newReports: 0, pendingClaims: 0, successfulReturns: 0 }
  }
  const nr = typeof data.newReports === 'number' ? data.newReports : Number((data as Record<string, unknown>).newReports)
  const pc = typeof data.pendingClaims === 'number' ? data.pendingClaims : Number((data as Record<string, unknown>).pendingClaims)
  const sr = typeof data.successfulReturns === 'number' ? data.successfulReturns : Number((data as Record<string, unknown>).successfulReturns)
  return {
    newReports: Number.isFinite(nr) ? nr : 0,
    pendingClaims: Number.isFinite(pc) ? pc : 0,
    successfulReturns: Number.isFinite(sr) ? sr : 0,
  }
}

// Admin: Overview Totals
export type AdminOverviewStats = { lost: number; found: number; claimed: number; returned: number; pending: number }
export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const res = await fetch(`${API_BASE}/admin/stats/overview`)
  const data = await res.json().catch(() => ({})) as Partial<AdminOverviewStats> & { error?: string }
  if (!res.ok) return { lost: 0, found: 0, claimed: 0, returned: 0, pending: 0 }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) ? v : Number(v) || 0
  return {
    lost: num(data.lost),
    found: num(data.found),
    claimed: num(data.claimed),
    returned: num(data.returned),
    pending: num(data.pending),
  }
}

// Admin: Reports time-series (lost/found)
export type ReportsPoint = { date: string; lost: number; found: number; total: number }
export async function getAdminReportsSeries(days = 30): Promise<ReportsPoint[]> {
  const ds = Math.max(1, Math.min(180, days))
  const res = await fetch(`${API_BASE}/admin/stats/reports_series?days=${ds}`)
  const data = await res.json().catch(() => ({})) as { points?: unknown[] }
  if (!res.ok) return []
  const points = Array.isArray(data.points) ? data.points : []
  return points.map((p) => {
    const o = (p as Record<string, unknown>) || {}
    return {
      date: typeof o.date === 'string' ? o.date : '',
      lost: Number(o.lost) || 0,
      found: Number(o.found) || 0,
      total: Number(o.total) || ((Number(o.lost) || 0) + (Number(o.found) || 0)),
    }
  })
}

export type AuditEvent = {
  id: number | string
  type: string
  message: string
  userEmail?: string | null
  createdAt: string
}

export async function listAuditEvents(limit = 8): Promise<AuditEvent[]> {
  const qs = new URLSearchParams()
  if (typeof limit === 'number') qs.set('limit', String(limit))
  const res = await fetch(`${API_BASE}/audit${qs.toString() ? `?${qs.toString()}` : ''}`)
  const data = await res.json().catch(() => ({})) as { events?: unknown[] }
  if (!res.ok) return []
  const events = Array.isArray(data.events) ? data.events : []
  return events.map((raw, i) => {
    const e = raw as Record<string, unknown>
    const user = (e.user as Record<string, unknown>) || {}
    return {
      id: (typeof e.id === 'string' || typeof e.id === 'number') ? (e.id as string | number) : i,
      type: typeof e.type === 'string' ? (e.type as string) : 'event',
      message: typeof e.message === 'string' ? (e.message as string) : 'Activity',
      userEmail: typeof user.email === 'string' ? (user.email as string) : null,
      createdAt: typeof e.created_at === 'string' ? (e.created_at as string) : (typeof e.createdAt === 'string' ? (e.createdAt as string) : new Date().toISOString()),
    } satisfies AuditEvent
  })
}

export type UrgentClaimLite = {
  id: number | string
  itemTitle?: string
  userEmail?: string | null
  createdAt: string
}

export async function listUrgentClaims(limit = 5): Promise<UrgentClaimLite[]> {
  const qs = new URLSearchParams({ status: 'pending', priority: 'urgent', limit: String(limit) })
  const res = await fetch(`${API_BASE}/claims?${qs.toString()}`)
  const data = await res.json().catch(() => ({})) as { claims?: unknown[] }
  if (!res.ok) return []
  const claims = Array.isArray(data.claims) ? data.claims : []
  return claims.map((raw, i) => {
    const c = raw as Record<string, unknown>
    const item = (c.item as Record<string, unknown>) || {}
    const user = (c.user as Record<string, unknown>) || {}
    return {
      id: (typeof c.id === 'string' || typeof c.id === 'number') ? (c.id as string | number) : i,
      itemTitle: typeof item.title === 'string' ? (item.title as string) : (typeof item.name === 'string' ? (item.name as string) : undefined),
      userEmail: typeof user.email === 'string' ? (user.email as string) : null,
      createdAt: typeof c.created_at === 'string' ? (c.created_at as string) : (typeof c.createdAt === 'string' ? (c.createdAt as string) : new Date().toISOString()),
    } satisfies UrgentClaimLite
  })
}

export type PendingMatchLite = {
  id: number | string
  itemTitle?: string
  claimantEmail?: string | null
  confidence?: number
}

export async function listPendingMatches(limit = 5): Promise<PendingMatchLite[]> {
  const qs = new URLSearchParams({ status: 'pending', limit: String(limit) })
  const res = await fetch(`${API_BASE}/matches?${qs.toString()}`)
  const data = await res.json().catch(() => ({})) as { matches?: unknown[] }
  if (!res.ok) return []
  const matches = Array.isArray(data.matches) ? data.matches : []
  return matches.map((raw, i) => {
    const m = raw as Record<string, unknown>
    const item = (m.item as Record<string, unknown>) || {}
    const claim = (m.claim as Record<string, unknown>) || {}
    const user = (claim.user as Record<string, unknown>) || {}
    return {
      id: (typeof m.id === 'string' || typeof m.id === 'number') ? (m.id as string | number) : i,
      itemTitle: typeof item.title === 'string' ? (item.title as string) : (typeof item.name === 'string' ? (item.name as string) : undefined),
      claimantEmail: typeof user.email === 'string' ? (user.email as string) : null,
      confidence: typeof m.confidence === 'number' ? (m.confidence as number) : Number(m.confidence) || undefined,
    } satisfies PendingMatchLite
  })
}

// Admin: Users management
export type AdminUserRecord = {
  id: number
  email: string
  role: 'student' | 'admin'
  studentId?: string | null
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  lastLoginAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  itemsReported?: number
  claimsMade?: number
  unreadNotifications?: number
}

export type ListUsersParams = { q?: string; role?: 'student' | 'admin'; limit?: number; offset?: number }
export async function listUsers(params?: ListUsersParams): Promise<{ users: AdminUserRecord[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams()
  if (params?.q) qs.set('q', params.q)
  if (params?.role) qs.set('role', params.role)
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit))
  if (typeof params?.offset === 'number') qs.set('offset', String(params.offset))
  const res = await fetch(`${API_BASE}/users${qs.toString() ? `?${qs.toString()}` : ''}`)
  const data = await res.json().catch(() => ({})) as { users?: AdminUserRecord[]; total?: number; limit?: number; offset?: number; error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to load users')
  return {
    users: data.users ?? [],
    total: typeof data.total === 'number' ? data.total : 0,
    limit: typeof data.limit === 'number' ? data.limit : (params?.limit ?? 50),
    offset: typeof data.offset === 'number' ? data.offset : (params?.offset ?? 0),
  }
}

export type UpdateUserInput = Partial<{
  email: string
  studentId: string | null
  firstName: string | null
  middleName: string | null
  lastName: string | null
  role: 'student' | 'admin'
  currentPassword: string
  newPassword: string
}>

export async function updateUser(userId: number, payload: UpdateUserInput): Promise<AdminUserRecord> {
  const res = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({})) as { user?: AdminUserRecord; error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to update user')
  return (data.user as AdminUserRecord)
}

// Admin Settings: Social (Facebook auto-post)
export type AdminSettings = {
  social?: { facebook?: { autoPost?: boolean } }
} | Record<string, unknown>

export async function getAdminSettings(): Promise<AdminSettings> {
  const res = await fetch(`${API_BASE}/admin/settings`)
  const data = await res.json().catch(() => ({})) as { settings?: AdminSettings }
  if (!res.ok) return {}
  return data.settings ?? {}
}

export async function updateAdminSettings(settings: AdminSettings): Promise<AdminSettings> {
  const res = await fetch(`${API_BASE}/admin/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  // We don't strictly need the response beyond status
  await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('Failed to update settings')
  return settings
}

// Social posts
export type SocialPostDto = {
  id: number
  platform: 'facebook'
  status: 'queued' | 'sent' | 'failed' | string
  message?: string
  linkUrl?: string | null
  postExternalId?: string | null
  postedAt?: string | null
  createdAt?: string | null
  item?: { id?: number, type?: string, title?: string, location?: string | null, photoUrl?: string | null }
}

export async function listSocialPosts(limit = 50): Promise<SocialPostDto[]> {
  const res = await fetch(`${API_BASE}/social/posts?limit=${limit}`)
  const data = await res.json().catch(() => ({})) as { posts?: SocialPostDto[] }
  if (!res.ok) return []
  const posts = (data.posts ?? []) as SocialPostDto[]
  return posts.map((p) => ({
    ...p,
    item: p.item ? { ...p.item, photoUrl: normalizeImageUrl(p.item.photoUrl || undefined) ?? null } : p.item,
  }))
}

export async function createSocialPost(itemId: number, message?: string, link?: string): Promise<SocialPostDto> {
  const res = await fetch(`${API_BASE}/social/posts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, message, link })
  })
  const data = await res.json().catch(() => ({})) as { post?: SocialPostDto, error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to create post')
  return (data.post as SocialPostDto)
}

export async function retrySocialPost(postId: number): Promise<SocialPostDto> {
  const res = await fetch(`${API_BASE}/social/posts/${postId}/retry`, { method: 'POST' })
  const data = await res.json().catch(() => ({})) as { post?: SocialPostDto, error?: string }
  if (!res.ok) throw new Error((data && data.error) || 'Failed to retry post')
  return (data.post as SocialPostDto)
}

export type SocialStatus = { facebook?: { autoPost?: boolean, pageConfigured?: boolean, tokenConfigured?: boolean } } | Record<string, unknown>
export async function getSocialStatus(): Promise<SocialStatus> {
  const res = await fetch(`${API_BASE}/social/status`)
  const data = await res.json().catch(() => ({})) as SocialStatus
  if (!res.ok) return {}
  return data
}

export async function getFacebookCredentials(): Promise<{ pageId?: string, hasToken?: boolean }> {
  const res = await fetch(`${API_BASE}/social/facebook/credentials`)
  const data = await res.json().catch(() => ({})) as { pageId?: string, hasToken?: boolean }
  if (!res.ok) return { pageId: '', hasToken: false }
  return data
}

export async function updateFacebookCredentials(pageId: string, pageAccessToken?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/social/facebook/credentials`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId, pageAccessToken })
  })
  await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('Failed to update credentials')
}

// QR Codes
export type QrCodeInfo = { code: string; itemId?: number | null; scanCount?: number; lastScannedAt?: string | null; url?: string }
export type QrResolved = { item?: ItemDto; qrcode?: QrCodeInfo; instructions?: string } | { error: string }

export async function resolveQrCode(code: string): Promise<QrResolved> {
  const res = await fetch(`${API_BASE}/qrcodes/${encodeURIComponent(code)}/item`)
  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  const errMsg = typeof (raw && (raw as Record<string, unknown>).error) === 'string'
    ? String((raw as Record<string, unknown>).error)
    : 'QR code not found'
  const data: QrResolved = (raw && (('item' in raw) || ('qrcode' in raw) || ('instructions' in raw)))
    ? (raw as unknown as QrResolved)
    : ({ error: errMsg })
  if (!res.ok) {
    const msg = (data as { error?: string }).error || 'QR code not found'
    throw new Error(msg)
  }
  return data
}

export async function getItemQr(itemId: number): Promise<QrCodeInfo | null> {
  const res = await fetch(`${API_BASE}/qrcodes/item/${itemId}`)
  const data = await res.json().catch(() => ({})) as { qrcode?: QrCodeInfo; error?: string }
  if (!res.ok) return null
  return data.qrcode ?? null
}
