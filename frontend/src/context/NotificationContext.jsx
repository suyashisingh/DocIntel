import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getNotifications } from '../api/notifications'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])

  const refresh = useCallback(() => {
    getNotifications()
      .then(({ data }) => setNotifications(data.items ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <NotificationContext.Provider value={{ notifications, setNotifications, unreadCount, refresh }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
