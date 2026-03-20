import { useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { NotificationProvider } from '@/context/NotificationContext'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

// Routes accessible to tier1 / tier2 / tier3 (tier2 also gets /store-users)
const RESTRICTED_ALLOWED = ['/dashboard', '/assets', '/distributors', '/trainings', '/quiz', '/store-users']
// Routes accessible to tier4 (Prospect)
const PROSPECT_ALLOWED   = ['/dashboard']

function Skeleton() {
  return (
    <div className="flex h-screen bg-portal-bg items-center justify-center">
      <div className="w-8 h-8 border-2 border-portal-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function Shell() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) return <Skeleton />
  if (!user) return <Navigate to="/login" replace />

  const isRestricted = ['tier1', 'tier2', 'tier3'].includes(user.role)
  const isProspectRole = user.role === 'tier4'
  const isPending = user.status === 'pending'

  // Pending users (awaiting approval) can only see the dashboard
  if (isPending && !location.pathname.startsWith('/dashboard')) {
    return <Navigate to="/dashboard" replace />
  }
  if (!isPending && isRestricted && !RESTRICTED_ALLOWED.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/dashboard" replace />
  }
  if (!isPending && isProspectRole && !PROSPECT_ALLOWED.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <NotificationProvider>
    <div className="flex h-screen bg-portal-bg overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 h-full">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </NotificationProvider>
  )
}
