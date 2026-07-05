import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Download, History, Scale, Sparkles, Table2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { getDocument, getDocumentVersions, reprocessDocument, deleteDocument, downloadDocument, getDocumentQAHistory, setRetention, scanDocumentPII, redactDocumentPII } from '../api/documents'
import { getDocumentTags, removeTagFromDocument } from '../api/tags'
import { getDocumentTables } from '../api/tables'
import TableViewer from '../components/TableViewer'
import TagBadge from '../components/TagBadge'
import TagSelector from '../components/TagSelector'
import { useAuth } from '../context/AuthContext'
import { Skeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/cn'

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

function ConfidenceBar({ score }) {
  const pct = Math.round((score ?? 0) * 100)
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(
        'text-xs font-mono font-semibold tabular-nums shrink-0',
        pct >= 80 ? 'text-emerald-700' : pct >= 60 ? 'text-amber-700' : 'text-red-600'
      )}>
        {pct}%
      </span>
    </div>
  )
}

const ENTITY_LABELS = {
  PERSON: 'People', ORG: 'Organizations', DATE: 'Dates', MONEY: 'Amounts',
  GPE: 'Places', PRODUCT: 'Products', EVENT: 'Events', LOC: 'Locations',
}

// Fix 5: static color map keyed by uppercased display label
const ENTITY_COLORS = {
  ORGANIZATIONS: 'rgba(107,78,255,0.08)',
  PEOPLE:        'rgba(34,197,94,0.08)',
  PLACES:        'rgba(59,130,246,0.08)',
  DATES:         'rgba(234,179,8,0.08)',
  ORDINAL:       'rgba(249,115,22,0.08)',
  DEFAULT:       'rgba(255,255,255,0.03)',
}

const ENTITY_BORDER_COLORS = {
  ORGANIZATIONS: 'rgba(107,78,255,0.15)',
  PEOPLE:        'rgba(34,197,94,0.15)',
  PLACES:        'rgba(59,130,246,0.15)',
  DATES:         'rgba(234,179,8,0.15)',
  ORDINAL:       'rgba(249,115,22,0.15)',
  DEFAULT:       'rgba(255,255,255,0.08)',
}

// Fix 6: shared section header style
const SECTION_HDR = 'text-sm font-semibold uppercase tracking-wider text-[#8C8A85] font-body'

