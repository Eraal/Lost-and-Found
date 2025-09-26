export default function ContactPage() {
  return (
    <section className="bg-academic">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-extrabold text-[color:var(--brand)]">Contact</h1>
        <p className="mt-3 text-[var(--ink-600)]">Have a question or need help? Reach out and we’ll respond soon.</p>

        <form className="mt-8 grid gap-4 bg-white p-6 rounded-lg ring-1 ring-black/5 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-[var(--ink)]">Name</label>
            <input className="mt-1 w-full rounded-md ring-1 ring-black/10 bg-white px-3 py-2 focus:outline-none focus:ring-[color:var(--brand)]/40" placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink)]">Email</label>
            <input type="email" className="mt-1 w-full rounded-md ring-1 ring-black/10 bg-white px-3 py-2 focus:outline-none focus:ring-[color:var(--brand)]/40" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink)]">Message</label>
            <textarea rows={4} className="mt-1 w-full rounded-md ring-1 ring-black/10 bg-white px-3 py-2 focus:outline-none focus:ring-[color:var(--brand)]/40" placeholder="How can we help?" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--ink-600)]">We’ll reply via email within 1-2 business days.</p>
            <button type="button" className="inline-flex items-center px-4 py-2 rounded-md bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-strong)] ring-1 ring-[color:var(--accent)]/40">Send</button>
          </div>
        </form>
      </div>
    </section>
  )
}
