
import { Link, NavLink } from 'react-router-dom'

export default function HowItWorksPage() {
  return (
    <div className="bg-academic text-[var(--ink)]" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,_white_25%,_transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-10">
          <div className="max-w-3xl animate-fade-up">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[color:var(--brand)]">How the CCS Lost & Found works</h1>
            <p className="mt-3 text-lg text-[var(--ink-600)]">
              A simple, secure flow to report, find, and recover items across the College of Computer Studies.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <NavLink to="/report/lost" className="inline-flex items-center justify-center rounded-md bg-[color:var(--brand)] px-5 py-2.5 text-white font-semibold shadow-sm hover:bg-[color:var(--brand-strong)] transition-colors">
                Report Lost
              </NavLink>
              <NavLink to="/report/found" className="inline-flex items-center justify-center rounded-md border border-[color:var(--brand)]/20 bg-white/90 px-5 py-2.5 text-[var(--ink)] font-semibold hover:bg-[color:var(--brand)]/10 transition-colors backdrop-blur">
                Report Found
              </NavLink>
              <NavLink to="/search" className="inline-flex items-center justify-center rounded-md border border-[color:var(--brand)]/20 bg-white/90 px-5 py-2.5 text-[var(--ink)] font-semibold hover:bg-[color:var(--brand)]/10 transition-colors backdrop-blur">
                Browse Unclaimed Items
              </NavLink>
            </div>
          </div>
          {/* Overview chips */}
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <OverviewCard icon={<IconReport />} title="Report" desc="Log a lost or found item with details and a photo." />
            <OverviewCard icon={<IconMatch />} title="Smart match" desc="The system links likely lost–found pairs automatically." />
            <OverviewCard icon={<IconQR />} title="Scan QR code" desc="Scan with your phone to open item info quickly." />
            <OverviewCard icon={<IconVerify />} title="Verify & claim" desc="Staff verify ownership before handover for safety." />
          </div>
        </div>
      </section>

      {/* Dual flows */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-2xl md:text-3xl font-bold">Two simple paths</h2>
        <p className="mt-2 text-[var(--ink-600)] max-w-3xl">
          Whether you lost something or found it, the steps below guide you. These map to our Items, Matches, and Claims system.
        </p>

        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          {/* Lost item lane */}
          <Lane title="I lost an item" colorClass="text-[color:var(--brand)]" badge="Lost">
            <StepCard n={1} title="Create a lost report" desc="Describe the item (title, details, where/when it went missing) and add a photo if possible." action={<Link className="inline-flex items-center gap-1 text-sm text-[color:var(--accent)] hover:opacity-80 transition" to="/report/lost">Report Lost <svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 10h8.586l-3.293 3.293 1.414 1.414L17.414 10l-5.707-5.707-1.414 1.414L13.586 8H5v2z"/></svg></Link>} icon={<IconReport />} />
            <Connector />
            <StepCard n={2} title="Smart matching" desc="Our system compares your report with found items and suggests potential matches." hint="Backed by the Matches model" icon={<IconMatch />} />
            <Connector />
            <StepCard n={3} title="Claim a match" desc="If you see your item, request a claim and provide any proof of ownership (unique marks, photos, receipts)." icon={<IconClaim />} />
            <Connector />
            <StepCard n={4} title="Staff verification" desc="A staff member reviews your claim. Status moves from requested → verified/approved (or rejected)." hint="Claim statuses: requested, verified, approved, rejected" icon={<IconVerify />} />
            <Connector />
            <StepCard n={5} title="Pick up and sign off" desc="Meet at the designated location. The item is marked claimed/closed once handed over." icon={<IconReunite />} />
          </Lane>

          {/* Found item lane */}
          <Lane title="I found an item" colorClass="text-[color:var(--support)]" badge="Found">
            <StepCard n={1} title="Submit a found report" desc="Share what you found, where, and when. Add a clear photo to help owners identify it." action={<InlineCTA to="/report/found">Report Found</InlineCTA>} icon={<IconReport />} />
            <Connector label="or" />
            <StepCard n={2} title="Scan QR code (if present)" desc="Some items may have a QR code. Scan to open the item profile and notify the owner faster." hint="Uses QR codes in the system" icon={<IconQR />} />
            <Connector />
            <StepCard n={3} title="Auto-notify potential owners" desc="Matches trigger notifications to likely owners to review and claim." hint="Email/In-app notifications" icon={<IconBell />} />
            <Connector />
            <StepCard n={4} title="Meet with staff" desc="Coordinate drop-off. Staff verify the claimant before handover for safety." icon={<IconVerify />} />
            <Connector />
            <StepCard n={5} title="Close the loop" desc="Once returned, the item is marked claimed and closed. Thank you for helping!" icon={<IconReunite />} />
          </Lane>
        </div>
      </section>

  {/* QR callout */}
      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[color:var(--brand)]/10 via-white to-[color:var(--support)]/10 ring-1 ring-black/5 p-6">
          <div className="grid md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2">
              <h3 className="text-xl font-bold flex items-center gap-2"><IconQR className="size-5" /> Faster recovery with QR codes</h3>
              <p className="mt-2 text-[var(--ink-600)]">
                Items with school-issued QR codes can be scanned to retrieve item info and contact the owner or staff quickly. In the backend, these map to QR codes associated with items and users.
              </p>
              <ul className="mt-3 text-sm text-[var(--ink-600)] list-disc pl-5 space-y-1">
                <li>Scan opens the item detail page instantly</li>
                <li>Updates scan count and last scanned time for auditing</li>
                <li>No code? Just submit a found report instead</li>
              </ul>
            </div>
            <div className="md:col-span-1">
              <div className="aspect-[4/3] rounded-xl bg-white grid place-items-center shadow-sm ring-1 ring-black/5">
                <IconQRLarge />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety & verification */}
      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="grid md:grid-cols-3 gap-6">
          <InfoCard title="What gets stored?" icon={<IconDatabase />}>
            <p className="text-sm text-[var(--ink-600)]">
              Reports are Items (lost or found) with details like location, date, and photo. Claims connect a user to an item for recovery, and Matches link likely pairs.
            </p>
          </InfoCard>
          <InfoCard title="How claims are verified" icon={<IconShield />}>
            <p className="text-sm text-[var(--ink-600)]">
              Staff review proof of ownership. Claim status moves from <b>requested</b> → <b>verified</b> → <b>approved</b> (or <b>rejected</b>). Items then move to <b>claimed</b>/<b>closed</b>.
            </p>
          </InfoCard>
          <InfoCard title="Notifications" icon={<IconBell />}>
            <p className="text-sm text-[var(--ink-600)]">
              You’ll get email or in-app alerts when there’s a match, claim update, or pickup instruction.
            </p>
          </InfoCard>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--brand-strong)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-white">
          <div className="animate-fade-up">
            <h3 className="text-xl md:text-2xl font-semibold">Ready to help or find your item?</h3>
            <p className="text-white/80">Follow the steps above or jump straight in below.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/report/lost" className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2.5 text-[color:var(--brand-strong)] font-semibold hover:bg-white/90 transition-colors">Report Lost</Link>
            <Link to="/report/found" className="inline-flex items-center justify-center rounded-md border border-white/30 px-4 py-2.5 text-white font-semibold hover:bg-white/10 transition-colors">Report Found</Link>
            <Link to="/search" className="inline-flex items-center justify-center rounded-md border border-white/30 px-4 py-2.5 text-white font-semibold hover:bg-white/10 transition-colors">Browse Unclaimed Items</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ——— UI bits ——— */
function OverviewCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border border-[color:var(--brand)]/10 p-5 bg-white/95 backdrop-blur hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-xl bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/15">
          {icon}
        </span>
        <div>
          <div className="font-semibold">{title}</div>
          <p className="text-sm text-[var(--ink-600)] mt-1">{desc}</p>
        </div>
      </div>
    </div>
  )
}

