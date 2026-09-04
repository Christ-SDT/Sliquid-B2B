import { useState, useEffect, useRef } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { NotificationProvider } from '@/context/NotificationContext'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getDefaultTitle } from '@/utils/pageTitles'

const INACTIVITY_MS = 2 * 60 * 60 * 1000  // 2 hours
const CHECK_INTERVAL = 60 * 1000           // check once per minute

// Routes accessible to tier1 only (most restricted)
// NOTE: matching is `pathname.startsWith(p)`, so '/announcements' also grants
// '/announcements/:slug'. Never add a sibling route with that prefix (e.g.
// '/announcements-admin') or restricted tiers would silently gain access — this
// is why the admin page lives at '/admin/announcements'.
const TIER1_ALLOWED  = ['/dashboard', '/announcements', '/assets', '/distributors', '/trainings', '/quiz', '/store-users', '/creator']
// Routes accessible to tier2 (adds In-store Marketing, keeps Distributors)
const TIER2_ALLOWED  = [...TIER1_ALLOWED, '/retailer']
// Routes accessible to tier3 Distributor — no Distributors page
const TIER3_ALLOWED  = TIER1_ALLOWED.filter(p => p !== '/distributors').concat('/retailer')
// Routes accessible to tier6 Medical Partner (same as tier1 — Medical Marketing is admin-only)
const TIER6_ALLOWED  = TIER1_ALLOWED
// Routes accessible to tier4 (Prospect)
const PROSPECT_ALLOWED = ['/dashboard', '/announcements']
// Routes accessible to users still awaiting approval. Announcements are safe
// here because the server narrows a pending user's feed to the PUBLIC subset —
// the same items anyone can read on the B2B marketing site — so partner-only
// announcements stay hidden until the account is approved.
const PENDING_ALLOWED = ['/dashboard', '/announcements']

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

  // Must run before the `loading`/`!user` early returns below so hook order
  // stays stable across renders; harmless while loading since nothing reads
  // the title yet.
  useDocumentTitle(getDefaultTitle(location.pathname))

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

  const isRestricted = ['tier1', 'tier2', 'tier3', 'tier6', 'tier7'].includes(user.role)
  const isProspectRole = user.role === 'tier4'
  // Legal (tier8): read-only admin. Routing treats it like tier5/admin — every
  // admin route is reachable, nothing here restricts it. Neither isRestricted
  // nor isProspectRole lists tier8 today, so this branch is not strictly load-
  // bearing yet, but it is written explicitly (and checked below BEFORE the
  // restricted/prospect redirects) so tier8 can never be silently pulled into
  // TIER1_ALLOWED/PROSPECT_ALLOWED by a future edit to those arrays — the same
  // way an unrecognized role would be if it fell through unguarded by accident.
  const isLegalRole = user.role === 'tier8'
  const isPending = user.status === 'pending'

  // Pending users (awaiting approval) can only see the dashboard and announcements
  if (isPending && !PENDING_ALLOWED.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/dashboard" replace />
  }
  if (!isPending && !isLegalRole) {
    const restrictedAllowed = user.role === 'tier3' ? TIER3_ALLOWED
      : (user.role === 'tier2' || user.role === 'tier7') ? TIER2_ALLOWED
      : user.role === 'tier6' ? TIER6_ALLOWED
      : TIER1_ALLOWED
    if (isRestricted && !restrictedAllowed.some(p => location.pathname.startsWith(p))) {
      return <Navigate to="/dashboard" replace />
    }
    if (isProspectRole && !PROSPECT_ALLOWED.some(p => location.pathname.startsWith(p))) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return (
    <NotificationProvider>
    <div className="flex h-screen bg-portal-bg overflow-hidden">
      <a href="#portal-main-content" className="skip-link">
        Skip to main content
      </a>
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
        <main id="portal-main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-6 outline-none">
          <Outlet />
        </main>
      </div>
    </div>
    </NotificationProvider>
  )
}
