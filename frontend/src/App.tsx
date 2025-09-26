import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import ccsLogo from './assets/ccsbackground.jpg'
import { useAuth } from './lib/useAuth'
import { getUserNotifications, markNotificationRead, subscribeNotifications, type NotificationDto } from './lib/api'

type NotificationPayload = {
  kind?: 'match' | string
  lostItemId?: number
  foundItemId?: number
  score?: number
  category?: string
  base?: { id?: number, type?: 'lost' | 'found', title?: string, location?: string | null, occurredOn?: string | null }
  candidate?: { id?: number, type?: 'lost' | 'found', title?: string, location?: string | null, occurredOn?: string | null }
} | undefined

function AppLayout() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationDto[]>([])
  const { user, logout, ready } = useAuth()
  const profileRef = useRef<HTMLDivElement | null>(null)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Close profile dropdown on outside click or ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setProfileOpen(false); setNotifOpen(false) }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [profileOpen, notifOpen])

  // Load notifications when the bell menu is opened the first time
  useEffect(() => {
    if (notifOpen && user) {
      getUserNotifications(user.id, 10).then(setNotifications).catch(() => {})
    }
  }, [notifOpen, user])

  // Real-time notifications via SSE
  useEffect(() => {
    if (!user) {
      if (esRef.current) { esRef.current.close(); esRef.current = null }
      return
    }
    const es = subscribeNotifications(user.id)
    esRef.current = es
    es.addEventListener('notification', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { notification?: NotificationDto }
        if (data && data.notification) {
          setNotifications(prev => [data.notification!, ...prev].slice(0, 20))
        }
      } catch {
        // ignore parse errors
      }
    })
    // Optional ping handler to keep alive
    const onError = () => {
      // Reconnect basic strategy
      try { es.close() } catch { /* ignore */ }
      setTimeout(() => {
        if (user) {
          const retry = subscribeNotifications(user.id)
          esRef.current = retry
        }
      }, 3000)
    }
    es.onerror = onError
    return () => {
      try { es.close() } catch { /* ignore */ }
      esRef.current = null
    }
  }, [user])

  function onClickNotification(n: NotificationDto) {
    // Mark read optimistically for any click
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    if (user) { markNotificationRead(n.id, user.id).catch(() => {}) }
    // If notification payload indicates a match, route to dashboard and focus recommendations
    try {
      const p = (n as unknown as { payload?: NotificationPayload }).payload
      if (p && (p.kind === 'match' || (typeof p.lostItemId === 'number' && typeof p.foundItemId === 'number'))) {
        setNotifOpen(false)
        navigate('/dashboard')
        // Small delay to allow dashboard render, then scroll to AI Recommendations section
        setTimeout(() => {
          const el = document.querySelector('#recommendations') as HTMLElement | null
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 50)
        return
      }
    } catch {
      // ignore
    }
  }

  function getInitials() {
    const first = (user?.firstName || '').trim()
    const last = (user?.lastName || '').trim()
    if (first || last) return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase()
    const email = user?.email || ''
    return email ? email[0]!.toUpperCase() : 'U'
  }

  function getFullName() {
    const first = (user?.firstName || '').trim()
    const last = (user?.lastName || '').trim()
    const name = [first, last].filter(Boolean).join(' ')
    return name || user?.email || 'Account'
  }
  return (
  <div className="min-h-screen flex flex-col bg-[color:var(--surface)] text-[var(--ink)] font-sans" style={{ fontFamily: 'var(--font-sans)' }}>
  <header className="sticky top-0 z-50 border-b border-black/5 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow-sm">
  {/* Accent gradient strip using brand palette */}
  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <NavLink to={user ? '/dashboard' : '/'} className="inline-flex items-center gap-2 text-xl font-extrabold text-[color:var(--brand)]">
            <img src={ccsLogo} alt="CCS logo" className="h-7 w-7 rounded-sm ring-1 ring-black/10 bg-white object-contain" />
            CCS Lost & Found
          </NavLink>
          {/* Desktop nav: show nothing until auth is ready to avoid flicker/mismatch */}
          {!ready ? null : user ? (
            <nav className="hidden md:flex items-center gap-1 text-sm">
              <NavLink to="/dashboard" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                Dashboard
              </NavLink>
              <NavLink to="/report/lost" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                Report Lost
              </NavLink>
              <NavLink to="/report/found" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                Report Found
              </NavLink>
              <NavLink to="/search" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                Search Items
              </NavLink>
              <NavLink to="/my-reports" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                My Reports
              </NavLink>
              {/* Notifications bell */}
              <div className="relative ml-1" ref={notifRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={notifOpen}
                  aria-label="Open notifications"
                  onClick={() => { setNotifOpen(v => !v); setProfileOpen(false) }}
                  className={`relative inline-flex items-center justify-center size-9 rounded-full ring-1 ring-black/10 bg-white/70 transition-colors transition-transform duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40 ${notifOpen ? 'ring-[color:var(--brand)]/40 bg-white/95' : 'hover:bg-white/90 hover:ring-black/15'}`}
                >
                  <svg className="size-5 text-[var(--ink-800)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  {/* Unread dot */}
                  {notifications.some(n => !n.read) && (
                    <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[color:var(--accent)] ring-2 ring-white" aria-hidden />
                  )}
                </button>
                {notifOpen && (
                  <div role="menu" aria-label="Notifications" className="absolute right-0 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-black/5 bg-white/95 backdrop-blur shadow-lg shadow-black/5 ring-1 ring-black/5 z-50">
                    <div className="px-3 py-2 text-xs text-[var(--ink-600)] flex items-center justify-between">
                      <span>Notifications</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-[color:var(--accent)]" />
                        <span>{notifications.filter(n => !n.read).length} new</span>
                      </span>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
                    <ul className="max-h-80 overflow-auto divide-y divide-black/5">
                      {notifications.length === 0 ? (
                        <li className="px-3 py-6 text-sm text-[var(--ink-600)] text-center">No notifications</li>
                      ) : notifications.map(n => {
                        const payload = (n as unknown as { payload?: NotificationPayload }).payload
                        const isMatch = !!payload && (payload.kind === 'match' || (payload.lostItemId && payload.foundItemId))
                        const score = payload && typeof payload.score === 'number' ? Math.round(payload.score) : undefined
                        const tagText = isMatch ? (payload?.category ? `${payload.category} Match` : 'Potential Match') : (n.type || 'Notice')
                        const subtitle = isMatch
                          ? `${payload?.candidate?.title ?? 'Item'}${payload?.candidate?.location ? ' • ' + payload.candidate.location : ''}${typeof score === 'number' ? ' • ' + score + '% match' : ''}`
                          : (n.message || '')
                        return (
                          <li key={n.id} className="px-3 py-2 hover:bg-black/5 transition-colors cursor-pointer" onClick={() => onClickNotification(n)}>
                            <div className="flex items-start gap-2">
                              <div className={`mt-0.5 size-2 rounded-full ${n.read ? 'bg-[var(--ink-400)]' : 'bg-[color:var(--accent)]'}`} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium text-[var(--ink)] truncate" title={n.title}>{n.title}</div>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${isMatch ? 'bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/20' : 'bg-black/5 text-[var(--ink-700)]'}`}>{tagText}</span>
                                </div>
                                {subtitle && <div className="text-xs text-[var(--ink-700)] truncate" title={subtitle}>{subtitle}</div>}
                                <div className="mt-0.5 text-[10px] text-[var(--ink-500)]">{new Date(n.createdAt).toLocaleString()}</div>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
              {/* Profile dropdown */}
              <div className="relative ml-1" ref={profileRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  onClick={() => { setProfileOpen(v => !v); setNotifOpen(false) }}
                  aria-label="Open account menu"
                  className={`group inline-flex items-center justify-center size-9 rounded-full ring-1 ring-black/10 bg-white/70 transition-colors transition-transform duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40 ${profileOpen ? 'ring-[color:var(--brand)]/40 bg-white/95' : 'hover:bg-white/90 hover:ring-black/15'}`}
                >
                  {/* Avatar */}
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="size-7 rounded-full object-cover ring-1 ring-[color:var(--brand)]/20 transition-transform duration-150 group-active:scale-95"
                    />
                  ) : (
                    <span className="inline-flex items-center justify-center size-7 rounded-full bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/20 font-semibold transition-transform duration-150 group-active:scale-95">
                      {getInitials()}
                      <span className="sr-only">Account</span>
                    </span>
                  )}
                </button>
        {profileOpen && (
                  <div
                    role="menu"
                    aria-label="Account menu"
          className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-black/5 bg-white/95 backdrop-blur shadow-lg shadow-black/5 ring-1 ring-black/5 z-50"
                  >
                    <div className="px-3 py-2 text-xs text-[var(--ink-600)]">Signed in as
                      <div className="truncate text-[var(--ink)] font-medium">{getFullName()}</div>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
                    <NavLink to="/settings" role="menuitem" onClick={() => setProfileOpen(false)} className={({isActive}: {isActive: boolean}) => `flex items-center gap-2 px-3 py-2.5 text-sm ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10' : 'hover:bg-black/5'}`}>
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1.82l.02.06a2 2 0 1 1-3.36 0l.02-.06A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.02a2 2 0 1 1-2.83-2.83l.06-.02A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.82-.33l-.06.02a2 2 0 1 1 0-3.36l.06.02A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 9 4.6c.36 0 .7-.12 1-.33A1.65 1.65 0 0 0 11.82 4l.06-.02a2 2 0 1 1 3.36 0l.06.02c.3.12.64.33 1 .33.55 0 1.07-.18 1.5-.5"/>
                      </svg>
                      Profile & Settings
                    </NavLink>
                    <button
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); logout() }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-black/5"
                    >
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <path d="M10 17l5-5-5-5"/>
                        <path d="M15 12H3"/>
                      </svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-1 text-sm">
              <NavLink to="/" end className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                Home
              </NavLink>
              <NavLink to="/search" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                  Browse Items
              </NavLink>
              <NavLink to="/how-it-works" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                How It Works
              </NavLink>
              <NavLink to="/contact" className={({isActive}: { isActive: boolean }) => `relative px-3 py-1.5 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>
                Contact
              </NavLink>
              {/* CTA: Login & Register */}
              <NavLink to="/login" className={({isActive}: { isActive: boolean }) => `ml-2 relative inline-flex items-center px-3 py-1.5 rounded-md font-medium transition-colors ring-1 ${isActive ? 'bg-[color:var(--brand)] text-white ring-[color:var(--accent)]/40' : 'bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-strong)] ring-[color:var(--accent)]/40'} shadow-sm`}>
                Login & Register
              </NavLink>
            </nav>
          )}
          {/* Mobile toggle */}
          <button aria-label="Toggle menu" className="md:hidden inline-flex items-center justify-center size-9 rounded-md ring-1 ring-black/10 bg-white/70 hover:bg-white/90 text-[color:var(--brand)] transition-colors" onClick={() => setOpen(v => !v)}>
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        {/* Mobile menu */}
        <div className={`${open ? 'block' : 'hidden'} md:hidden border-t border-black/5 bg-white/80 backdrop-blur`}>
          <nav className="mx-auto max-w-7xl px-4 py-2 grid gap-1 text-sm">
            {!ready ? null : user ? (
              <>
                <NavLink to="/dashboard" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Dashboard</NavLink>
                <NavLink to="/report/lost" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Report Lost</NavLink>
                <NavLink to="/report/found" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Report Found</NavLink>
                <NavLink to="/search" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Search Items</NavLink>
                <NavLink to="/my-reports" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>My Reports</NavLink>
                <NavLink to="/settings" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Profile/Settings</NavLink>
                <button onClick={() => { logout(); setOpen(false) }} className="mt-1 px-3 py-2 rounded-md transition-colors ring-1 bg-white text-[color:var(--brand)] hover:bg-[color:var(--brand)]/10 ring-[color:var(--brand)]/30 text-left">Logout</button>
              </>
            ) : (
              <>
                <NavLink to="/" end onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Home</NavLink>
                <NavLink to="/search" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Browse Unclaimed Items</NavLink>
                <NavLink to="/how-it-works" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>How It Works</NavLink>
                <NavLink to="/contact" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `px-3 py-2 rounded-md transition-colors ${isActive ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-1 ring-[color:var(--brand)]/20' : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'}`}>Contact</NavLink>
                <NavLink to="/login" onClick={() => setOpen(false)} className={({isActive}: { isActive: boolean }) => `mt-1 px-3 py-2 rounded-md transition-colors ring-1 ${isActive ? 'bg-[color:var(--brand)] text-white ring-[color:var(--accent)]/40' : 'bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-strong)] ring-[color:var(--accent)]/40'}`}>Login & Register</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
  {/* Footer removed intentionally */}
    </div>
  )
}

export default AppLayout
