import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './Sidebar'
import NotificationBell from '../NotificationBell'
import { NotificationProvider } from '../../context/NotificationContext'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const pageVariants = {
  initial:  { opacity: 0, y: 12 },
  animate:  { opacity: 1, y: 0,  transition: { duration: 0.25, ease: 'easeOut' } },
  exit:     { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn'  } },
}

function PageTransition({ children }) {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export default function AppLayout({ children }) {
  const { user } = useAuth()
  const { theme } = useTheme()
  const avatarInitial = user?.email?.charAt(0).toUpperCase() || '?'
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <NotificationProvider>
      <div className="app-dark" style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex' }}>
        {/* Background depth orbs — fixed behind all content */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', top: -200, right: -200,
            width: 900, height: 900, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(232,78,42,0.0125) 0%, transparent 70%)',
            filter: 'blur(160px)', pointerEvents: 'none', zIndex: 0,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', bottom: -200, left: 100,
            width: 700, height: 700, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,158,11,0.01) 0%, transparent 70%)',
            filter: 'blur(140px)', pointerEvents: 'none', zIndex: 0,
          }}
        />

        <motion.div
          animate={{ width: sidebarOpen ? 240 : 56 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          style={{ overflow: 'hidden', flexShrink: 0, position: 'sticky', top: 0, height: '100vh' }}
        >
          <Sidebar isOpen={sidebarOpen} />
        </motion.div>
        <motion.div
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 1, background: 'var(--color-bg)' }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          {/* Top bar */}
          <header style={{ position: 'sticky', top: 0, zIndex: 20, height: 'var(--header-height, 56px)', background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: '8px',
                color: 'var(--color-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '8px',
                flexShrink: 0
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-hover-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ display: 'block', width: '16px', height: '1.5px', background: 'var(--color-ink)', borderRadius: '2px', transition: 'all 0.2s' }} />
              <span style={{ display: 'block', width: '16px', height: '1.5px', background: 'var(--color-ink)', borderRadius: '2px', transition: 'all 0.2s' }} />
              <span style={{ display: 'block', width: '16px', height: '1.5px', background: 'var(--color-ink)', borderRadius: '2px', transition: 'all 0.2s' }} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <NotificationBell />
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: theme === 'light' ? '#6B4EFF' : '#E84E2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '13px', color: 'white', cursor: 'pointer', flexShrink: 0 }}>
                {avatarInitial}
              </div>
            </div>
          </header>
          {/* Content */}
          <main style={{ flex: 1, padding: 'var(--content-padding, 32px)', position: 'relative', zIndex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <PageTransition>
              {children}
            </PageTransition>
          </main>
        </motion.div>
      </div>
    </NotificationProvider>
  )
}
