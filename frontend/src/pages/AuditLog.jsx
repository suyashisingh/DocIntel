import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, X } from 'lucide-react'
import { getAuditLogs, exportAuditLogs } from '../api/auditLog'
import { useAuth } from '../context/AuthContext'
import { LockedState } from '../components/ui/LockedState'
import { isForbidden } from '../lib/http'
import { cn } from '../lib/cn'

function formatTs(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const ACTION_STYLE = {
  'document.upload':    { bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'document.delete':    { bg: 'bg-red-100',     fg: 'text-red-700'     },
  'document.reprocess': { bg: 'bg-amber-100',   fg: 'text-amber-700'   },
  'role.created':       { bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'role.updated':       { bg: 'bg-amber-100',   fg: 'text-amber-700'   },
  'role.deleted':       { bg: 'bg-red-100',     fg: 'text-red-700'     },
  'folder.created':     { bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'folder.deleted':     { bg: 'bg-red-100',     fg: 'text-red-700'     },
  'auth.login':         { bg: 'bg-blue-100',    fg: 'text-blue-700'    },
}

const CATEGORY_STYLE = {
  document: { bg: 'bg-blue-100',    fg: 'text-blue-700'    },
  team:     { bg: 'bg-purple-100',  fg: 'text-purple-700'  },
  auth:     { bg: 'bg-blue-100',    fg: 'text-blue-700'    },
  role:     { bg: 'bg-amber-100',   fg: 'text-amber-700'   },
  folder:   { bg: 'bg-emerald-100', fg: 'text-emerald-700' },
}

function actionLabel(action) {
  const sub = action.includes('.') ? action.split('.').slice(1).join('.') : action
  return sub.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function ActionBadge({ action }) {
  const category = action.split('.')[0]
  const s = ACTION_STYLE[action] ?? CATEGORY_STYLE[category] ?? { bg: 'bg-paper', fg: 'text-muted' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium font-body whitespace-nowrap', s.bg, s.fg)}>
      {actionLabel(action)}
    </span>
  )
}

function formatDetailKey(k) {
  return k.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatDetailVal(v) {
  if (typeof v === 'string' && v.length > 0) return v.charAt(0).toUpperCase() + v.slice(1)
  return String(v)
}

function DetailsCell({ details }) {
  if (!details || Object.keys(details).length === 0)
    return <span className="text-muted/50">—</span>
  const entries = Object.entries(details).filter(([k]) => k !== 'id' && !k.endsWith('_id'))
  if (entries.length === 0)
    return <span className="text-muted/50">—</span>
  return (
    <span className="text-xs text-muted font-body">
      {entries.map(([k, v]) => `${formatDetailKey(k)}: ${formatDetailVal(v)}`).join('  ·  ')}
    </span>
  )
}

function formatResource(type, name) {
  if (type === 'auth') return 'Authentication'
  if (type === 'team') return name ? `Team: ${name}` : 'Team'
  if (type === 'document') return name || '—'
  // Generic: capitalise the type and join with the name
  const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : ''
  return name ? `${label}: ${name}` : label || '—'
}

function SortIcon({ col, sortColumn, sortDirection }) {
  if (sortColumn !== col)
    return <ChevronsUpDown size={12} className="ml-1 shrink-0 opacity-40" />
  return sortDirection === 'asc'
    ? <ChevronUp   size={12} className="ml-1 shrink-0" style={{ color: '#E84E2A' }} />
    : <ChevronDown size={12} className="ml-1 shrink-0" style={{ color: '#E84E2A' }} />
}

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'document.upload',     label: 'Document upload' },
  { value: 'document.delete',     label: 'Document delete' },
  { value: 'document.reprocess',  label: 'Document reprocess' },
  { value: 'team.member_added',   label: 'Member added' },
  { value: 'team.member_removed', label: 'Member removed' },
  { value: 'role.created',        label: 'Role created' },
  { value: 'role.updated',        label: 'Role updated' },
  { value: 'role.deleted',        label: 'Role deleted' },
  { value: 'folder.created',      label: 'Folder created' },
  { value: 'folder.deleted',      label: 'Folder deleted' },
  { value: 'auth.login',          label: 'Login' },
]

const PAGE_SIZE = 20

const inputCls = 'px-3 py-2 text-sm font-body border border-border rounded-xl bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition-all'

const thSortCls = 'px-4 py-3 text-label text-muted uppercase tracking-[0.07em] cursor-pointer select-none hover:text-ink transition-colors'
const thCls     = 'px-4 py-3 text-label text-muted uppercase tracking-[0.07em]'

export default function AuditLog() {
  const { user } = useAuth()
  const [items, setItems]         = useState([])
  const [total, setTotal]         = useState(0)
  const [offset, setOffset]       = useState(0)
  const [loading, setLoading]     = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [emailFilter, setEmailFilter]   = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom]               = useState('')
  const [dateTo, setDateTo]                   = useState('')
  const [dateFromFocused, setDateFromFocused] = useState(false)
  const [dateToFocused, setDateToFocused]     = useState(false)

  const [sortColumn, setSortColumn]       = useState('timestamp')
  const [sortDirection, setSortDirection] = useState('desc')
  const [rowsPerPage, setRowsPerPage]     = useState(25)
  const [clientPage, setClientPage]       = useState(1)

  const debounceRef = useRef(null)

  const buildParams = useCallback((off = offset) => {
    const p = { offset: off, limit: PAGE_SIZE }
    if (actionFilter) p.action = actionFilter
    if (dateFrom) p.date_from = dateFrom
    if (dateTo)   p.date_to   = dateTo
    return p
  }, [offset, actionFilter, dateFrom, dateTo])

  const fetchPage = useCallback((off = 0, params = null) => {
    setLoading(true)
    getAuditLogs(params ?? buildParams(off))
      .then(({ data }) => {
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
        setOffset(off)
      })
      .catch((err) => { if (isForbidden(err)) setForbidden(true) })
      .finally(() => setLoading(false))
  }, [buildParams])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPage(0), emailFilter ? 300 : 0)
    return () => clearTimeout(debounceRef.current)
  }, [emailFilter, actionFilter, dateFrom, dateTo]) // eslint-disable-line

  // Reset to page 1 whenever filters, sort column/direction, or rows-per-page change
  useEffect(() => {
    setClientPage(1)
  }, [emailFilter, actionFilter, dateFrom, dateTo, sortColumn, sortDirection, rowsPerPage])

  const displayed = emailFilter
    ? items.filter((r) => r.user_email.toLowerCase().includes(emailFilter.toLowerCase()))
    : items

  function toggleSort(col) {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  const sortedRows = [...displayed].sort((a, b) => {
    let aVal, bVal
    if (sortColumn === 'timestamp') {
      aVal = a.created_at ? new Date(a.created_at).getTime() : 0
      bVal = b.created_at ? new Date(b.created_at).getTime() : 0
    } else if (sortColumn === 'user') {
      aVal = (a.user_email || '').toLowerCase()
      bVal = (b.user_email || '').toLowerCase()
    } else if (sortColumn === 'action') {
      aVal = actionLabel(a.action).toLowerCase()
      bVal = actionLabel(b.action).toLowerCase()
    } else {
      return 0
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  const totalFiltered    = sortedRows.length
  const totalClientPages = Math.max(1, Math.ceil(totalFiltered / rowsPerPage))
  const pageStart        = (clientPage - 1) * rowsPerPage
  const pageEnd          = Math.min(pageStart + rowsPerPage, totalFiltered)
  const pageRows         = sortedRows.slice(pageStart, pageEnd)

  async function handleExport() {
    setExporting(true)
    try {
      const p = {}
      if (actionFilter) p.action = actionFilter
      if (dateFrom) p.date_from = dateFrom
      if (dateTo)   p.date_to   = dateTo
      const { data } = await exportAuditLogs(p)
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'audit_log.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    } finally {
      setExporting(false)
    }
  }

  const hasFilters = emailFilter || actionFilter || dateFrom || dateTo
  const permDenied = !loading && (forbidden || user?.permissions?.roles?.view === false)

  if (permDenied) {
    return (
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <h1 className="font-display text-display-md text-ink tracking-tight">Audit Log</h1>
          <p className="mt-1 text-sm text-muted font-body">Complete record of all actions in your organization</p>
        </div>
        <div className="bg-surface border border-border rounded-xl">
          <LockedState />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-display-md text-ink tracking-tight">Audit Log</h1>
          <p className="mt-1 text-sm text-muted font-body">Complete record of all actions in your organization</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold font-body bg-ink text-surface rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50 transition-all"
        >
          <Download size={14} strokeWidth={1.75} />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <input
          type="text"
          placeholder="Filter by email…"
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
          className={cn(inputCls, 'w-52')}
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className={cn(inputCls, 'w-48')}
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type={dateFromFocused || dateFrom ? 'date' : 'text'}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          onFocus={() => setDateFromFocused(true)}
          onBlur={() => setDateFromFocused(false)}
          placeholder="Start date"
          className={cn(inputCls)}
        />
        <span className="text-[#8C8A85] text-sm select-none px-1">—</span>
        <input
          type={dateToFocused || dateTo ? 'date' : 'text'}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          onFocus={() => setDateToFocused(true)}
          onBlur={() => setDateToFocused(false)}
          placeholder="End date"
          className={cn(inputCls)}
        />
        {hasFilters && (
          <button
            onClick={() => { setEmailFilter(''); setActionFilter(''); setDateFrom(''); setDateTo('') }}
            className="inline-flex items-center gap-1 text-xs font-body text-muted hover:text-ink transition-colors px-2 py-1"
          >
            <X size={11} strokeWidth={2} />
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b border-border bg-paper/40 text-left">
                <th className={cn(thSortCls, 'w-44')} onClick={() => toggleSort('timestamp')}>
                  <span className="inline-flex items-center">
                    Timestamp
                    <SortIcon col="timestamp" sortColumn={sortColumn} sortDirection={sortDirection} />
                  </span>
                </th>
                <th className={cn(thSortCls, 'w-52')} onClick={() => toggleSort('user')}>
                  <span className="inline-flex items-center">
                    User
                    <SortIcon col="user" sortColumn={sortColumn} sortDirection={sortDirection} />
                  </span>
                </th>
                <th className={cn(thSortCls, 'w-36')} onClick={() => toggleSort('action')}>
                  <span className="inline-flex items-center">
                    Action
                    <SortIcon col="action" sortColumn={sortColumn} sortDirection={sortDirection} />
                  </span>
                </th>
                <th className={thCls}>Resource</th>
                <th className={thCls}>Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && [...Array(8)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-3 bg-border/60 rounded animate-pulse w-32" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-border/60 rounded animate-pulse w-36" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-border/60 rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-border/60 rounded animate-pulse w-40" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-border/60 rounded animate-pulse w-28" /></td>
                </tr>
              ))}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-muted font-body">
                    No audit logs yet
                  </td>
                </tr>
              )}
              {!loading && pageRows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  className="hover:bg-paper/40 transition-colors"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.025, 0.25) }}
                >
                  <td className="px-4 py-3 text-xs text-muted font-mono whitespace-nowrap tabular-nums">{formatTs(row.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-ink truncate max-w-[200px]" title={row.user_email}>{row.user_email}</td>
                  <td className="px-4 py-3"><ActionBadge action={row.action} /></td>
                  <td className="px-4 py-3 text-xs text-ink font-body max-w-[220px] truncate">
                    {formatResource(row.resource_type, row.resource_name)}
                  </td>
                  <td className="px-4 py-3"><DetailsCell details={row.details} /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Client-side pagination footer */}
        {!loading && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
            <div className="flex items-center gap-4">
              <p className="text-xs text-muted font-body tabular-nums">
                {totalFiltered === 0
                  ? 'No entries'
                  : `Showing ${pageStart + 1}–${pageEnd} of ${totalFiltered} entries`}
              </p>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted font-body">Rows per page</label>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setClientPage(1) }}
                  className="text-xs font-body border border-border rounded-lg px-2 py-1 bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
                >
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setClientPage((p) => p - 1)}
                disabled={clientPage === 1}
                className="px-3 py-1.5 text-xs font-body border border-border rounded-lg text-muted hover:text-ink hover:border-ink/20 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="px-2 text-xs text-muted font-body tabular-nums">
                {clientPage} / {totalClientPages}
              </span>
              <button
                onClick={() => setClientPage((p) => p + 1)}
                disabled={clientPage >= totalClientPages}
                className="px-3 py-1.5 text-xs font-body border border-border rounded-lg text-muted hover:text-ink hover:border-ink/20 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
