import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, Download, FileText, TrendingUp } from 'lucide-react'
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell, Legend, Label,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getAnalytics, exportDocuments } from '../api/analytics'
import { listDocuments } from '../api/documents'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Skeleton } from '../components/ui/Skeleton'
import { LockedState } from '../components/ui/LockedState'
import { isForbidden } from '../lib/http'

const ACCENT = '#E84E2A'
const MUTED  = 'rgba(255,255,255,0.4)'
const BORDER = 'rgba(255,255,255,0.06)'
const PAPER  = 'rgba(255,255,255,0.03)'
const INK    = '#F5F2EC'

const formatDocType = (type) => {
  if (!type) return 'Unknown'
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

const DATE_RANGES = [
  { label: '7 days',   value: '7d'  },
  { label: '30 days',  value: '30d' },
  { label: '3 months', value: '90d' },
]

const PIE_COLORS = [
  '#E84E2A', '#fb923c', '#6366f1', '#3b82f6', '#10b981', '#facc15', '#8b5cf6',
]

const ChartTooltip = ({ active, payload, label }) => {
  const { theme } = useTheme()
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: theme === 'light' ? '#FFFFFF' : '#1A1816', border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '10px 14px', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
      {label && <p style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', marginBottom: 6, fontWeight: 500 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: theme === 'light' ? '#1A1040' : '#FFFFFF', fontWeight: 600 }}>
          {p.name ? `${p.name}: ` : ''}{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, index = 0 }) {
  const { theme } = useTheme()
  return (
    <motion.div
      className="bg-surface border border-border rounded-xl px-5 py-5 hover:border-ink/10 hover:shadow-float transition-all duration-200"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: 'easeOut' }}
      whileHover={{ y: -2, transition: { duration: 0.12 } }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-label text-muted font-body uppercase tracking-[0.07em]">{label}</p>
        {Icon && (
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.12)', border: theme === 'light' ? '1px solid rgba(107,78,255,0.20)' : '1px solid rgba(232,78,42,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} color={theme === 'light' ? '#6B4EFF' : '#E84E2A'} strokeWidth={1.75} />
          </div>
        )}
      </div>
      <p className="font-display text-3xl font-bold text-ink tabular-nums">{value ?? '—'}</p>
      {sub && <p className="mt-1.5 text-xs text-muted font-body">{sub}</p>}
    </motion.div>
  )
}

function ChartCard({ title, action, children, style = {} }) {
  const { theme } = useTheme()
  return (
    <div style={{ background: theme === 'light' ? '#FFFFFF' : '#232120', border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'}`, borderRadius: '16px', padding: '24px', width: '100%', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '14px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)', margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-[100px] rounded-xl" />
        <Skeleton className="h-[100px] rounded-xl" />
      </div>
      <Skeleton className="h-[280px] rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    </div>
  )
}

function ExportButton({ orgId, format, label }) {
  const { theme } = useTheme()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function handleClick() {
    setBusy(true)
    setErr('')
    try {
      await exportDocuments(orgId, format)
    } catch {
      setErr('Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: '9px 18px',
          background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: '10px',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '13px',
          color: busy ? (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)') : (theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)'),
          cursor: busy ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          transition: 'all 0.15s',
          opacity: busy ? 0.6 : 1,
        }}
        onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'white' } }}
        onMouseLeave={e => { e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = busy ? (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)') : (theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)') }}
      >
        <Download size={13} strokeWidth={1.75} />
        {busy ? 'Downloading…' : label}
      </button>
      {err && <p style={{ marginTop: '4px', fontSize: '12px', color: theme === 'light' ? '#6B4EFF' : '#E84E2A', fontFamily: "'DM Sans', sans-serif" }}>{err}</p>}
    </div>
  )
}

