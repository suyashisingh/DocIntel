import { useEffect, useRef, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { markAllRead, markOneRead, deleteNotification } from '../api/notifications'
import { useNotifications } from '../context/NotificationContext'
import { useTheme } from '../context/ThemeContext'

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const TYPE_DOT = {
  success: '#4ade80',
  error:   '#E84E2A',
  warning: '#facc15',
  info:    '#60a5fa',
}

export default function NotificationBell() {
  const { notifications, setNotifications, unreadCount } = useNotifications()
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function onMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  async function handleClickNotification(n) {
    if (!n.is_read) {
      await markOneRead(n.id).catch(() => {})
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  async function handleMarkAllRead() {
    await markAllRead().catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    await deleteNotification(id).catch(() => {})
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label="Notifications"
        style={{
          position: 'relative', padding: 8, borderRadius: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: open ? (theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.9)') : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.5)'),
          transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent' } }}
      >
        <Bell size={17} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 999, padding: '0 3px',
            background: theme === 'light' ? '#6B4EFF' : '#E84E2A', color: '#FFFFFF',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 320, background: theme === 'light' ? '#FFFFFF' : '#1A1816',
          border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: theme === 'light' ? '#1A1040' : '#FFFFFF', margin: 0 }}>Notifications</h3>
              {unreadCount > 0 && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)' }}>{unreadCount} unread</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={e => e.target.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.8)'}
                onMouseLeave={e => e.target.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)'}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <Bell size={18} strokeWidth={1.5} style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)', margin: '0 auto 8px', display: 'block' }} />
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.3)', margin: 0 }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px', cursor: 'pointer',
                    borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.04)',
                    background: !n.is_read ? (theme === 'light' ? 'rgba(107,78,255,0.05)' : 'rgba(232,78,42,0.05)') : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = !n.is_read ? (theme === 'light' ? 'rgba(107,78,255,0.05)' : 'rgba(232,78,42,0.05)') : 'transparent'}
                >
                  <span style={{
                    flexShrink: 0, marginTop: 7,
                    width: 6, height: 6, borderRadius: '50%',
                    background: !n.is_read ? (TYPE_DOT[n.type] ?? (theme === 'light' ? '#6B4EFF' : '#FFFFFF')) : 'transparent',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.4, color: theme === 'light' ? '#1A1040' : '#FFFFFF', fontWeight: !n.is_read ? 500 : 400, margin: '0 0 3px 0' }}>
                      {n.title}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', lineHeight: 1.5, margin: '0 0 4px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {n.message}
                    </p>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)', margin: 0 }}>{timeAgo(n.created_at)}</p>
                  </div>
                  <button
                    onClick={e => handleDelete(e, n.id)}
                    aria-label="Delete notification"
                    style={{ flexShrink: 0, marginTop: 2, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)', opacity: 0, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = theme === 'light' ? '#1A1040' : '#FFFFFF'; e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'transparent' }}
                    className="group-hover-show"
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div style={{ borderTop: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.06)', padding: '10px 16px' }}>
              <button
                onClick={() => { setOpen(false); navigate('/activity') }}
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'center', transition: 'color 0.15s' }}
                onMouseEnter={e => e.target.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.8)'}
                onMouseLeave={e => e.target.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)'}
              >
                View all activity →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
