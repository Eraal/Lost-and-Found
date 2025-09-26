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
import SettingsPage from './app/routes/user/Settings.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
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
import ScanItemPage from './app/pages/ScanItem'

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
  { path: 'settings', element: <StudentProtectedRoute><SettingsPage /></StudentProtectedRoute> },
    ],
  },
  // Admin app without student top bar
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin',
    element: <AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>,
    children: [
      { index: true, element: <AdminDashboard /> },
  { path: 'matching', element: <SectionPage title="Matching Queue" /> },
  { path: 'claims', element: <AdminClaims /> },
      { path: 'activity', element: <SectionPage title="Activity" /> },
      // Claims Management
  { path: 'claims/pending', element: <AdminClaims /> },
  { path: 'claims/approved', element: <AdminClaims /> },
  { path: 'claims/rejected', element: <AdminClaims /> },
      // Items Database
  { path: 'items/lost', element: <AdminItems /> },
  { path: 'items/found', element: <AdminItems /> },
  { path: 'items/matched', element: <AdminItems /> },
      // User Management
  { path: 'users/active', element: <AdminUsers /> },
      { path: 'users/reports', element: <SectionPage title="User Management • Reports by User" /> },
      // Social Media
  { path: 'social/facebook', element: <AdminSocial /> },
  { path: 'social/posts', element: <AdminSocialPosts /> },
      // QR Codes
  { path: 'qrcodes/generated', element: <AdminQRCodes /> },
      { path: 'qrcodes/analytics', element: <SectionPage title="QR Codes • Usage Analytics" /> },
      // Reports & Analytics
      { path: 'reports/statistics', element: <SectionPage title="Reports & Analytics • Statistics" /> },
      { path: 'reports/trends', element: <SectionPage title="Reports & Analytics • Trends" /> },
      { path: 'reports/export', element: <SectionPage title="Reports & Analytics • Export Data" /> },
      // System Settings
      { path: 'settings/categories', element: <SectionPage title="System Settings • Categories" /> },
      { path: 'settings/locations', element: <SectionPage title="System Settings • Locations" /> },
      { path: 'settings/notifications', element: <SectionPage title="System Settings • Notifications" /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