export default function Analytics() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const orgId = user?.org_id
  const accent = theme === 'light' ? '#6B4EFF' : ACCENT

  const renderPieLabel = ({ cx, cy, midAngle, outerRadius, percent }) => {
    if (percent < 0.05) return null
    const RAD = Math.PI / 180
    const x = cx + (outerRadius + 22) * Math.cos(-midAngle * RAD)
    const y = cy + (outerRadius + 22) * Math.sin(-midAngle * RAD)
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 11, fill: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans', fontWeight: 500 }}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }
  const role = user?.role

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [avgConfPct, setAvgConfPct] = useState('—')
  const [dateRange, setDateRange] = useState('7d')

  useEffect(() => {
    if (!orgId) return
    getAnalytics(orgId)
      .then(({ data }) => setData(data))
      .catch((err) => {
        if (isForbidden(err)) setForbidden(true)
        else setError('Could not load analytics.')
      })
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    listDocuments(orgId, { limit: 1000 })
      .then(({ data: res }) => {
        const docs = Array.isArray(res) ? res : (res.documents ?? res.items ?? [])
        const completed = docs.filter((d) => d.status === 'completed' && d.confidence_score != null)
        if (!completed.length) return
        const avg = completed.reduce((sum, d) => sum + d.confidence_score, 0) / completed.length
        setAvgConfPct(`${Math.round(avg * 100)}%`)
      })
      .catch(() => {})
  }, [orgId])

  if (loading) return <div className="max-w-4xl"><LoadingSkeleton /></div>

  const permDenied = forbidden || user?.permissions?.analytics?.view === false
  if (permDenied) return <div className="max-w-4xl"><LockedState /></div>

  if (error) {
    return (
      <div className="max-w-4xl">
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700 font-body">{error}</div>
      </div>
    )
  }

  const totalDocs   = data?.total_documents ?? data?.total_docs ?? 0
  const uploadTrend = (data?.upload_trends ?? data?.uploads_over_time ?? []).map((d) => ({
    date: d.date ?? d.day ?? d.period,
    count: d.count ?? d.uploads ?? 0,
  }))
  const docTypes = Object.entries(data?.document_type_breakdown ?? data?.doc_types ?? {}).map(
    ([name, value]) => ({ name: formatDocType(name), value }),
  )
  const entityFreq = (data?.entity_frequency ?? []).slice(0, 10)

  const confidenceDisplay = avgConfPct !== '—' ? avgConfPct : null

  const successRate = (() => {
    const completed = data?.completed_documents ?? 0
    const total = data?.total_documents ?? totalDocs
    return total > 0 ? `${Math.round((completed / total) * 100)}%` : 'N/A'
  })()

  const thisWeekCount = (() => {
    if (!uploadTrend.length) return 0
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    return uploadTrend
      .filter(d => new Date(d.date) >= cutoff)
      .reduce((sum, d) => sum + (d.count || 0), 0)
  })()

  const trendDays = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
  const paddedTrendData = (() => {
    const apiMap = {}
    uploadTrend.forEach(d => { if (d.date) apiMap[d.date] = d.count })
    const result = []
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      result.push({ date: dateStr, count: apiMap[dateStr] ?? 0 })
    }
    return result
  })()

  const pieTotal = docTypes.reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '32px 48px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 className="font-display text-display-md text-ink tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted font-body">Processing statistics for your organisation</p>
        </div>
        <div style={{ display: 'flex', background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)', border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'}`, borderRadius: '10px', padding: '3px', gap: '2px' }}>
          {DATE_RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              style={{
                padding: '6px 14px',
                borderRadius: '7px',
                border: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                fontWeight: dateRange === r.value ? 600 : 400,
                background: dateRange === r.value ? (theme === 'light' ? '#6B4EFF' : '#E84E2A') : 'transparent',
                color: dateRange === r.value ? 'white' : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.55)'),
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total processed" value={totalDocs.toLocaleString()} icon={FileText} index={0} />
        <motion.div
          className="bg-surface border border-border rounded-xl px-5 py-5 hover:border-ink/10 hover:shadow-float transition-all duration-200"
          style={{ borderTop: '2px solid #22c55e' }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12, ease: 'easeOut' }}
          whileHover={{ y: -2, transition: { duration: 0.12 } }}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-label text-muted font-body uppercase tracking-[0.07em]">Success rate</p>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle size={16} color="#22c55e" strokeWidth={1.75} />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-ink tabular-nums">{successRate}</p>
          <p className="mt-1.5 text-xs text-muted font-body">of uploaded documents</p>
        </motion.div>

        <motion.div
          className="bg-surface border border-border rounded-xl px-5 py-5 hover:border-ink/10 hover:shadow-float transition-all duration-200"
          style={{ borderTop: '2px solid #6366f1' }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18, ease: 'easeOut' }}
          whileHover={{ y: -2, transition: { duration: 0.12 } }}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-label text-muted font-body uppercase tracking-[0.07em]">This week</p>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TrendingUp size={16} color="#6366f1" strokeWidth={1.75} />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-ink tabular-nums">{thisWeekCount}</p>
          <p className="mt-1.5 text-xs text-muted font-body">documents uploaded</p>
        </motion.div>
      </div>

      {/* Upload trends */}
      {uploadTrend.length > 0 && (
        <ChartCard title="Upload trends">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={paddedTrendData} margin={{ top: 4, right: 4, left: 16, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={accent} stopOpacity={0.20} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'} strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="date"
                interval={0}
                tick={{ fontSize: 11, fill: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={{ stroke: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)' }}
                tickFormatter={(dateStr) => {
                  try {
                    const d = new Date(dateStr)
                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  } catch { return dateStr }
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Documents', angle: -90, position: 'insideLeft', offset: 14, style: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, fill: theme === 'light' ? '#7B6FA0' : '#8C8A85' } }}
              />
              <Tooltip
                labelFormatter={(dateStr) => {
                  try {
                    const d = new Date(dateStr)
                    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  } catch { return dateStr }
                }}
                contentStyle={{
                  background: theme === 'light' ? '#FFFFFF' : '#2C2926',
                  border: '1px solid ' + (theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.12)'),
                  borderRadius: '10px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.85)',
                }}
                cursor={{ stroke: BORDER }}
              />
              <Area
                type="monotone" dataKey="count" name="Uploads"
                stroke={accent} strokeWidth={2}
                fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: accent }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '100%' }}>
        {/* Document types */}
        {docTypes.length > 0 && (
          <ChartCard title="Document types">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={docTypes} dataKey="value" nameKey="name"
                  cx="50%" cy="45%" outerRadius={80} innerRadius={36}
                  labelLine={false} label={renderPieLabel}
                >
                  {docTypes.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      const { cx, cy } = viewBox
                      return (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                          <tspan x={cx} y={cy - 8} style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '22px', fill: theme === 'light' ? '#1A1040' : 'white' }}>
                            {pieTotal}
                          </tspan>
                          <tspan x={cx} y={cy + 14} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fill: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)' }}>
                            docs
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
                <Legend
                  iconType="circle" iconSize={7}
                  formatter={(v) => <span style={{ fontSize: 11, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans' }}>{formatDocType(v)}</span>}
                />
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Entity frequency */}
        {entityFreq.length > 0 && (
          <ChartCard title="Entity frequency">
            <ResponsiveContainer width="100%" height={entityFreq.length > 6 ? 240 : 180}>
              <BarChart
                data={entityFreq}
                layout="vertical"
                margin={{ top: 0, right: 12, left: 0, bottom: 20 }}
              >
                <CartesianGrid stroke={theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.06)'} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans' }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Occurrences', position: 'insideBottom', offset: -5, style: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, fill: theme === 'light' ? '#7B6FA0' : '#8C8A85' } }}
                />
                <YAxis type="category" dataKey="entity" width={100} tick={{ fontSize: 11, fill: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" name="Frequency" fill={accent} radius={[0, 4, 4, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Export */}
      <div style={{ background: theme === 'light' ? '#FFFFFF' : '#232120', border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'}`, borderRadius: '16px', padding: '20px 24px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '15px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>Export data</h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', margin: 0 }}>
              Download all document records for your organisation.
              CSV includes metadata · JSON includes full extraction data.
            </p>
          </div>
          {role === 'admin' || role === 'analyst' ? (
            <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
              <ExportButton orgId={orgId} format="csv"  label="Export CSV" />
              <ExportButton orgId={orgId} format="json" label="Export JSON" />
            </div>
          ) : (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' }}>Available to Analysts and Admins only.</p>
          )}
        </div>
      </div>
    </div>
  )
}
