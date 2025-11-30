import type React from 'react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../lib/useAuth'
import logoUrl from '../../../assets/ccs-logo.svg'

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const adminDisplay = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Admin'
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[280px_1fr] bg-[color:var(--surface)]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 h-screen hidden md:flex flex-col border-r border-black/5 bg-white/80 backdrop-blur">
        {/* Brand strip */}
        <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />

        {/* Brand header */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <img src={logoUrl} alt="CCS" className="size-8 rounded-sm ring-1 ring-black/5 object-contain bg-white" />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.01em] text-[color:var(--brand)]">{adminDisplay}</div>
            <div className="mt-0.5 text-[11px] text-[var(--ink-600)] truncate">Admin</div>
          </div>
        </div>

        {/* Navigation */}
  <nav className="px-2 pb-2" role="navigation" aria-label="Admin primary">
          <SectionLabel>Overview</SectionLabel>
          <AdminNav
            items={[
              { to: '/admin', label: 'Dashboard', icon: DashboardIcon, end: true },
            ]}
          />

          <SectionLabel>Manage</SectionLabel>
          <AdminNav
            items={[
              { to: '/admin/items/submitted', label: 'Submitted Items', icon: InboxIcon },
              { to: '/admin/claims', label: 'Claims Management', icon: ClaimsIcon },
              { to: '/admin/items/lost', label: 'Items Database', icon: ItemsIcon },
              { to: '/admin/users/active', label: 'User Management', icon: UsersIcon },
              { to: '/admin/social/posts', label: 'Social Posts', icon: SocialIcon },
              { to: '/admin/social/facebook', label: 'Facebook Settings', icon: SocialIcon },
              { to: '/admin/qrcodes/generated', label: 'QR Codes', icon: QrIcon },
            ]}
          />

          {/* Insights section removed per request */}

          <SectionLabel>System</SectionLabel>
          <AdminNav
            items={[
              { to: '/admin/settings/system', label: 'System Settings', icon: SettingsIcon },
            ]}
          />
        </nav>

        {/* Footer */}
        <div className="mt-auto p-3">
          <button
            onClick={() => { logout(); navigate('/admin/login') }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--brand)] text-white px-3 py-2.5 text-sm font-medium shadow-sm shadow-[color:var(--brand)]/20 ring-1 ring-[color:var(--brand)]/20 transition-colors hover:bg-[color:var(--brand-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile header and drawer */}
      <div className="md:hidden">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
          <div className="h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <img src={logoUrl} alt="CCS" className="size-7 rounded-sm ring-1 ring-black/5 object-contain bg-white" />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold tracking-[-0.01em] text-[color:var(--brand)]">Admin Panel</div>
                <div className="text-[11px] text-[var(--ink-600)] truncate">Admin</div>
              </div>
            </div>
            <button
              aria-label="Toggle menu"
              onClick={() => setOpen(v => !v)}
              className="inline-flex items-center justify-center size-9 rounded-md ring-1 ring-black/10 bg-white/70 hover:bg-white/90 text-[color:var(--brand)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round"/></svg>
            </button>
          </div>
        </header>
        <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute left-0 top-0 h-full w-[78%] max-w-[300px] bg-white shadow-xl border-r border-black/10 p-4 transition-transform duration-200 ease-out -translate-x-full ${open ? 'translate-x-0' : ''}`}
            aria-hidden={!open}
          >
            <div className="mb-3 flex items-center gap-3">
              <img src={logoUrl} alt="CCS" className="size-7 rounded-sm ring-1 ring-black/5 object-contain bg-white" />
              <div className="text-lg font-semibold text-[color:var(--brand)]">Admin Panel</div>
            </div>
            <div className="space-y-3" onClick={() => setOpen(false)}>
              <SectionLabel>Overview</SectionLabel>
              <AdminNav items={[{ to: '/admin', label: 'Dashboard', icon: DashboardIcon, end: true }]} size="sm" />

              <SectionLabel>Manage</SectionLabel>
              <AdminNav
                items={[
                  { to: '/admin/items/submitted', label: 'Submitted Items', icon: InboxIcon },
                  { to: '/admin/claims', label: 'Claims Management', icon: ClaimsIcon },
                  { to: '/admin/items/lost', label: 'Items Database', icon: ItemsIcon },
                  { to: '/admin/users/active', label: 'User Management', icon: UsersIcon },
                  { to: '/admin/social/posts', label: 'Social Posts', icon: SocialIcon },
                  { to: '/admin/social/facebook', label: 'Facebook Settings', icon: SocialIcon },
                  { to: '/admin/qrcodes/generated', label: 'QR Codes', icon: QrIcon },
                ]}
                size="sm"
              />

              {/* Insights section removed per request (mobile) */}

              <SectionLabel>System</SectionLabel>
              <AdminNav items={[{ to: '/admin/settings/system', label: 'System Settings', icon: SettingsIcon }]} size="sm" />
            </div>
            <div className="mt-4">
              <button
                onClick={() => { logout(); navigate('/admin/login') }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--brand)] text-white px-3 py-2.5 text-sm font-medium shadow-sm shadow-[color:var(--brand)]/20 ring-1 ring-[color:var(--brand)]/20 transition-colors hover:bg-[color:var(--brand-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <section className="min-h-screen bg-academic relative">
        {/* Subtle background grid overlay for depth */}
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.25]" />
        <div className="relative">
          <Outlet />
        </div>
      </section>
    </div>
  )
}

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  end?: boolean
}

type AdminNavProps = {
  items: NavItem[]
  size?: 'sm' | 'md'
}

function AdminNav({ items, size = 'md' }: AdminNavProps) {
  const height = size === 'sm' ? 'h-10' : 'h-11'
  const text = size === 'sm' ? 'text-[13px]' : 'text-sm'
  const iconSize = size === 'sm' ? 'size-[18px]' : 'size-[20px]'
  return (
    <ul className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink to={to} end={end} className="block">
            {({ isActive }) => (
              <div
                className={`relative group ${height} ${text} rounded-md pl-3 pr-2 inline-flex w-full items-center gap-3 transition-colors ring-1 ring-transparent ${
                  isActive
                    ? 'text-[color:var(--brand)] bg-[color:var(--brand)]/10 ring-[color:var(--brand)]/20'
                    : 'text-[var(--ink-600)] hover:text-[color:var(--brand)] hover:bg-[color:var(--brand)]/5'
                }`}
              >
                {/* Active indicator bar */}
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-sm transition-transform ${
                    isActive ? 'bg-[color:var(--brand)] scale-y-100' : 'bg-transparent scale-y-0'
                  }`}
                />
                <Icon className={`${iconSize} shrink-0`} strokeWidth={1.9} />
                <span className="truncate">{label}</span>
              </div>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-[color:var(--brand)]/70">
      {children}
    </div>
  )
}

function DashboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 13h8V3H3v10Zm10 8h8V3h-8v18ZM3 21h8v-6H3v6Z" />
    </svg>
  )
}

function ClaimsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 4h16v16H4z" />
      <path d="M8 8h8M8 12h6M8 16h5" />
    </svg>
  )
}

function ItemsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 7h18M6 7v13m12-13v13M3 20h18" />
    </svg>
  )
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M16 14c2.761 0 5 2.239 5 5v1H3v-1c0-2.761 2.239-5 5-5" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  )
}

function SocialIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 10h10M5 14h14M4 18h16" />
    </svg>
  )
}

function QrIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 20h-3v-3" />
    </svg>
  )
}

function InboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 4h18v12H3z" />
      <path d="M3 16h6l3 3 3-3h6" />
    </svg>
  )
}


function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      <path d="M2 12h2m16 0h2M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  )
}
