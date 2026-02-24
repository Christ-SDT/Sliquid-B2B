import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Package, FolderOpen, Archive,
  Receipt, BarChart3, MapPin, Store, Megaphone, LogOut, X,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products',  icon: Package,          label: 'Products' },
  { to: '/assets',    icon: FolderOpen,        label: 'Digital Assets' },
  { to: '/inventory', icon: Archive,           label: 'Inventory' },
  { to: '/invoices',  icon: Receipt,           label: 'Invoices' },
  { to: '/stats',     icon: BarChart3,         label: 'Analytics' },
  { to: '/distributors', icon: MapPin,         label: 'Distributors' },
  { to: '/retailer',  icon: Store,             label: 'Become a Retailer' },
  { to: '/creatives', icon: Megaphone,         label: 'Creatives' },
]

interface Props {
  onClose?: () => void
}

export default function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuth()

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
            <p className="text-white font-bold text-sm leading-none tracking-wider">SLIQUID</p>
            <p className="text-slate-500 text-[10px] font-medium tracking-widest mt-0.5">PARTNER PORTAL</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-white md:hidden">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-portal-accent text-white'
                      : 'text-slate-400 hover:text-white hover:bg-surface-elevated',
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

      {/* User footer */}
      <div className="border-t border-portal-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30
                          flex items-center justify-center text-portal-accent text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-slate-500 text-xs truncate capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400
                     hover:text-white hover:bg-surface-elevated text-sm transition-colors duration-150"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
