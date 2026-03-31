import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useNotifications } from '@/context/NotificationContext'
import { cn } from '@/lib/utils'
import { TIER_LABEL } from '@/types'
import {
  LayoutDashboard, BookOpen,
  MapPin, Megaphone, GraduationCap, LogOut, X, Users, Moon, Sun, Sparkles,
  Image as ImageIcon,
} from 'lucide-react'

// restricted: tier1/2/3  |  tier23: tier2+tier3 (but not tier1)  |  prospectVisible: tier4  |  adminOnly: tier5 only
const NAV = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard',           restricted: true,  tier23: false, prospectVisible: true,  managerOnly: false, adminOnly: false, badgeType: undefined },
  { to: '/assets',            icon: BookOpen,        label: 'Asset Library',       restricted: true,  tier23: false, prospectVisible: false, managerOnly: false, adminOnly: false, badgeType: undefined },
  { to: '/distributors',      icon: MapPin,          label: 'Distributors',        restricted: true,  tier23: false, prospectVisible: true,  managerOnly: false, adminOnly: false, badgeType: undefined },
  { to: '/trainings',         icon: GraduationCap,   label: 'Digital Training',    restricted: true,  tier23: false, prospectVisible: true,  managerOnly: false, adminOnly: false, badgeType: undefined },
  { to: '/creator',           icon: Sparkles,        label: 'AI Creator',          restricted: true,  tier23: false, prospectVisible: false, managerOnly: false, adminOnly: false, badgeType: undefined },
  { to: '/retailer',          icon: Megaphone,       label: 'In-store Marketing',  restricted: false, tier23: true,  prospectVisible: true,  managerOnly: false, adminOnly: false, badgeType: undefined },
  { to: '/requests',          icon: Users,           label: 'Partner Requests',    restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  badgeType: 'new_registration' },
  { to: '/marketing-requests',icon: Megaphone,       label: 'Marketing Requests',  restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  badgeType: 'marketing_request' },
  { to: '/media',             icon: ImageIcon,       label: 'Media Library',       restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  badgeType: undefined },
  { to: '/users',             icon: Users,           label: 'User Management',     restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  badgeType: undefined },
]

interface Props {
  onClose?: () => void
}

export default function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { countUnreadByType } = useNotifications()

  const isRestricted = ['tier1', 'tier2', 'tier3'].includes(user?.role ?? '')
  const role: string | undefined = user?.role
  const isAdminRole = role === 'tier5' || role === 'admin'
  const isProspectRole = role === 'tier4'
  const isPending = user?.status === 'pending'
  const visibleNav = NAV.filter(item => {
    if (isPending || isProspectRole) return item.to === '/dashboard'
    if (item.adminOnly) return isAdminRole
    if (item.managerOnly) return role === 'tier2' || isAdminRole
    if (isRestricted) return item.restricted || (item.tier23 && (role === 'tier2' || role === 'tier3'))
    return true
  })

  return (
    <aside className="flex flex-col h-full bg-surface border-r border-portal-border w-64 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-portal-border">
        <div className="flex items-center gap-3">
          <img
            src="/images/cropped-lotus.png"
            alt="Sliquid lotus"
            className="w-8 h-8 object-contain"
          />
          <div>
            <p className="text-on-canvas font-bold text-sm leading-none tracking-wider">SLIQUID</p>
            <p className="text-on-canvas-muted text-[10px] font-medium tracking-widest mt-0.5">PARTNER PORTAL</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas md:hidden">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-0.5">
          {visibleNav.map(({ to, icon: Icon, label, badgeType }) => {
            const badgeCount = badgeType ? countUnreadByType(badgeType) : 0
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-portal-accent text-white'
                        : 'text-on-canvas-subtle hover:text-on-canvas hover:bg-surface-elevated',
                    )
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badgeCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-portal-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>

      </nav>

      {/* Theme toggle */}
      <div className="border-t border-portal-border px-4 py-3 flex items-center justify-between">
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

      {/* User footer */}
      <div className="border-t border-portal-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30
                          flex items-center justify-center text-portal-accent text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-on-canvas text-sm font-medium truncate">{user?.name}</p>
            <p className="text-on-canvas-muted text-xs truncate">{user?.role ? (TIER_LABEL[user.role] ?? user.role) : ''}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-on-canvas-subtle
                     hover:text-on-canvas hover:bg-surface-elevated text-sm transition-colors duration-150"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
