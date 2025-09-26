import { Link } from 'react-router-dom'

export default function ReportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
  <h1 className="text-2xl font-bold text-[var(--ink)]">Report Lost Item</h1>
      <p className="text-gray-600 mt-2">This is a placeholder. Form coming soon.</p>
      <div className="mt-6">
  <Link to="/" className="text-[var(--ccs-forest)] hover:underline">Back to Home</Link>
      </div>
    </div>
  )
}
