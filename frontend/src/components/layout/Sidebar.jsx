import { BarChart2, Clock, ClipboardList, LayoutDashboard, LogOut, MessageCircle, Scale, Search, Settings, ShieldCheck, Tag, Upload, Users } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useTheme } from '../../context/ThemeContext'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/upload',     icon: Upload,           label: 'Upload' },
      { to: '/search',     icon: Search,           label: 'Search' },
    ],
  },
  {
    label: 'AI Tools',
    items: [
      { to: '/chat',       icon: MessageCircle,    label: 'Chat' },
      { to: '/compare',    icon: Scale,            label: 'Compare', perm: ['compare', 'use'] },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/analytics',  icon: BarChart2,        label: 'Analytics', perm: ['analytics', 'view'] },
      { to: '/activity',   icon: Clock,            label: 'Activity', badge: true },
      { to: '/team',       icon: Users,            label: 'Team', perm: ['team', 'view'] },
      { to: '/tags',       icon: Tag,              label: 'Tags' },
      { to: '/audit-log',  icon: ClipboardList,    label: 'Audit Log', perm: ['roles', 'view'] },
      { to: '/roles',      icon: ShieldCheck,      label: 'Roles', perm: ['roles', 'view'] },
    ],
  },
]

function hasNavPermission(user, perm) {
  if (!perm) return true
  const [category, action] = perm
  return user?.permissions?.[category]?.[action] === true
}

export default function Sidebar({ isOpen = true }) {
  const { user, logout } = useAuth()
  const { theme } = useTheme()
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '?'

  return (
    <aside style={{ width: '100%', height: '100vh', background: 'var(--color-surface-2)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', zIndex: 30, overflow: 'hidden' }}>
      {/* Logo */}
      <div style={{
        padding: isOpen ? '20px 20px 8px' : '16px 0 8px',
        display: 'flex', alignItems: 'center',
        justifyContent: isOpen ? 'flex-start' : 'center',
        borderBottom: '1px solid var(--color-border)', flexShrink: 0
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: theme === 'light' ? '#6B4EFF' : '#E84E2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 10, color: '#FFFFFF', lineHeight: 1 }}>DI</span>
        </div>
        {isOpen && (
          <span style={{ marginLeft: 10, fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 18, color: 'var(--color-ink)' }}>DocIntel</span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter(({ perm }) => hasNavPermission(user, perm))
          if (!visibleItems.length) return null
          return (
            <div key={gi}>
              {isOpen && group.label && (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', paddingTop: '20px', paddingBottom: '4px', paddingLeft: '20px', marginTop: '8px' }}>
                  {group.label}
                </div>
              )}
              {!isOpen && group.label && <div style={{ height: 16 }} />}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {visibleItems.map(({ to, icon: Icon, label, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={!isOpen ? label : undefined}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center',
                      gap: isOpen ? '10px' : 0,
                      justifyContent: isOpen ? 'flex-start' : 'center',
                      height: '36px',
                      padding: isOpen ? '0 12px 0 13px' : '0',
                      margin: isOpen ? '2px 8px' : '2px 6px',
                      borderRadius: '8px',
                      borderLeft: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
                      background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                      color: isActive ? 'var(--color-ink)' : 'var(--color-muted)',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                      fontWeight: isActive ? 500 : 400,
                      transition: 'all 0.15s ease',
                    })}
                    onMouseEnter={e => {
                      if (!e.currentTarget.getAttribute('aria-current')) {
                        e.currentTarget.style.background = 'var(--color-hover-bg)'
                        e.currentTarget.style.color = 'var(--color-ink)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!e.currentTarget.getAttribute('aria-current')) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--color-muted)'
                      }
                    }}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          size={16}
                          strokeWidth={isActive ? 2 : 1.75}
                          style={{ flexShrink: 0, color: isActive ? 'var(--color-accent)' : 'var(--color-muted)', transition: 'color 0.15s' }}
                        />
                        {isOpen && <span style={{ flex: 1, lineHeight: 1 }}>{label}</span>}
                        {isOpen && badge && unreadCount > 0 && (
                          <span style={{
                            minWidth: 18, height: 18, borderRadius: 999, padding: '0 4px',
                            background: isActive ? 'rgba(255,255,255,0.15)' : 'var(--color-accent)',
                            color: '#FFFFFF',
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                            fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ padding: isOpen ? '12px 8px' : '12px 4px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isOpen ? 'flex-start' : 'center', gap: 10, padding: isOpen ? '6px 12px' : '6px 0', marginBottom: isOpen ? 4 : 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(232,78,42,0.2)', border: '1px solid rgba(232,78,42,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: 'var(--color-accent)', lineHeight: 1 }}>{initials}</span>
          </div>
          {isOpen && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--color-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email}>
                {user?.email ?? '—'}
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: 'var(--color-muted)', margin: '2px 0 0', textTransform: 'capitalize' }}>
                {user?.role ?? 'member'}
              </p>
            </div>
          )}
        </div>
        {isOpen && (
          <>
            <NavLink
              to="/settings"
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '6px 12px', borderRadius: 8, background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                border: 'none', cursor: 'pointer', textDecoration: 'none',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                color: isActive ? 'var(--color-ink)' : 'var(--color-muted)',
                transition: 'color 0.15s, background 0.15s',
              })}
              onMouseEnter={e => { if (!e.currentTarget.getAttribute('aria-current')) { e.currentTarget.style.color = 'var(--color-ink)'; e.currentTarget.style.background = 'var(--color-hover-bg)' } }}
              onMouseLeave={e => { if (!e.currentTarget.getAttribute('aria-current')) { e.currentTarget.style.color = 'var(--color-muted)'; e.currentTarget.style.background = 'transparent' } }}
            >
              <Settings size={14} strokeWidth={1.75} />
              Settings
            </NavLink>
            <button
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--color-muted)', transition: 'color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-ink)'; e.currentTarget.style.background = 'var(--color-hover-bg)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-muted)'; e.currentTarget.style.background = 'transparent' }}
            >
              <LogOut size={14} strokeWidth={1.75} />
              Sign out
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
