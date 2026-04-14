import { useState, useEffect, useRef } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { NotificationProvider } from '@/context/NotificationContext'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const INACTIVITY_MS = 2 * 60 * 60 * 1000  // 2 hours
const CHECK_INTERVAL = 60 * 1000           // check once per minute

// Routes accessible to tier1 only (most restricted)
const TIER1_ALLOWED  = ['/dashboard', '/assets', '/distributors', '/trainings', '/quiz', '/store-users', '/creator']
// Routes accessible to tier2 and tier3 (adds In-store Marketing)
const TIER2_3_ALLOWED = [...TIER1_ALLOWED, '/retailer']
// Routes accessible to tier6 Medical Partner (same as tier1 + Medical Marketing)
const TIER6_ALLOWED  = [...TIER1_ALLOWED, '/medical-marketing']
// Routes accessible to tier4 (Prospect)
const PROSPECT_ALLOWED = ['/dashboard']

function Skeleton() {
  return (
    <div className="flex h-screen bg-portal-bg items-center justify-center">
      <div className="w-8 h-8 border-2 border-portal-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function Shell() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    if (!user) return
    // Event handlers just stamp a timestamp — no timer churn on every mousemove
    const stamp = () => { lastActivityRef.current = Date.now() }
    const events = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, stamp, { passive: true }))
    // Single interval checks once per minute instead of resetting a timer on every event
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) logout()
    }, CHECK_INTERVAL)
    return () => {
      clearInterval(interval)
      events.forEach(e => window.removeEventListener(e, stamp))
    }
  }, [user, logout])

  if (loading) return <Skeleton />
  if (!user) return <Navigate to="/login" replace />

  const isRestricted = ['tier1', 'tier2', 'tier3', 'tier6'].includes(user.role)
  const isProspectRole = user.role === 'tier4'
  const isPending = user.status === 'pending'

  // Pending users (awaiting approval) can only see the dashboard
  if (isPending && !location.pathname.startsWith('/dashboard')) {
    return <Navigate to="/dashboard" replace />
  }
  const restrictedAllowed = user.role === 'tier2' || user.role === 'tier3' ? TIER2_3_ALLOWED
    : user.role === 'tier6' ? TIER6_ALLOWED
    : TIER1_ALLOWED
  if (!isPending && isRestricted && !restrictedAllowed.some(p => location.pathname.startsWith(p))) {
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
