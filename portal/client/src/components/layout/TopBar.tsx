import { Bell, Menu } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface Props {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: Props) {
  const { user } = useAuth()

  return (
    <header className="h-14 bg-surface border-b border-portal-border flex items-center
                       justify-between px-4 md:px-6 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="md:hidden text-slate-400 hover:text-white transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        {/* Notification bell — stubbed */}
        <button
          className="relative w-8 h-8 rounded-lg hover:bg-surface-elevated flex items-center
                     justify-center text-slate-400 hover:text-white transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-portal-accent rounded-full" />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30
                          flex items-center justify-center text-portal-accent text-xs font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-white text-sm font-medium leading-none">{user?.name}</p>
            <p className="text-slate-500 text-xs mt-0.5 capitalize">{user?.company ?? user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
