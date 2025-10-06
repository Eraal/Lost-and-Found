import { useEffect, useState } from 'react'
import { getAdminSettings, updateAdminSettings } from '../../../lib/api'

type FeatureState = {
  autoMatching?: boolean
  qrCodes?: boolean
  claimsAutoVerify?: boolean
  notifInApp?: boolean
  // notifEmail?: boolean
}

export default function AdminSystemSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [features, setFeatures] = useState<FeatureState>({})
  const [dirty, setDirty] = useState<FeatureState>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const settings = await getAdminSettings().catch(() => ({})) as { features?: FeatureState }
        if (cancelled) return
        setFeatures(settings.features || {})
      } catch (e) {
        if (!cancelled) setErr((e as Error).message || 'Failed to load settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function toggleFeature(key: keyof FeatureState, next: boolean) {
    setFeatures(prev => ({ ...prev, [key]: next }))
    setDirty(prev => ({ ...prev, [key]: next }))
  }

  async function save() {
    if (Object.keys(dirty).length === 0) return
    try {
      setSaving(true)
      setErr(null)
      await updateAdminSettings({ features: dirty })
      setDirty({})
    } catch (e) {
      setErr((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-indigo-600 text-white shadow-lg">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009.4 19a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 005 15.4a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 005 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009.4 5a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09c0 .69.4 1.31 1 1.51a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06c-.46.46-.58 1.12-.33 1.82.3.7 1 1.1 1.69 1.09H21a2 2 0 010 4h-.09c-.69 0-1.39.4-1.51 1z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">System Settings</h1>
              <p className="text-gray-600 mt-1">Enable or disable platform features dynamically</p>
            </div>
          </div>
          <div className={`rounded-2xl p-4 border-2 ${Object.keys(dirty).length ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${Object.keys(dirty).length ? 'bg-amber-200' : 'bg-green-200'}`}>{Object.keys(dirty).length ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              )}</div>
              <div>
                <div className="font-semibold">{Object.keys(dirty).length ? 'Unsaved changes' : 'All changes saved'}</div>
                <div className="text-sm opacity-90">{Object.keys(dirty).length ? 'Review and save your changes' : 'Feature configuration is up to date'}</div>
              </div>
              <button
                disabled={!Object.keys(dirty).length || saving}
                onClick={save}
                className="ml-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (<>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving
                </>) : (<>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  Save Changes
                </>)}
              </button>
            </div>
          </div>
        </div>

        {err && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            <div className="flex-1">
              <div className="font-semibold text-red-800">Error</div>
              <div className="text-sm text-red-700 mt-1">{err}</div>
            </div>
            <button onClick={() => setErr(null)} className="text-red-400 hover:text-red-600 transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Core Platform Features */}
          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 17a1 1 0 102 0v-1a1 1 0 10-2 0v1zM3 8a1 1 0 011-1h1a1 1 0 110 2H5v5a3 3 0 003 3h1a1 1 0 100-2H8a1 1 0 01-1-1V9a1 1 0 00-1-1H4a1 1 0 01-1-1z" /><path d="M12 3a1 1 0 00-1 1v5H9a1 1 0 000 2h2v5a1 1 0 102 0v-5h2a1 1 0 100-2h-2V4a1 1 0 00-1-1z" /></svg>
              </div>
              <h3 className="font-semibold text-gray-900">Core Platform</h3>
            </div>
            <div className="p-6 space-y-5">
              <FeatureToggle
                label="Smart Auto-Matching"
                description="Automatically suggest matches between Lost and Found reports using similarity scoring."
                value={!!features.autoMatching}
                onChange={v => toggleFeature('autoMatching', v)}
                loading={loading}
              />
              <FeatureToggle
                label="QR Codes"
                description="Enable generation and scanning of QR codes for faster item returns."
                value={!!features.qrCodes}
                onChange={v => toggleFeature('qrCodes', v)}
                loading={loading}
              />
              <FeatureToggle
                label="Auto-Verify Claims"
                description="Automatically move new claim requests to 'verified' status when sufficient match confidence is present."
                value={!!features.claimsAutoVerify}
                onChange={v => toggleFeature('claimsAutoVerify', v)}
                loading={loading}
              />
            </div>
          </div>

          {/* Notifications */}
            <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a6 6 0 00-6 6v2.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 10.586V8a6 6 0 00-6-6zm0 16a3 3 0 01-3-3h6a3 3 0 01-3 3z" clipRule="evenodd" /></svg>
                </div>
                <h3 className="font-semibold text-gray-900">Notifications</h3>
              </div>
              <div className="p-6 space-y-5">
                <FeatureToggle
                  label="In-App Notifications"
                  description="Allow delivery of real-time notifications within the web app interface."
                  value={!!features.notifInApp}
                  onChange={v => toggleFeature('notifInApp', v)}
                  loading={loading}
                />
                  {/* Removed Email Notifications toggle */}
                <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-4 text-sm text-purple-800 flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                    In-app notifications deliver real-time updates. Email delivery has been disabled system-wide.
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}

type FeatureToggleProps = {
  label: string
  description?: string
  value: boolean
  onChange: (val: boolean) => void
  loading?: boolean
}
function FeatureToggle({ label, description, value, onChange, loading }: FeatureToggleProps) {
  return (
    <div className="flex items-start gap-4">
      <div className={`relative inline-flex items-center cursor-pointer select-none ${loading ? 'opacity-50' : ''}`}>        
        <input
          type="checkbox"
          className="sr-only peer"
          checked={value}
          disabled={loading}
          onChange={e => onChange(e.target.checked)}
        />
        <div className={`w-14 h-7 rounded-full peer transition-all duration-300 ${
          value ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/30' : 'bg-gray-200'
        }`}>
          <div className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${value ? 'translate-x-7' : ''}`}></div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{label}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${value ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>{value ? 'ON' : 'OFF'}</span>
        </div>
        {description && <p className="text-sm text-gray-600 mt-1 leading-snug">{description}</p>}
      </div>
    </div>
  )
}
