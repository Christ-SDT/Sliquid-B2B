import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'
import { TIER_LABEL } from '@/types'
import {
  LayoutDashboard, Package, FolderOpen, Archive,
  Receipt, BarChart3, MapPin, Store, Megaphone, GraduationCap, LogOut, X, Users, Moon, Sun,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',          restricted: true,  adminOnly: false },
  { to: '/assets',       icon: FolderOpen,      label: 'Digital Assets',     restricted: true,  adminOnly: false },
  { to: '/distributors', icon: MapPin,          label: 'Distributors',       restricted: true,  adminOnly: false },
  { to: '/trainings',    icon: GraduationCap,   label: 'Trainings',          restricted: true,  adminOnly: false },
  { to: '/creatives',    icon: Megaphone,       label: 'Creatives',          restricted: false, adminOnly: false },
  { to: '/products',     icon: Package,         label: 'Products',           restricted: false, adminOnly: false },
  { to: '/inventory',    icon: Archive,         label: 'Inventory',          restricted: false, adminOnly: false },
  { to: '/invoices',     icon: Receipt,         label: 'Invoices',           restricted: false, adminOnly: false },
  { to: '/stats',        icon: BarChart3,       label: 'Analytics',          restricted: false, adminOnly: false },
  { to: '/retailer',     icon: Store,           label: 'Become a Retailer',  restricted: false, adminOnly: false },
  { to: '/users',        icon: Users,           label: 'User Management',    restricted: false, adminOnly: true  },
]

interface Props {
  onClose?: () => void
}

export default function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const isRestricted = ['tier1', 'tier2', 'tier3'].includes(user?.role ?? '')
  const role: string | undefined = user?.role
  const isAdmin = role === 'tier4' || role === 'admin'
  const visibleNav = NAV.filter(item => {
    if (item.adminOnly) return isAdmin
    if (isRestricted) return item.restricted
    return true
  })

  return (
    <aside className="flex flex-col h-full bg-surface border-r border-portal-border w-64 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-portal-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-portal-accent flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path d="M16 3C16 3 5 14.5 5 20.5a11 11 0 0022 0C27 14.5 16 3 16 3z" fill="white"/>
            </svg>
          </div>
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
          {visibleNav.map(({ to, icon: Icon, label }) => (
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
                {label}
              </NavLink>
            </li>
          ))}
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
