import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'

export interface Notification {
  id: number
  type: string
  title: string
  message: string
  link?: string | null
  read: number // 0 = unread, 1 = read
  created_at: string
}

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  markRead: (id: number) => void
  markAllRead: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markRead: () => {},
  markAllRead: () => {},
})

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications')
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      // silently ignore — e.g. network error, token expired handled by api client
    }
  }, [user])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 45_000) // poll every 45 seconds
    return () => clearInterval(interval)
  }, [fetchNotifications])

  function markRead(id: number) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
    api.put(`/notifications/${id}/read`, {}).catch(() => {})
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })))
    setUnreadCount(0)
    api.put('/notifications/read-all', {}).catch(() => {})
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
