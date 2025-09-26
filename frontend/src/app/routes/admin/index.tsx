export default function AdminHome() {
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-[color:var(--brand)]">Admin Dashboard</h1>
        <p className="text-sm text-[var(--ink-600)]">Welcome, admin. Quick overview and controls.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-sm text-[var(--ink-600)]">Pending Reports</div>
          <div className="mt-1 text-2xl font-bold text-[color:var(--brand)]">—</div>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-sm text-[var(--ink-600)]">Matches to Review</div>
          <div className="mt-1 text-2xl font-bold text-[color:var(--brand)]">—</div>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-sm text-[var(--ink-600)]">User Notifications</div>
          <div className="mt-1 text-2xl font-bold text-[color:var(--brand)]">—</div>
        </div>
      </div>
    </div>
  )
}
