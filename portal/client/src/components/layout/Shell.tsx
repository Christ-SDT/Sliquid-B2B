import { useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const RESTRICTED_ALLOWED = ['/dashboard', '/assets', '/distributors', '/trainings', '/quiz']

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
  if (isRestricted && !RESTRICTED_ALLOWED.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/dashboard" replace />
  }

  return (
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
  )
}
