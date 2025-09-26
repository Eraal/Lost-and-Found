import { useEffect, useState } from 'react'
import { getAdminSettings, updateAdminSettings, getSocialStatus, listSocialPosts, retrySocialPost, createSocialPost, type SocialPostDto, getFacebookCredentials, updateFacebookCredentials } from '../../../lib/api'

export default function AdminSocial() {
  const [autoPost, setAutoPost] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState<{ pageConfigured?: boolean, tokenConfigured?: boolean } | null>(null)
  const [posts, setPosts] = useState<SocialPostDto[]>([])
  const [busyPostId, setBusyPostId] = useState<number | null>(null)
  const [manualItemId, setManualItemId] = useState<string>('')
  const [pageId, setPageId] = useState<string>('')
  const [token, setToken] = useState<string>('')
  const [savingCreds, setSavingCreds] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [s, st, p, creds] = await Promise.all([
          getAdminSettings().catch(() => ({})),
          getSocialStatus().catch(() => ({})),
          listSocialPosts(25).catch(() => [] as SocialPostDto[]),
          getFacebookCredentials().catch(() => ({ pageId: '', hasToken: false })),
        ])
        if (cancelled) return
        const social = (s && typeof s === 'object') ? (s as { social?: { facebook?: { autoPost?: boolean } } }) : {}
        const ap = Boolean(social.social?.facebook?.autoPost)
        setAutoPost(ap)
        const fb = (st && typeof st === 'object') ? (st as { facebook?: { autoPost?: boolean, pageConfigured?: boolean, tokenConfigured?: boolean } }).facebook : undefined
        setStatus(fb ?? null)
        setPosts(p)
        if (creds && typeof creds.pageId === 'string') setPageId(creds.pageId)
      } catch (e) {
        if (!cancelled) setErr((e as Error).message || 'Failed to load settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function toggleAutoPost(next: boolean) {
    try {
      setSaving(true)
      setErr(null)
      setAutoPost(next)
      await updateAdminSettings({ social: { facebook: { autoPost: next } } })
    } catch (e) {
      setErr((e as Error).message || 'Failed to save')
      setAutoPost(!next) // revert
    } finally {
      setSaving(false)
    }
  }

  async function doRetry(id: number) {
    try {
      setBusyPostId(id)
      const p = await retrySocialPost(id)
      setPosts(prev => prev.map(x => x.id === id ? p : x))
    } catch (e) {
      setErr((e as Error).message || 'Retry failed')
    } finally {
      setBusyPostId(null)
    }
  }

  async function doManualPost() {
    const id = Number(manualItemId)
    if (!Number.isFinite(id) || id <= 0) { setErr('Enter a valid Item ID'); return }
    try {
      setSaving(true)
      const p = await createSocialPost(id)
      setPosts(prev => [p, ...prev].slice(0, 25))
      setManualItemId('')
    } catch (e) {
      setErr((e as Error).message || 'Post failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveCredentials() {
    try {
      setSavingCreds(true)
      setErr(null)
      await updateFacebookCredentials(pageId, token || undefined)
      const st = await getSocialStatus().catch(() => ({}))
      const fb = (st && typeof st === 'object') ? (st as { facebook?: { pageConfigured?: boolean, tokenConfigured?: boolean } }).facebook : undefined
      setStatus(fb ?? null)
      if (token) setToken('') // clear token field
    } catch (e) {
      setErr((e as Error).message || 'Failed to save credentials')
    } finally {
      setSavingCreds(false)
    }
  }

  const isFullyConfigured = status?.pageConfigured && status?.tokenConfigured

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-lg">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Facebook Integration
              </h1>
              <p className="text-gray-600 mt-1">Automatically share Lost & Found reports to your Facebook Page</p>
            </div>
          </div>
          
          {/* Status Banner */}
          <div className={`rounded-2xl p-4 border-2 transition-all duration-300 ${
            isFullyConfigured 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isFullyConfigured ? 'bg-green-200' : 'bg-amber-200'}`}>
                {isFullyConfigured ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div>
                <div className="font-semibold">
                  {isFullyConfigured ? 'Ready to Go!' : 'Setup Required'}
                </div>
                <div className="text-sm opacity-90">
                  {isFullyConfigured 
                    ? 'Your Facebook integration is properly configured and ready to use.' 
                    : 'Complete the setup below to start auto-posting to Facebook.'}
                </div>
              </div>
              {!isFullyConfigured && (
                <button
                  onClick={() => setShowSetupGuide(!showSetupGuide)}
                  className="ml-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {showSetupGuide ? 'Hide Guide' : 'Setup Guide'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Setup Guide Modal */}
        {showSetupGuide && (
          <div className="mb-8 rounded-2xl bg-white border border-gray-200 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
              <h3 className="text-xl font-bold mb-2">📋 Facebook Setup Guide</h3>
              <p className="opacity-90">Follow these steps to connect your Facebook Page</p>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">1</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Create Facebook App</h4>
                      <p className="text-sm text-gray-600 mb-2">Go to Facebook Developers and create a new app with "Business" type.</p>
                      <a href="https://developers.facebook.com/" target="_blank" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium">
                        Open Facebook Developers
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">2</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Add Facebook Login</h4>
                      <p className="text-sm text-gray-600">Add "Facebook Login for Business" product to your app and configure it.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">3</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Generate Page Access Token</h4>
                      <p className="text-sm text-gray-600">Use Graph API Explorer to generate a Page Access Token with <code className="bg-gray-100 px-1 rounded">pages_manage_posts</code> permission.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">4</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Get Your Page ID</h4>
                      <p className="text-sm text-gray-600 mb-2">Find your Page ID in Facebook Page Settings → About → Page ID, or use the Graph API Explorer.</p>
                      <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 font-mono">
                        GET /me/accounts
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">5</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Configure Environment</h4>
                      <p className="text-sm text-gray-600 mb-2">Set these environment variables on your backend:</p>
                      <div className="bg-gray-50 p-3 rounded text-xs font-mono space-y-1">
                        <div><span className="text-blue-600">FACEBOOK_PAGE_ID</span>=your_page_id</div>
                        <div><span className="text-blue-600">FACEBOOK_PAGE_ACCESS_TOKEN</span>=your_token</div>
                        <div><span className="text-blue-600">FRONTEND_PUBLIC_BASE_URL</span>=your_domain</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="font-semibold text-blue-900 mb-1">💡 Pro Tip</h4>
                    <p className="text-sm text-blue-800">After setting environment variables, restart your backend server and refresh this page to see the updated status.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {err && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="font-semibold text-red-800">Error</h4>
                <p className="text-sm text-red-700 mt-1">{err}</p>
              </div>
              <button
                onClick={() => setErr(null)}
                className="ml-auto text-red-400 hover:text-red-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Auto-Post Toggle */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl transition-colors ${autoPost ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                        <path d="M9 13h2v5a1 1 0 11-2 0v-5z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Auto-Post to Facebook</h3>
                      <p className="text-sm text-gray-600 mt-1">Automatically share new Lost/Found reports with title, description, location, date, and link back to your site.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={autoPost} 
                      disabled={loading || saving || !isFullyConfigured} 
                      onChange={e => toggleAutoPost(e.target.checked)} 
                    />
                    <div className={`w-14 h-7 rounded-full peer transition-all duration-300 ${
                      autoPost 
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30' 
                        : 'bg-gray-200'
                    } ${(!isFullyConfigured) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <div className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
                        autoPost ? 'translate-x-7' : ''
                      }`}>
                        {saving && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                </div>
                {!isFullyConfigured && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">Complete the setup below before enabling auto-post.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status Card */}
          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">Integration Status</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Page ID</span>
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    status?.pageConfigured ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${status?.pageConfigured ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    {status?.pageConfigured ? 'Connected' : 'Missing'}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Access Token</span>
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    status?.tokenConfigured ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${status?.tokenConfigured ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    {status?.tokenConfigured ? 'Connected' : 'Missing'}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Auto-Post</span>
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    autoPost ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${autoPost ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    {autoPost ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Credentials Card */}
          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">Facebook Credentials</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Page ID</label>
                  <input 
                    value={pageId} 
                    onChange={e => setPageId(e.target.value)} 
                    placeholder="Enter your Facebook Page ID" 
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Page Access Token</label>
                  <input 
                    value={token} 
                    onChange={e => setToken(e.target.value)} 
                    placeholder="EAAG..." 
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm" 
                    type="password" 
                  />
                  <p className="text-xs text-gray-500 mt-1">Stored securely on server, not displayed back</p>
                </div>
                <button 
                  disabled={savingCreds || !pageId.trim()} 
                  onClick={saveCredentials} 
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingCreds ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Save Credentials
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Manual Post Card */}
          <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">Manual Post</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Item ID</label>
                  <input 
                    value={manualItemId} 
                    onChange={e => setManualItemId(e.target.value)} 
                    placeholder="Enter Item ID to post" 
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Message will be generated automatically from item details</p>
                </div>
                <button 
                  disabled={saving || !manualItemId.trim() || !isFullyConfigured} 
                  onClick={doManualPost} 
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Posting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                      </svg>
                      Post Now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Posts */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Recent Posts</h3>
                <p className="text-sm text-gray-600">Track your latest Facebook posts and their status</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading posts...</p>
                </div>
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">No posts yet</h4>
                <p className="text-gray-600 mb-4">Your Facebook posts will appear here once you start auto-posting or create manual posts.</p>
                {isFullyConfigured && (
                  <p className="text-sm text-blue-600">✨ Ready to go! Enable auto-post above or create a manual post to get started.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((p, index) => (
                  <div key={p.id} className={`rounded-xl border-2 transition-all duration-300 ${
                    p.status === 'sent' 
                      ? 'border-green-200 bg-green-50/50' 
                      : p.status === 'failed' 
                        ? 'border-red-200 bg-red-50/50' 
                        : 'border-gray-200 bg-gray-50/50'
                  } ${index === 0 ? 'ring-2 ring-blue-500/20' : ''}`}>
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl shrink-0 ${
                          p.status === 'sent' 
                            ? 'bg-green-100 text-green-600' 
                            : p.status === 'failed' 
                              ? 'bg-red-100 text-red-600' 
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {p.status === 'sent' ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : p.status === 'failed' ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-gray-900 truncate">
                              {p.item?.title ?? 'Item'}
                            </h4>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                              #{p.item?.id ?? '—'}
                            </span>
                            {index === 0 && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full font-medium">
                                Latest
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 mb-3 bg-white/70 rounded-lg p-3 border border-gray-200">
                            {p.message}
                          </p>
                          {p.linkUrl && (
                            <a 
                              href={p.linkUrl} 
                              target="_blank" 
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                            >
                              View on Facebook
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                              </svg>
                            </a>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                            p.status === 'sent' 
                              ? 'bg-green-100 text-green-800 border border-green-200' 
                              : p.status === 'failed' 
                                ? 'bg-red-100 text-red-800 border border-red-200' 
                                : 'bg-gray-100 text-gray-800 border border-gray-200'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${
                              p.status === 'sent' ? 'bg-green-500' : p.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                            }`}></div>
                            {p.status === 'sent' ? 'Posted' : p.status === 'failed' ? 'Failed' : 'Pending'}
                          </div>
                          {p.status !== 'sent' && (
                            <div className="mt-3">
                              <button 
                                disabled={busyPostId === p.id} 
                                onClick={() => doRetry(p.id)} 
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {busyPostId === p.id ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                                    Retrying...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    Retry
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}