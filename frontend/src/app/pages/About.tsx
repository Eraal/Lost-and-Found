import ccsBg from '../../assets/ccsbackground.jpg'

const TEAM = [
  'ALCORAN, GEMMY ROSE R.',
  'BALLESTEROS, MA. JULIET M.',
  'DE RAMOS, QUIN REMBRANT E.',
  'CABUHAL, DANIELA KAYE M.',
  'MADRIGAL, JERICO ANGELO N.',
  'CAJUMBAN, CRISNA D.',
  'ORAJAY, JANN RHEIMOND M.',
  'DEMIN, JOHN JOSEPH S.',
  'PORTIN, FLORIAN LAIKA G.',
  'DE JESUS, JULIUS CEASAR P.',
  'SORBUNA, MARY JOYCE E.',
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[color:var(--surface)] to-blue-50">
      <div className="max-w-7xl mx-auto px-4 py-12 lg:py-16 space-y-14">
        {/* Hero */}
        <section className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[color:var(--brand)]/10 text-[color:var(--brand)] text-xs font-semibold ring-1 ring-[color:var(--brand)]/20">
              CCS Lost & Found • Service Management Program
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[var(--ink)] leading-tight">
              About the CCS Lost and Found Management System
            </h1>
            <p className="text-lg text-[var(--ink-700)] leading-relaxed">
              Our platform modernizes the way students and staff report, search, and claim lost or found items. It replaces bulletin boards with a centralized, fast, and transparent experience—improving accessibility, organization, and response time across the CCS department.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: 'Reports Managed', value: 'Fast & Centralized' },
                { label: 'Accessibility', value: 'Anytime, anywhere' },
                { label: 'Response Time', value: 'Reduced friction' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-black/10 bg-white/80 backdrop-blur shadow-sm p-4">
                  <div className="text-xs uppercase tracking-wide text-[var(--ink-500)] font-semibold">{stat.label}</div>
                  <div className="text-lg font-bold text-[var(--ink)]">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-r from-[color:var(--brand)]/15 via-[color:var(--accent)]/15 to-[color:var(--support)]/15 blur-3xl" aria-hidden />
            <div className="relative overflow-hidden rounded-3xl border border-black/10 shadow-2xl bg-white">
              <img src={ccsBg} alt="CCS background" className="w-full h-full object-cover max-h-[420px]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white space-y-2">
                <div className="text-sm font-semibold uppercase tracking-wide text-white/80">Service Management Program</div>
                <div className="text-2xl font-bold">Lost and Found Management System</div>
                <p className="text-sm text-white/80 max-w-xl">Built to streamline reporting, searching, matching, and claiming items within the College of Computer Studies.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Mission & Approach */}
        <section className="grid lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Mission',
              body: 'Deliver a trustworthy, student-first platform that accelerates recovery of lost items and elevates campus service quality.',
            },
            {
              title: 'Approach',
              body: 'Combine clear workflows, smart matching, and responsive support so every report is actionable and traceable.',
            },
            {
              title: 'Impact',
              body: 'Reduce manual follow-ups, improve turnaround time, and keep everyone informed with real-time updates and notifications.',
            },
          ].map((card) => (
            <div key={card.title} className="rounded-2xl border border-black/10 bg-white/90 backdrop-blur shadow-md shadow-black/5 p-6">
              <h3 className="text-xl font-bold text-[var(--ink)] mb-2">{card.title}</h3>
              <p className="text-[var(--ink-700)] leading-relaxed text-sm">{card.body}</p>
            </div>
          ))}
        </section>

        {/* Project Proponents */}
        <section className="rounded-3xl border border-black/10 bg-white/90 backdrop-blur shadow-lg shadow-black/5 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <p className="text-sm font-semibold text-[color:var(--brand)] uppercase tracking-wide">Project Proponents</p>
              <h2 className="text-2xl font-extrabold text-[var(--ink)]">ITEP 414 • System Administration and Maintenance</h2>
              <p className="text-sm text-[var(--ink-600)]">Bachelor of Science in Information Technology</p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[color:var(--brand)]/10 text-[color:var(--brand)] text-xs font-semibold ring-1 ring-[color:var(--brand)]/20">
              College of Computer Studies
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {TEAM.map((name) => (
              <div key={name} className="rounded-xl border border-black/10 bg-gradient-to-br from-[color:var(--brand)]/6 via-white to-[color:var(--support)]/6 p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all">
                <div className="text-sm font-semibold text-[var(--ink)] leading-snug">{name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-3xl overflow-hidden border border-black/10 shadow-xl bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)] text-white p-8 lg:p-10">
          <div className="max-w-3xl space-y-4">
            <h3 className="text-3xl font-extrabold">Built for faster recoveries and happier students.</h3>
            <p className="text-lg text-white/90">Report a lost or found item, browse matches, and keep track of claims—all in one streamlined space.</p>
            <div className="flex flex-wrap gap-3">
              <a href="/report/lost" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[color:var(--brand)] font-semibold shadow ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-lg transition-transform">
                Report Lost Item
              </a>
              <a href="/report/found" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/90 text-[color:var(--ink)] font-semibold shadow ring-1 ring-white/40 hover:-translate-y-0.5 hover:shadow-lg transition-transform">
                Report Found Item
              </a>
              <a href="/search" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/60 text-white font-semibold hover:bg-white/10 transition-colors">
                Browse Items
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
