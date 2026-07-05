import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bell, CheckCircle, GitCompare, RefreshCw, Search, Trash2, Upload, X, XCircle } from 'lucide-react'
import { getNotifications, markAllRead, markOneRead } from '../api/notifications'
import { useNotifications } from '../context/NotificationContext'
import { useTheme } from '../context/ThemeContext'
import { Skeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/cn'

function formatTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const seconds = Math.floor((now - date) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${timeStr}`

  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${dateLabel} ${timeStr}`
}

function getDateGroupKey(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const yesterdayD = new Date(now)
  yesterdayD.setDate(yesterdayD.getDate() - 1)
  if (date.toDateString() === now.toDateString()) return 'Today'
  if (date.toDateString() === yesterdayD.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function groupByDate(items) {
  const result = []
  let currentKey = null
  let currentGroup = null
  items.forEach(item => {
    const key = getDateGroupKey(item.created_at)
    if (key !== currentKey) {
      currentKey = key
      currentGroup = { key, items: [] }
      result.push(currentGroup)
    }
    currentGroup.items.push(item)
  })
  return result
}

// Change 6: GitCompare replaces Scale for comparison activity
const ACTIVITY_META = {
  'Document uploaded':  { Icon: Upload,      bg: 'bg-blue-50',    fg: 'text-blue-600'    },
  'Document ready':     { Icon: CheckCircle, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  'Processing failed':  { Icon: XCircle,     bg: 'bg-red-50',     fg: 'text-red-500'     },
  'Document deleted':   { Icon: Trash2,      bg: 'bg-paper',      fg: 'text-muted'       },
  'Reprocess started':  { Icon: RefreshCw,   bg: 'bg-amber-50',   fg: 'text-amber-600'   },
  'Comparison ready':   { Icon: GitCompare,  bg: 'bg-violet-50',  fg: 'text-violet-600'  },
}

// Change 3: icon circle reduced to w-6 h-6, icon to size 11
function ActivityIcon({ title }) {
  const meta = ACTIVITY_META[title] ?? { Icon: Bell, bg: 'bg-paper', fg: 'text-muted' }
  const { Icon, bg, fg } = meta
  return (
    <div className={cn('shrink-0 w-6 h-6 rounded-full border border-border flex items-center justify-center', bg)}>
      <Icon size={11} className={fg} strokeWidth={1.75} />
    </div>
  )
}

const DOCUMENT_TITLES   = new Set(['Document uploaded', 'Document deleted'])
const PROCESSING_TITLES = new Set(['Document ready', 'Processing failed', 'Reprocess started'])

function matchesTab(item, tab) {
  if (tab === 'all')        return true
  if (tab === 'documents')  return DOCUMENT_TITLES.has(item.title)
  if (tab === 'processing') return PROCESSING_TITLES.has(item.title)
  if (tab === 'other')      return !DOCUMENT_TITLES.has(item.title) && !PROCESSING_TITLES.has(item.title)
  return true
}

const TABS = [
  { key: 'all',        label: 'All' },
  { key: 'documents',  label: 'Documents' },
  { key: 'processing', label: 'Processing' },
  { key: 'other',      label: 'Other' },
]

const PAGE_SIZE = 20

export default function Activity() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { refresh: refreshBell, unreadCount: contextUnreadCount } = useNotifications()

  const [items, setItems]             = useState([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeTab, setActiveTab]     = useState('all')

  // Change 1: local filter state — no API calls
  const [search,   setSearch]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const loadPage = useCallback((offset, replace = false) => {
    const setter = replace ? setLoading : setLoadingMore
    setter(true)
    getNotifications(offset, PAGE_SIZE)
      .then(({ data }) => {
        const incoming = data.items ?? []
        setTotal(data.total ?? 0)
        setItems((prev) => (replace ? incoming : [...prev, ...incoming]))
      })
      .catch(() => {})
      .finally(() => setter(false))
  }, [])

  useEffect(() => { loadPage(0, true) }, [loadPage])

  async function handleClick(item) {
    if (!item.is_read) {
      await markOneRead(item.id).catch(() => {})
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_read: true } : x)))
      refreshBell()
    }
    if (item.link) navigate(item.link)
  }

  async function handleMarkAllRead() {
    await markAllRead().catch(() => {})
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    refreshBell()
  }

  // Change 1: client-side filtering pipeline
  const tabFiltered = items.filter((item) => matchesTab(item, activeTab))
  const displayItems = tabFiltered.filter((item) => {
    const q = search.trim().toLowerCase()
    if (q && !item.title.toLowerCase().includes(q) && !(item.message ?? '').toLowerCase().includes(q)) return false
    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      if (new Date(item.created_at) < from) return false
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      if (new Date(item.created_at) > to) return false
    }
    return true
  })

  const canLoadMore = items.length < total
  const hasFilters = search || dateFrom || dateTo

  // Sidebar computed values
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount      = items.filter(d => new Date(d.created_at) >= todayStart).length
  const docTypeCount    = items.filter(d => DOCUMENT_TITLES.has(d.title)).length
  const processingCount = items.filter(d => PROCESSING_TITLES.has(d.title)).length
  const otherCount      = items.length - docTypeCount - processingCount

  // Change 4: group display items by date
  const groups = groupByDate(displayItems)

  return (
    <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', width: '100%' }}>

      {/* ── Main feed ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-display-md text-ink tracking-tight">Activity</h1>
            <p className="mt-1 text-sm text-muted font-body">Your recent actions and updates</p>
          </div>
          {contextUnreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="shrink-0 mt-1 text-xs font-body font-medium text-muted hover:text-ink transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Change 2: Tabs with #E84E2A active indicator */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const inactiveColor = theme === 'light' ? '#7B6FA0' : '#8C8A85'
            const hoverColor = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)'
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '0 16px 10px',
                  fontSize: '14px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#E84E2A' : inactiveColor,
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #E84E2A' : '2px solid transparent',
                  marginBottom: '-1px',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = hoverColor }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = inactiveColor }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Change 1: Search + date filter bar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <Search size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search activity…"
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '32px',
                paddingRight: search ? '30px' : '10px',
                background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
                border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)',
                borderRadius: '8px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(232,78,42,0.50)'}
              onBlur={e => e.target.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <input
            type="text"
            placeholder="From"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            onFocus={e => { e.target.type = 'date'; e.target.style.borderColor = 'rgba(232,78,42,0.50)' }}
            onBlur={e => { if (!e.target.value) e.target.type = 'text'; e.target.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)' }}
            style={{
              height: '34px',
              padding: '0 10px',
              background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
              border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)',
              borderRadius: '8px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.70)',
              outline: 'none',
              colorScheme: theme === 'light' ? 'light' : 'dark',
              width: '110px',
              transition: 'border-color 0.15s',
            }}
          />

          <input
            type="text"
            placeholder="To"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            onFocus={e => { e.target.type = 'date'; e.target.style.borderColor = 'rgba(232,78,42,0.50)' }}
            onBlur={e => { if (!e.target.value) e.target.type = 'text'; e.target.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)' }}
            style={{
              height: '34px',
              padding: '0 10px',
              background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
              border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)',
              borderRadius: '8px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.70)',
              outline: 'none',
              colorScheme: theme === 'light' ? 'light' : 'dark',
              width: '110px',
              transition: 'border-color 0.15s',
            }}
          />

          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
              style={{
                height: '34px',
                padding: '0 10px',
                background: 'none',
                border: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)',
                cursor: 'pointer',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)'}
              onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)'}
            >
              Clear
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-1.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 bg-surface border border-border rounded-xl">
                <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2.5 w-2/3" />
                </div>
                <Skeleton className="h-2.5 w-16 shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayItems.length === 0 && (
          <div className="text-center py-20">
            <div className="w-10 h-10 rounded-xl bg-paper border border-border flex items-center justify-center mx-auto mb-3">
              <Bell size={16} strokeWidth={1.5} className="text-muted" />
            </div>
            <p className="text-sm font-semibold text-ink font-display mb-1">No activity</p>
            <p className="text-xs text-muted font-body">
              {hasFilters
                ? 'No items match your filters.'
                : activeTab === 'all'
                  ? 'Start by uploading a document.'
                  : `No ${activeTab} activity yet.`}
            </p>
          </div>
        )}

        {/* Change 4: Activity list grouped by date */}
        {!loading && displayItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {groups.map((group, gi) => {
              const offset = groups.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0)
              return (
                <div key={group.key} style={{ marginTop: gi > 0 ? '12px' : '0' }}>
                  {/* Date group divider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      color: theme === 'light' ? '#7B6FA0' : '#8C8A85',
                      flexShrink: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}>
                      {group.key}
                    </span>
                    <div style={{ flex: 1, height: '1px', background: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.07)' }} />
                  </div>

                  {/* Items in this group */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {group.items.map((item, i) => (
                      <motion.div
                        key={item.id}
                        onClick={() => handleClick(item)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 rounded-xl border cursor-pointer transition-all duration-150 group',
                          !item.is_read
                            ? 'bg-accent/5 border-accent/20 hover:border-accent/30'
                            : 'bg-surface border-border hover:border-ink/15 hover:bg-paper/40'
                        )}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min((offset + i) * 0.03, 0.3), ease: 'easeOut' }}
                      >
                        <ActivityIcon title={item.title} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium font-body text-ink leading-snug truncate">
                              {item.title}
                            </p>
                            {!item.is_read && (
                              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />
                            )}
                          </div>
                          <p className="text-xs text-muted font-body leading-snug line-clamp-1">
                            {item.message}
                          </p>
                        </div>

                        {/* Change 5: timestamp with readable contrast */}
                        <p style={{ flexShrink: 0, fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : '#A8A5A0', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                          {formatTime(item.created_at)}
                        </p>

                        {item.link && (
                          <span className="shrink-0 text-xs font-body text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                            →
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Load more */}
        {!loading && canLoadMore && activeTab === 'all' && !hasFilters && (
          <div className="mt-5 text-center">
            <button
              onClick={() => loadPage(items.length)}
              disabled={loadingMore}
              className="px-5 py-2 text-sm font-body font-medium text-muted border border-border rounded-xl hover:text-ink hover:border-ink/20 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? 'Loading…' : `Load more (${total - items.length} remaining)`}
            </button>
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div style={{ width: '260px', flexShrink: 0, position: 'sticky', top: '80px' }}>
        <div style={{ background: theme === 'light' ? '#FFFFFF' : '#232120', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '20px' }}>

          {/* Today count */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Today</p>
            <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '28px', color: theme === 'light' ? '#1A1040' : 'white', margin: '0 0 2px' }}>{todayCount}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)', margin: 0 }}>actions logged</p>
          </div>

          <div style={{ height: '1px', background: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)', margin: '0 0 16px' }} />

          {/* Type breakdown */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>By type</p>
            {[
              { label: 'Documents',  count: docTypeCount,    color: '#3b82f6' },
              { label: 'Processing', count: processingCount, color: '#10b981' },
              { label: 'Other',      count: otherCount,      color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.60)' }}>{label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 600, color }}>{count}</span>
              </div>
            ))}
          </div>

          <div style={{ height: '1px', background: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)', margin: '0 0 16px' }} />

          {/* Jump to top */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{
              width: '100%',
              padding: '9px',
              background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)',
              border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.55)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'white' }}
            onMouseLeave={e => { e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.55)' }}
          >
            ↑ Jump to top
          </button>
        </div>
      </div>

    </div>
  )
}
