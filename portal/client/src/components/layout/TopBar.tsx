import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Menu, Moon, Sun, AlertTriangle, PackageX, BookOpen, Check, Megaphone, Package, Archive, Receipt, BarChart3 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useNotifications } from '@/context/NotificationContext'
import { isAdmin } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  onMenuClick: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const NOTIF_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  low_stock:        AlertTriangle,
  out_of_stock:     PackageX,
  new_asset:        BookOpen,
  marketing_request: Megaphone,
}

const NOTIF_COLORS: Record<string, string> = {
  low_stock:         'text-amber-400',
  out_of_stock:      'text-red-400',
  new_asset:         'text-portal-accent',
  marketing_request: 'text-violet-400',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TopBar({ onMenuClick }: Props) {
  const { user } = useAuth()
  const adminUser = isAdmin(user?.role ?? '')
  const { theme, toggleTheme } = useTheme()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()

  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleNotifClick(n: { id: number; read: number; link?: string | null }) {
    if (!n.read) markRead(n.id)
    if (n.link) {
      setNotifOpen(false)
      navigate(n.link)
    }
  }

  return (
    <header className="h-14 bg-surface border-b border-portal-border flex items-center
                       justify-between px-4 md:px-6 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="md:hidden text-on-canvas-subtle hover:text-on-canvas transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="hidden md:block" />

      <div className="flex items-center gap-3">

        {/* ── Notification Bell ────────────────────────────────────────── */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen(o => !o); setProfileOpen(false) }}
            className="relative w-8 h-8 rounded-lg hover:bg-surface-elevated flex items-center
                       justify-center text-on-canvas-subtle hover:text-on-canvas transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-portal-accent rounded-full
                               flex items-center justify-center text-[10px] font-bold text-white leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-surface border border-portal-border
                            rounded-xl shadow-xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-portal-border">
                <span className="text-on-canvas text-sm font-semibold">
                  Notifications {unreadCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-portal-accent/15 text-portal-accent rounded-full text-[10px] font-bold">
                      {unreadCount} new
                    </span>
                  )}
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs text-on-canvas-muted hover:text-portal-accent transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="w-8 h-8 text-on-canvas-muted/30 mx-auto mb-2" />
                    <p className="text-on-canvas-muted text-sm">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(n => {
                    const Icon = NOTIF_ICONS[n.type] ?? Bell
                    const color = NOTIF_COLORS[n.type] ?? 'text-on-canvas-muted'
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-portal-border/50',
                          'hover:bg-surface-elevated transition-colors last:border-0',
                          n.read === 0 && 'bg-portal-accent/5',
                        )}
                      >
                        <div className={cn('flex-shrink-0 mt-0.5', color)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium leading-tight', n.read === 0 ? 'text-on-canvas' : 'text-on-canvas-subtle')}>
                            {n.title}
                          </p>
                          <p className="text-on-canvas-muted text-xs mt-0.5 line-clamp-2 leading-relaxed">
                            {n.message}
                          </p>
                          <p className="text-on-canvas-muted/60 text-[10px] mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                        {n.read === 0 && (
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-portal-accent mt-1.5" />
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Avatar / Profile ─────────────────────────────────────────── */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setProfileOpen(o => !o); setNotifOpen(false) }}
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-elevated transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30
                            flex items-center justify-center text-portal-accent text-xs font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-on-canvas text-sm font-medium leading-none">{user?.name}</p>
              <p className="text-on-canvas-muted text-xs mt-0.5 capitalize">{user?.company ?? user?.role}</p>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-portal-border
                            rounded-lg shadow-lg z-50 py-2">
              {/* Admin-only quick links */}
              {adminUser && (
                <>
                  <div className="px-3 pb-1 pt-1">
                    <p className="text-on-canvas-muted/60 text-[10px] font-semibold uppercase tracking-wider">Admin Tools</p>
                  </div>
                  {[
                    { to: '/products',  icon: Package,  label: 'Products'  },
                    { to: '/inventory', icon: Archive,  label: 'Inventory' },
                    { to: '/invoices',  icon: Receipt,  label: 'Invoices'  },
                    { to: '/stats',     icon: BarChart3, label: 'Analytics' },
                  ].map(({ to, icon: Icon, label }) => (
                    <button
                      key={to}
                      onClick={() => { setProfileOpen(false); navigate(to) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-on-canvas-subtle hover:text-on-canvas hover:bg-surface-elevated transition-colors"
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                    </button>
                  ))}
                  <div className="border-t border-portal-border mx-3 my-1.5" />
                </>
              )}
              {/* Wellness Mode toggle */}
              <div className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-on-canvas-subtle">
                  {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span>Wellness Mode</span>
                </div>
                <button
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className={cn(
                    'relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
                    theme === 'dark' ? 'bg-portal-accent' : 'bg-slate-300',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#f7efe3] shadow transition-transform duration-200',
                      theme === 'dark' ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  )
}
