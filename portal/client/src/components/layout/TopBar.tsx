import { useEffect, useRef, useState } from 'react'
import { Bell, Menu, Moon, Sun } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

interface Props {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: Props) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

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
        {/* Notification bell — stubbed */}
        <button
          className="relative w-8 h-8 rounded-lg hover:bg-surface-elevated flex items-center
                     justify-center text-on-canvas-subtle hover:text-on-canvas transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-portal-accent rounded-full" />
        </button>

        {/* Avatar with dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
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

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-portal-border
                            rounded-lg shadow-lg z-50 py-2">
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
