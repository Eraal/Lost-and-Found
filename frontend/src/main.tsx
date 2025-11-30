import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tailwind.css'
import './index.css'
import AppLayout from './App'
import AuthProvider from './lib/auth'
import StudentProtectedRoute from './lib/StudentRoute.tsx'
import UserDashboard from './app/routes/user/dashboard/index.tsx'
import ReportLostPage from './app/routes/user/ReportLost.tsx'
import ReportFoundPage from './app/routes/user/ReportFound.tsx'
import MyReportsPage from './app/routes/user/MyReports.tsx'
import MyClaimsTrackerPage from './app/routes/user/Claims.tsx'
import ClaimStatusPage from './app/routes/user/ClaimStatus.tsx'
import SettingsPage from './app/routes/user/Settings.tsx'
import { createBrowserRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import LandingPage from './app/pages/Landing'
import ReportPage from './app/pages/Report'
import SearchPage from './app/routes/user/Search.tsx'
import LoginPage from './app/pages/Login'
import RegisterPage from './app/pages/Register'
import HowItWorksPage from './app/pages/HowItWorks'
import ContactPage from './app/pages/Contact'
import AdminProtectedRoute from './lib/AdminRoute'
import AdminLayout from './app/routes/admin/Layout'
import AdminDashboard from './app/routes/admin/Dashboard'
import SectionPage from './app/routes/admin/SectionPage'
import AdminClaims from './app/routes/admin/Claims'
import AdminLoginPage from './app/routes/admin/Login'
import AdminItems from './app/routes/admin/Items'
import AdminUsers from './app/routes/admin/AdminUsers'
import AdminSocial from './app/routes/admin/Social'
import AdminSocialPosts from './app/routes/admin/SocialPosts'
import AdminQRCodes from './app/routes/admin/QRCodes'
import AdminSystemSettings from './app/routes/admin/SystemSettings'
import ScanItemPage from './app/pages/ScanItem'
import AdminSubmittedItems from './app/routes/admin/SubmittedItems'

const router = createBrowserRouter([
  // Public/Student app with top bar
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'report', element: <ReportPage /> },
  { path: 'report/lost', element: <StudentProtectedRoute><ReportLostPage /></StudentProtectedRoute> },
  { path: 'report/found', element: <StudentProtectedRoute><ReportFoundPage /></StudentProtectedRoute> },
      { path: 'search', element: <SearchPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'how-it-works', element: <HowItWorksPage /> },
      { path: 'contact', element: <ContactPage /> },
  // Public QR scan route
  { path: 'scan/:code', element: <ScanItemPage /> },
      // Student area (protected)
  { path: 'dashboard', element: <StudentProtectedRoute><UserDashboard /></StudentProtectedRoute> },
  { path: 'my-reports', element: <StudentProtectedRoute><MyReportsPage /></StudentProtectedRoute> },
  { path: 'my-claims', element: <StudentProtectedRoute><MyClaimsTrackerPage /></StudentProtectedRoute> },
  { path: 'claim/:claimId', element: <StudentProtectedRoute><ClaimStatusPage /></StudentProtectedRoute> },
  { path: 'settings', element: <StudentProtectedRoute><SettingsPage /></StudentProtectedRoute> },
    ],
  },
  // Admin app without student top bar
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin',
    element: <AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <AdminDashboard /> },
  { path: 'matching', element: <SectionPage title="Matching Queue" /> },
  { path: 'claims', element: <AdminClaims /> },
      { path: 'activity', element: <SectionPage title="Activity" /> },
      // Claims Management
  { path: 'claims/pending', element: <AdminClaims /> },
  { path: 'claims/approved', element: <AdminClaims /> },
  { path: 'claims/rejected', element: <AdminClaims /> },
  { path: 'claims/returned', element: <AdminClaims /> },
      // Items Database
  { path: 'items/lost', element: <AdminItems /> },
  { path: 'items/found', element: <AdminItems /> },
  { path: 'items/matched', element: <AdminItems /> },
    { path: 'items/submitted', element: <AdminSubmittedItems /> },
      // User Management
  { path: 'users/active', element: <AdminUsers /> },
      { path: 'users/reports', element: <SectionPage title="User Management • Reports by User" /> },
      // Social Media
  { path: 'social/facebook', element: <AdminSocial /> },
  { path: 'social/posts', element: <AdminSocialPosts /> },
      // QR Codes
  { path: 'qrcodes/generated', element: <AdminQRCodes /> },
      { path: 'qrcodes/analytics', element: <SectionPage title="QR Codes • Usage Analytics" /> },
  // Reports & Analytics removed per request
      // System Settings
  { path: 'settings/system', element: <AdminSystemSettings /> },
      // Legacy path redirect support
      { path: 'settings/categories', element: <LegacyRedirect to="/admin/settings/system" /> },
      { path: 'settings/locations', element: <SectionPage title="System Settings • Locations" /> },
      { path: 'settings/notifications', element: <SectionPage title="System Settings • Notifications" /> },
    ],
  },
])

export function LegacyRedirect({ to }: { to: string }) {
  const navigate = useNavigate()
  useEffect(() => { navigate(to, { replace: true }) }, [navigate, to])
  return (<div className="p-8 text-center text-gray-600">Redirecting…</div>)
}

export function RouteError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-rose-50 p-6">
      <div className="max-w-md w-full bg-white/90 backdrop-blur rounded-2xl border border-red-200 shadow-xl p-8 text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4m0 4h.01" strokeLinecap="round" strokeLinejoin="round"/><path d="M2.5 19h19L12 3 2.5 19Z" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-red-700 mb-2">Page Not Found</h1>
        <p className="text-sm text-red-600 mb-6">The page you requested could not be loaded or does not exist.</p>
        <div className="flex flex-col gap-3">
          <a href="/admin" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[color:var(--brand)] text-white text-sm font-medium shadow hover:bg-[color:var(--brand-strong)] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12h18M3 12l6 6m-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to Dashboard
          </a>
          <button onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-300 text-red-700 bg-white text-sm font-medium hover:bg-red-50 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Reload Page
          </button>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