function Lane({ title, badge, colorClass, children }: { title: string; badge: string; colorClass: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--brand)]/10 bg-white/95 backdrop-blur p-5">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/15 ${colorClass}`}>{badge}</span>
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  )
}

function StepCard({ n, title, desc, hint, action, icon }: { n: number; title: string; desc: string; hint?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="relative flex gap-3 rounded-xl border border-[color:var(--brand)]/10 p-4">
      <div className="shrink-0 flex flex-col items-center">
        <div className="size-8 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center font-bold">{n}</div>
        <div className="mt-2 text-[color:var(--brand)]">{icon}</div>
      </div>
      <div className="">
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-[var(--ink-600)] mt-1">{desc}</p>
        {hint && <p className="text-xs text-[var(--ink-600)]/80 mt-1">{hint}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

function Connector({ label }: { label?: string }) {
  return (
    <div className="relative flex items-center justify-center">
      <div className="h-5 w-px bg-[color:var(--brand)]/15" />
      {label && <span className="mx-2 text-xs text-[var(--ink-600)]/80">{label}</span>}
      <div className="h-5 w-px bg-[color:var(--brand)]/15" />
    </div>
  )
}

function InfoCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--brand)]/10 bg-white/95 backdrop-blur p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-lg bg-[color:var(--brand)]/10 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/15">
          {icon}
        </span>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

/* ——— Icons (inline SVG, no deps) ——— */
function IconReport() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.8.4L15 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
}

function IconMatch() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h5l2-3 3 6 2-3h4" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function IconQR({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M14 14h3v3h-3zM20 14v6h-6" />
    </svg>
  )
}

function IconQRLarge() {
  return (
    <svg viewBox="0 0 200 160" className="w-40 h-28 text-[color:var(--brand)]" fill="none" stroke="currentColor" strokeWidth="6">
      <rect x="10" y="10" width="60" height="60" rx="6"/>
      <rect x="130" y="10" width="60" height="60" rx="6"/>
      <rect x="10" y="90" width="60" height="60" rx="6"/>
      <path d="M130 90h30v30h-30zM170 90v60h-60"/>
    </svg>
  )
}

function IconVerify() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function IconClaim() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M6 8h6M6 16h6"/></svg>
}

function IconReunite() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 11a4 4 0 1 1 8 0"/><path d="M2 20c2-3 6-5 10-5s8 2 10 5"/></svg>
}

function IconBell() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>
}

function IconDatabase() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>
}

function IconShield() {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7l7-4Z"/></svg>
}

/* Small utility component for inline CTAs within step cards */
function InlineCTA({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm text-[color:var(--accent)] hover:opacity-80 transition">
      {children}
      <svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 10h8.586l-3.293 3.293 1.414 1.414L17.414 10l-5.707-5.707-1.414 1.414L13.586 8H5v2z"/></svg>
    </Link>
  )
}

