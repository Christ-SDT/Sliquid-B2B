import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useNotifications } from '@/context/NotificationContext'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { canViewAdmin, isReadOnlyAdmin } from '@/types'
import {
  LayoutDashboard, BookOpen,
  MapPin, Megaphone, GraduationCap, LogOut, X, Users, Moon, Sun, Sparkles,
  Image as ImageIcon, Stethoscope, ShieldCheck, Newspaper, Eye,
} from 'lucide-react'

// restricted: tier1/2/3/6  |  tier23: tier2+tier3 only  |  prospectVisible: tier4  |  adminOnly: tier5 only  |  medicalOnly: admin only  |  hideTier3: hidden from tier3 (Distributor)
const NAV = [
  { to: '/dashboard',          icon: LayoutDashboard, labelKey: 'dashboard', restricted: true,  tier23: false, prospectVisible: true,  managerOnly: false, adminOnly: false, medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/announcements',      icon: Newspaper,       labelKey: 'announcements', restricted: true,  tier23: false, prospectVisible: true,  managerOnly: false, adminOnly: false, medicalOnly: false, hideTier3: false, badgeType: 'new_announcement' },
  { to: '/assets',             icon: BookOpen,        labelKey: 'assets', restricted: true,  tier23: false, prospectVisible: false, managerOnly: false, adminOnly: false, medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/distributors',       icon: MapPin,          labelKey: 'distributors', restricted: true,  tier23: false, prospectVisible: true,  managerOnly: false, adminOnly: false, medicalOnly: false, hideTier3: true,  badgeType: undefined },
  { to: '/trainings',          icon: GraduationCap,   labelKey: 'trainings', restricted: true,  tier23: false, prospectVisible: true,  managerOnly: false, adminOnly: false, medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/creator',            icon: Sparkles,        labelKey: 'creator', restricted: true,  tier23: false, prospectVisible: false, managerOnly: false, adminOnly: false, medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/retailer',           icon: Megaphone,       labelKey: 'retailer', restricted: false, tier23: true,  prospectVisible: true,  managerOnly: false, adminOnly: false, medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/medical-marketing',  icon: Stethoscope,     labelKey: 'medicalMarketing', restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: false, medicalOnly: true,  hideTier3: false, badgeType: undefined },
  { to: '/requests',           icon: Users,           labelKey: 'requests', restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  medicalOnly: false, hideTier3: false, badgeType: 'new_registration' },
  { to: '/marketing-requests', icon: Megaphone,       labelKey: 'marketingRequests', restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  medicalOnly: false, hideTier3: false, badgeType: 'marketing_request' },
  { to: '/media',              icon: ImageIcon,       labelKey: 'media', restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/users',              icon: Users,           labelKey: 'users', restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/gdpr-requests',      icon: ShieldCheck,     labelKey: 'gdprRequests', restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  medicalOnly: false, hideTier3: false, badgeType: undefined },
  { to: '/admin/announcements', icon: Megaphone,      labelKey: 'manageAnnouncements', restricted: false, tier23: false, prospectVisible: false, managerOnly: false, adminOnly: true,  medicalOnly: false, hideTier3: false, badgeType: 'announcement_review' },
]

interface Props {
  onClose?: () => void
}

export default function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { countUnreadByType } = useNotifications()
  const { t } = useTranslation()

  const isRestricted = ['tier1', 'tier2', 'tier3', 'tier6', 'tier7'].includes(user?.role ?? '')

  const role: string | undefined = user?.role
  // `canView` gates admin-only nav rows (adminOnly / medicalOnly / managerOnly).
  // Legal (tier8) is a strict superset of admin here — it sees every admin
  // surface — while write buttons on those pages stay gated on `isAdmin`.
  const canView = canViewAdmin(role ?? '')
  const readOnly = isReadOnlyAdmin(role ?? '')
  const isProspectRole = role === 'tier4'
  // Only treat as pending if the user is still in a prospect/unassigned state.
  // If an admin (or Legal) has already been assigned a real role, show the
  // full nav regardless of status.
  const isPending = user?.status === 'pending' && !canView && !isRestricted && !isProspectRole
  const visibleNav = NAV.filter(item => {
    // `prospectVisible` is effectively dead: this branch short-circuits before
    // any row flag is read, which is why tier4 sees only Dashboard. Do NOT
    // "fix" it by honouring the flag — three rows carry prospectVisible:true
    // (/distributors, /trainings, /retailer) that PROSPECT_ALLOWED in Shell.tsx
    // immediately bounces, so you would render nav links that redirect on click.
    if (isPending || isProspectRole) {
      return item.to === '/dashboard' || item.to === '/announcements'
    }
    if (item.hideTier3 && role === 'tier3') return false
    if (item.adminOnly) return canView
    if (item.medicalOnly) return canView
    if (item.managerOnly) return role === 'tier2' || canView
    if (isRestricted) return item.restricted || (item.tier23 && (role === 'tier2' || role === 'tier3' || role === 'tier7'))
    return true
  })

  return (
    <aside className="flex flex-col h-full bg-surface border-r border-portal-border w-64 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-portal-border">
        <div className="flex items-center gap-3">
          <img
            src="/images/cropped-lotus.png"
            alt={t('sidebar.logoAlt')}
            className="w-8 h-8 object-contain"
          />
          <div>
            <p className="text-on-canvas font-bold text-sm leading-none tracking-wider">SLIQUID</p>
            <p className="text-on-canvas-muted text-[10px] font-medium tracking-widest mt-0.5">{t('sidebar.brand')}</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label={t('sidebar.closeMenu')} className="text-on-canvas-muted hover:text-on-canvas md:hidden">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-0.5">
          {visibleNav.map(({ to, icon: Icon, labelKey, badgeType }) => {
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
                  <span className="flex-1">{t(`nav.${labelKey}`)}</span>
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

      {/* Read-only indicator (Legal / tier8) */}
      {readOnly && (
        <div className="mx-3 mb-3 flex items-start gap-2 px-3 py-2.5 rounded-lg
                        bg-surface-elevated border border-portal-border">
          <Eye className="w-3.5 h-3.5 text-portal-accent flex-shrink-0 mt-0.5" />
          <p className="text-on-canvas-muted text-xs leading-snug">
            {t('sidebar.readOnly')}
          </p>
        </div>
      )}

      {/* Theme toggle */}
      <div className="border-t border-portal-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-on-canvas-subtle">
          {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          <span>{t('theme.wellnessMode')}</span>
        </div>
        <button
          onClick={toggleTheme}
          aria-label={t('theme.toggle')}
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
            <p className="text-on-canvas-muted text-xs truncate">{user?.role ? t(`roles.${user.role}`, { defaultValue: user.role }) : ''}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-on-canvas-subtle
                     hover:text-on-canvas hover:bg-surface-elevated text-sm transition-colors duration-150"
        >
          <LogOut className="w-4 h-4" />
          {t('sidebar.signOut')}
        </button>
      </div>
    </aside>
  )
}