function EntityCard({ type, values }) {
  // Fix 5: resolve color by display label
  const displayLabel = ENTITY_LABELS[type] ?? type
  const colorKey = displayLabel.toUpperCase()
  const bgColor     = ENTITY_COLORS[colorKey]      ?? ENTITY_COLORS.DEFAULT
  const borderColor = ENTITY_BORDER_COLORS[colorKey] ?? ENTITY_BORDER_COLORS.DEFAULT

  return (
    <div style={{ background: bgColor, borderColor }} className="border rounded-xl p-4">
      <p className={cn(SECTION_HDR, 'mb-3')}>{displayLabel}</p>
      <div className="flex flex-wrap gap-1.5">
        {/* Fix 7: plain span only, String() guards against any non-string value */}
        {values.map((v, i) => (
          <span key={i} className="inline-block bg-paper border border-border rounded-lg px-2.5 py-1 text-xs text-ink font-body">
            {String(v)}
          </span>
        ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="max-w-3xl space-y-6">
      <Skeleton className="h-4 w-28" />
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  )
}

// ── PII Detection ─────────────────────────────────────────────────────────────

const PII_LABELS = {
  aadhaar: 'Aadhaar', pan: 'PAN', phone: 'Phone', email: 'Email',
  person: 'Person', credit_card: 'Credit Card',
}
const PII_KEYS = Object.keys(PII_LABELS)

function PIISection({ docId, doc, onRefresh }) {
  const [results, setResults]       = useState(null)
  const [scanning, setScanning]     = useState(false)
  const [scanError, setScanError]   = useState('')
  const [checked, setChecked]       = useState(new Set())
  const [redacting, setRedacting]   = useState(false)
  const [redactDone, setRedactDone] = useState(null)

  const alreadyRedacted = doc?.pii_redacted

  async function handleScan() {
    setScanning(true)
    setScanError('')
    try {
      const { data } = await scanDocumentPII(docId)
      setResults(data)
      const found = PII_KEYS.filter((k) => (data[k] ?? []).length > 0)
      setChecked(new Set(found))
    } catch {
      setScanError('Scan failed. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  async function handleRedact() {
    setRedacting(true)
    try {
      const { data } = await redactDocumentPII(docId, Array.from(checked))
      setRedactDone(data)
      onRefresh()
    } catch {
      setScanError('Redaction failed. Please try again.')
    } finally {
      setRedacting(false)
    }
  }

  function toggleType(key) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (alreadyRedacted) {
    const types = doc.pii_redacted_types ?? []
    const when = doc.pii_redacted_at
      ? new Date(doc.pii_redacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm font-semibold text-ink">PII Detection</h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-body bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Redacted
          </span>
        </div>
        {types.length > 0 && (
          <p className="text-xs text-muted font-body">
            Redacted: {types.map((t) => PII_LABELS[t] ?? t).join(', ')}
            {when && <span className="ml-2">· {when}</span>}
          </p>
        )}
      </div>
    )
  }

  const foundTypes = results ? PII_KEYS.filter((k) => (results[k] ?? []).length > 0) : []
  const hasResults = results !== null

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm font-semibold text-ink">PII Detection</h2>
        {!hasResults && (
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-3 py-1.5 text-xs font-semibold font-body bg-ink text-surface rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {scanning ? 'Scanning…' : 'Scan for PII'}
          </button>
        )}
      </div>

      {scanError && <p className="text-xs text-red-600 font-body mb-3">{scanError}</p>}

      {scanning && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-3" />)}
        </div>
      )}

      {hasResults && !scanning && (
        <>
          {redactDone ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-body bg-emerald-50 text-emerald-700 border border-emerald-200">
              ✓ {redactDone.redacted_count} item{redactDone.redacted_count !== 1 ? 's' : ''} redacted
            </span>
          ) : results.total_count === 0 ? (
            <p className="text-xs text-muted font-body py-1">No PII detected.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2.5 mb-4">
                {foundTypes.map((key) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked.has(key)}
                      onChange={() => toggleType(key)}
                      className="w-3.5 h-3.5 rounded accent-[#E84E2A] cursor-pointer"
                    />
                    <span className="text-xs font-body text-ink">
                      {PII_LABELS[key]}
                      <span className="ml-1 text-muted">({results[key].length})</span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={handleRedact}
                disabled={redacting || checked.size === 0}
                className="px-3 py-1.5 text-xs font-semibold font-body border border-red-200 text-red-600 bg-red-50 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {redacting ? 'Redacting…' : 'Redact Selected'}
              </button>
            </>
          )}
          {!redactDone && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="mt-3 ml-2 text-xs font-body text-muted hover:text-ink transition-colors"
            >
              Re-scan
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'summary',   label: 'Summary' },
  { id: 'questions', label: 'Questions' },
  { id: 'entities',  label: 'Entities' },
  { id: 'tables',    label: 'Tables' },
  { id: 'history',   label: 'History' },
]

export default function DocumentResults() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const orgId = user?.org_id
  const role = user?.role

  const [data, setData]         = useState(null)
  const [versions, setVersions] = useState([])
  const [tables, setTables]     = useState([])
  const [docTags, setDocTags]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [reprocessing, setReprocessing] = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [actionError, setActionError]   = useState('')

  const [retentionMode, setRetentionMode]     = useState('none')
  const [customDate, setCustomDate]           = useState('')
  const [savingRetention, setSavingRetention] = useState(false)
  const [retentionError, setRetentionError]   = useState('')

  const [qaItems, setQaItems]             = useState([])
  const [qaTotal, setQaTotal]             = useState(0)
  const [qaOffset, setQaOffset]           = useState(0)
  const [qaLoadingMore, setQaLoadingMore] = useState(false)
  const [expandedQa, setExpandedQa]       = useState(new Set())
  const [showAllQA, setShowAllQA]         = useState(false)
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    const limit = showAllQA ? 50 : 3
    getDocumentQAHistory(id, limit, 0)
      .then((response) => {
        setQaItems(response.data.items ?? [])
        setQaTotal(response.data.total ?? 0)
        setQaOffset(limit)
      })
      .catch(() => {})
  }, [id, showAllQA])

  function loadMoreQa() {
    setQaLoadingMore(true)
    getDocumentQAHistory(id, 10, qaOffset)
      .then(({ data: res }) => {
        setQaItems((prev) => [...prev, ...(res.items ?? [])])
        setQaTotal(res.total ?? 0)
        setQaOffset((prev) => prev + 10)
      })
      .catch(() => {})
      .finally(() => setQaLoadingMore(false))
  }

  function toggleQa(qaId) {
    setExpandedQa((prev) => {
      const next = new Set(prev)
      next.has(qaId) ? next.delete(qaId) : next.add(qaId)
      return next
    })
  }

  function scrollTo(sectionId) {
    setActiveSection(sectionId)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchResults = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      getDocument(id),
      getDocumentVersions(id),
      getDocumentTables(id).catch(() => ({ data: [] })),
      getDocumentTags(id).catch(() => ({ data: [] })),
    ])
      .then(([{ data: latest }, { data: vers }, { data: tbls }, { data: tagList }]) => {
        setData(latest)
        setVersions(Array.isArray(vers) ? vers : [])
        setTables(Array.isArray(tbls) ? tbls : [])
        setDocTags(Array.isArray(tagList) ? tagList : [])
      })
      .catch(() => setError('Could not load document results.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchResults() }, [fetchResults])

  useEffect(() => {
    if (!data) return
    const days = data.retention_days
    if (!days) {
      setRetentionMode('none')
    } else if ([30, 60, 90, 365].includes(days)) {
      setRetentionMode(String(days))
    } else {
      setRetentionMode('custom')
      if (data.expires_at) setCustomDate(new Date(data.expires_at).toISOString().split('T')[0])
    }
  }, [data?.retention_days])

  async function handleSaveRetention() {
    setSavingRetention(true)
    setRetentionError('')
    try {
      const payload = {}
      if (retentionMode === 'none') {
        payload.retention_days = null
      } else if (retentionMode === 'custom') {
        if (!customDate) { setSavingRetention(false); return }
        const selected = new Date(customDate)
        const days = Math.ceil((selected - new Date()) / 86400000)
        if (days <= 0) { setRetentionError('Custom date must be in the future'); setSavingRetention(false); return }
        payload.retention_days = days
      } else {
        payload.retention_days = parseInt(retentionMode, 10)
      }
      const { data: result } = await setRetention(id, payload)
      setData((prev) => ({ ...prev, expires_at: result.expires_at, retention_days: result.retention_days }))
    } catch (err) {
      setRetentionError(err.response?.data?.detail || 'Could not save retention policy')
    } finally {
      setSavingRetention(false)
    }
  }

  async function handleReprocess() {
    setReprocessing(true)
    setActionError('')
    try {
      await reprocessDocument(orgId, data?.document_id)
      fetchResults()
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Reprocess failed. Please try again.')
    } finally {
      setReprocessing(false)
    }
  }

  async function handleDownload() {
    try {
      const response = await downloadDocument(id)
      const url = URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = data?.original_filename || `document-${id}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setActionError('Download failed. Please try again.')
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setActionError('')
    try {
      await deleteDocument(orgId, data?.document_id)
      navigate('/dashboard')
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Delete failed. Please try again.')
      setDeleting(false)
    }
  }

  if (loading) return <div className="max-w-3xl"><LoadingSkeleton /></div>

  if (error) {
    return (
      <div className="max-w-3xl">
        <Link to="/dashboard" className="text-sm text-muted hover:text-ink font-body transition-colors">
          ← Back to dashboard
        </Link>
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700 font-body">{error}</div>
      </div>
    )
  }

  const doc = data ?? {}
  const extracted = data?.structured_json ?? {}
  const isInvoice = extracted.document_type === 'invoice'
  const rawEntities = Array.isArray(extracted.entities) ? extracted.entities : []
  const entityGroups = rawEntities.reduce((acc, { label, text }) => {
    if (!acc[label]) acc[label] = []
    acc[label].push(text)
    return acc
  }, {})
  // Fix 2 + 3: exclude CARDINAL, require >= 2 values per category
  const entityTypes = Object.entries(entityGroups).filter(
    ([type, vals]) => type !== 'CARDINAL' && vals.length >= 2
  )

  const inputCls = 'text-xs font-body bg-paper border border-border rounded-xl px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent/40'

  return (
    <motion.div
      className="flex flex-row min-h-full overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 pr-2">
        <p className="text-[10px] text-[#8C8A85] uppercase tracking-widest font-body mb-2 px-3">Document</p>
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ id: navId, label }) => (
            <button
              key={navId}
              type="button"
              onClick={() => scrollTo(navId)}
              className={cn(
                'text-sm px-3 py-1.5 rounded-md cursor-pointer text-left transition-colors',
                activeSection === navId
                  ? 'text-[#F5F2EC] bg-white/[0.08] font-medium'
                  : 'text-[#8C8A85] hover:text-[#F5F2EC] hover:bg-white/5'
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Divider */}
      <div className="self-stretch mx-2" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }} />

      {/* Right column */}
      <div className="flex-1 pl-8 pr-6 pb-16 space-y-6 overflow-hidden">
        {/* Back */}
        <Link to="/dashboard" className="inline-flex items-center text-sm text-muted hover:text-ink font-body transition-colors">
          ← Back to dashboard
        </Link>

        {/* AI Summary */}
        {doc.summary && (
          <div id="summary" className="bg-paper border border-border rounded-xl p-4">
            {/* Fix 6: consistent section header */}
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#8C8A85]" strokeWidth={1.75} />
              <p className={SECTION_HDR}>AI Summary</p>
            </div>
            <p className="text-sm font-body text-ink leading-relaxed">{doc.summary}</p>
          </div>
        )}

        {/* Suggested questions */}
        {Array.isArray(doc.suggested_questions) && doc.suggested_questions.length > 0 && (
          <div id="questions">
            {/* Fix 6 */}
            <div className="flex items-center gap-1.5 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#8C8A85]" strokeWidth={1.75} />
              <p className={SECTION_HDR}>Try asking</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {doc.suggested_questions.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => navigate('/chat', { state: { prefillQuestion: q } })}
                  className="border border-border rounded-full px-3 py-1.5 text-xs font-body text-muted bg-surface hover:bg-paper hover:text-ink hover:border-ink/20 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Previously Asked Q&A */}
        {qaItems.length > 0 && (
          <div>
            {/* Fix 6 */}
            <div className="flex items-center gap-1.5 mb-3">
              <History className="w-3.5 h-3.5 text-[#8C8A85]" strokeWidth={1.75} />
              <p className={SECTION_HDR}>Previously Asked ({qaTotal})</p>
            </div>
            <div className="space-y-2">
              {qaItems.map((qa) => {
                const expanded = expandedQa.has(qa.id)
                return (
                  <div key={qa.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleQa(qa.id)}
                        className="shrink-0 mt-0.5 text-muted hover:text-ink transition-colors"
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                      >
                        {expanded ? <ChevronUp size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate('/chat', { state: { prefillQuestion: qa.question } })}
                          className="text-sm font-body text-ink text-left hover:text-accent transition-colors leading-snug"
                        >
                          {qa.question}
                        </button>
                        <p className="text-xs text-muted font-body mt-0.5 font-mono tabular-nums">
                          {qa.user_name} · {timeAgo(qa.created_at)}
                        </p>
                      </div>
                    </div>
                    {expanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border">
                        <ReactMarkdown className="prose prose-sm max-w-none text-ink font-body">
                          {qa.answer}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {qaTotal > 3 && (
              <button
                type="button"
                onClick={() => setShowAllQA((prev) => !prev)}
                className="mt-3 text-sm font-body text-muted hover:text-ink transition-colors"
              >
                {showAllQA ? 'Show less ↑' : `Show all ${qaTotal} questions ↓`}
              </button>
            )}
          </div>
        )}

        {/* Metadata card */}
        <div id="overview" className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-display-md text-ink tracking-tight truncate">
                {doc.original_filename ?? (doc.document_id ? `Document #${doc.document_id}` : 'Unnamed Document')}
              </h1>
              <p className="text-xs text-muted font-mono mt-0.5 tabular-nums">
                Processed {doc.processed_at ? new Date(doc.processed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {data && (
                <button
                  onClick={() => navigate(`/compare?doc_a=${id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body border border-border rounded-xl text-ink bg-surface hover:bg-paper hover:border-ink/15 transition-colors"
                >
                  <Scale className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Compare
                </button>
              )}
              {data && (
                <button
                  onClick={handleDownload}
                  disabled={reprocessing || deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body border border-border rounded-xl text-ink bg-surface hover:bg-paper hover:border-ink/15 disabled:opacity-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Download
                </button>
              )}
              {(role === 'admin' || role === 'analyst') && (
                <button
                  onClick={handleReprocess}
                  disabled={reprocessing || deleting}
                  className="px-3 py-1.5 text-xs font-medium font-body border border-border rounded-xl text-ink bg-surface hover:bg-paper hover:border-ink/15 disabled:opacity-50 transition-colors"
                >
                  {reprocessing ? 'Queuing…' : 'Reprocess'}
                </button>
              )}
              {role === 'admin' && (
                <button
                  onClick={handleDelete}
                  disabled={reprocessing || deleting}
                  className="px-3 py-1.5 text-xs font-medium font-body border border-red-200 rounded-xl text-red-600 bg-surface hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>

          {actionError && (
            <div className="text-xs text-red-600 font-body bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
              {actionError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm font-body pt-1 border-t border-border">
            <div>
              <p className="text-label text-muted uppercase tracking-[0.07em] font-body mb-1">Document type</p>
              <p className="text-ink font-medium capitalize">{extracted.document_type ?? '—'}</p>
            </div>
            <div>
              <p className="text-label text-muted uppercase tracking-[0.07em] font-body mb-1">Version</p>
              <p className="text-ink font-medium font-mono">{doc.version_number ?? '—'}</p>
            </div>
          </div>

          {doc.confidence_score != null && (
            <div className="pt-1 border-t border-border">
              <p className="text-label text-muted uppercase tracking-[0.07em] font-body mb-2">Confidence</p>
              <ConfidenceBar score={doc.confidence_score} />
              {extracted.text_length != null && (
                <p className="mt-1.5 text-xs text-muted font-body">
                  Extracted {extracted.text_length.toLocaleString()} characters
                </p>
              )}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-semibold text-ink">Tags</h2>
            <TagSelector
              docId={id}
              orgId={orgId}
              appliedTags={docTags}
              onAdd={(tag) => setDocTags((prev) => [...prev, tag])}
              onRemove={(tag) => setDocTags((prev) => prev.filter((t) => t.id !== tag.id))}
            />
          </div>
          {docTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {docTags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  size="md"
                  onRemove={async (tagId) => {
                    try {
                      await removeTagFromDocument(id, tagId)
                      setDocTags((prev) => prev.filter((t) => t.id !== tagId))
                    } catch {}
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted font-body">No tags applied. Use &ldquo;Manage tags&rdquo; to add some.</p>
          )}
        </div>

        {/* Retention */}
        {data && (() => {
          const expiresAt = doc.expires_at ? new Date(doc.expires_at) : null
          const daysLeft = expiresAt ? Math.ceil((expiresAt - new Date()) / 86400000) : null
          return (
            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-4">Retention</h2>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-label text-muted uppercase tracking-[0.07em] font-body mb-1">Expires</p>
                  {expiresAt ? (
                    <p className={cn('text-sm font-body font-medium', daysLeft !== null && daysLeft <= 7 ? 'text-orange-600' : 'text-ink')}>
                      {expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className="text-xs text-muted font-normal ml-2">
                        {daysLeft === 0 ? '(expires today)' : daysLeft > 0 ? `(${daysLeft}d left)` : '(expired)'}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted font-body">No expiry set</p>
                  )}
                </div>
                {(role === 'admin' || role === 'analyst') && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={retentionMode}
                      onChange={(e) => { setRetentionMode(e.target.value); setCustomDate('') }}
                      className={inputCls}
                    >
                      <option value="none">No expiry</option>
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                      <option value="365">1 year</option>
                      <option value="custom">Custom date</option>
                    </select>
                    {retentionMode === 'custom' && (
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className={inputCls}
                      />
                    )}
                    <button
                      onClick={handleSaveRetention}
                      disabled={savingRetention || (retentionMode === 'custom' && !customDate)}
                      className="px-3 py-1.5 text-xs font-semibold font-body bg-ink text-surface rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50 transition-all"
                    >
                      {savingRetention ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
              {retentionError && <p className="mt-2 text-xs text-red-600 font-body">{retentionError}</p>}
            </div>
          )
        })()}

        {/* PII Detection */}
        {data && <PIISection docId={id} doc={doc} onRefresh={fetchResults} />}

        {/* Invoice details */}
        {isInvoice && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="font-display text-sm font-semibold text-ink mb-4">Invoice details</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm font-body">
              {[
                ['Vendor', extracted.vendor],
                ['Invoice number', extracted.invoice_number],
                ['Total amount', extracted.total_amount],
                ['Date', extracted.date],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-label text-muted uppercase tracking-[0.07em] font-body mb-1">{label}</p>
                  <p className="text-ink font-medium">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entities — Fix 2+3: CARDINAL excluded, <2 values excluded */}
        {entityTypes.length > 0 && (
          <div id="entities">
            {/* Fix 6 */}
            <p className={cn(SECTION_HDR, 'mb-3')}>Extracted entities</p>
            <div className="grid grid-cols-2 gap-3">
              {entityTypes.map(([type, vals]) => (
                <EntityCard key={type} type={type} values={vals} />
              ))}
            </div>
          </div>
        )}

        {/* Tables */}
        {tables.length > 0 && (
          <div id="tables">
            <div className="flex items-center gap-2 mb-3">
              <Table2 size={14} className="text-[#8C8A85]" strokeWidth={1.75} />
              <p className={SECTION_HDR}>Tables ({tables.length})</p>
            </div>
            <div className="space-y-4">
              {tables
                .slice()
                .sort((a, b) => (a.page_number ?? 0) - (b.page_number ?? 0))
                .map((t) => (
                  <TableViewer
                    key={t.id}
                    table={t}
                    pageLabel={`Page ${(t.page_number ?? 0) + 1}`}
                    confPct={Math.round((t.extraction_confidence ?? 0) * 100)}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Version history */}
        {versions.length > 1 && (
          <div id="history">
            {/* Fix 6 */}
            <p className={cn(SECTION_HDR, 'mb-3')}>Version history</p>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              {[...versions].reverse().map((v) => {
                const isActive = data?.version_number === v.version_number
                const pct = Math.round((v.confidence_score ?? 0) * 100)
                const confColor = pct >= 80 ? 'text-emerald-700' : pct >= 60 ? 'text-amber-700' : 'text-red-600'
                return (
                  <button
                    key={v.version_number}
                    onClick={() => setData(v)}
                    className={cn(
                      'w-full flex items-center gap-4 px-5 py-3.5 text-left border-b border-border last:border-0 transition-colors hover:bg-paper/60',
                      isActive ? 'bg-ink/5' : ''
                    )}
                  >
                    <span className={cn(
                      'shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold font-mono',
                      isActive ? 'bg-ink text-surface' : 'bg-border text-muted'
                    )}>
                      {v.version_number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-body text-ink font-medium">
                        {v.structured_json?.document_type ?? 'unknown'}
                      </p>
                      <p className="text-xs text-muted font-mono mt-0.5 tabular-nums">
                        {v.processed_at ? new Date(v.processed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                    <span className={cn('text-xs font-semibold font-mono tabular-nums shrink-0', confColor)}>
                      {pct}%
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
