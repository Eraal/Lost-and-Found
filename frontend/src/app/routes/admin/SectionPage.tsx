export default function SectionPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/30 bg-[color:var(--brand)]/5">Admin</div>
      <h1 className="mt-2 text-2xl font-semibold text-[color:var(--brand)]">{title}</h1>
      <p className="text-sm text-[var(--ink-600)]">Content coming soon.</p>
    </div>
  )
}
