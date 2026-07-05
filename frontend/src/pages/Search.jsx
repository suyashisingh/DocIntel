import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search as SearchIcon, Clock, FileText, Table2, Users } from 'lucide-react'
import { searchDocuments } from '../api/search'
import { listTags } from '../api/tags'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Skeleton } from '../components/ui/Skeleton'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'

const ENTITY_LABELS = {
  PERSON: 'Person', ORG: 'Org', DATE: 'Date', MONEY: 'Amount',
  GPE: 'Place', PRODUCT: 'Product', EVENT: 'Event', LOC: 'Location',
}

const ENTITY_VARIANTS = {
  PERSON: 'info', ORG: 'purple', DATE: 'success', MONEY: 'warning',
  GPE: 'accent', PRODUCT: 'default', EVENT: 'default', LOC: 'success',
}

const FILTER_INPUT_STYLE = {
  height: '40px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  padding: '0 14px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '13px',
  color: 'rgba(255,255,255,0.75)',
  outline: 'none',
}

function Snippet({ text, query }) {
  const { theme } = useTheme()
  if (!text || !query) return <span style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)' }}>{text?.slice(0, 180) ?? ''}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text.slice(0, 180)}{text.length > 180 ? '…' : ''}</span>
  const start = Math.max(0, idx - 60)
  const end = Math.min(text.length, idx + query.length + 100)
  const before = text.slice(start, idx)
  const match = text.slice(idx, idx + query.length)
  const after = text.slice(idx + query.length, end)
  return (
    <span>
      {start > 0 && '…'}{before}
      <mark className="bg-accent/15 text-ink rounded-sm px-0.5 not-italic">{match}</mark>
      {after}{end < text.length && '…'}
    </span>
  )
}

function DocumentResultCard({ doc, query, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04, ease: 'easeOut' }}
      whileHover={{ y: -2, transition: { duration: 0.12 } }}
    >
    <Link
      to={`/documents/${doc.id}`}
      className="group block bg-surface border border-border rounded-xl px-5 py-4 hover:border-ink/15 hover:bg-paper/40 hover:shadow-float transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink font-body group-hover:text-accent transition-colors truncate">
            {doc.original_filename ?? doc.file_path?.split('/').pop() ?? 'Unnamed Document'}
          </p>
          <p className="text-xs text-muted font-mono mt-0.5 tabular-nums">
            {doc.upload_time ? new Date(doc.upload_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2.5">
          {doc.document_type && (
            <Badge variant="default" size="sm" className="capitalize">{doc.document_type}</Badge>
          )}
        </div>
      </div>
      {doc.searchable_text && (
        <p className="text-xs text-muted font-body leading-relaxed line-clamp-2">
          <Snippet text={doc.searchable_text} query={query} />
        </p>
      )}
    </Link>
    </motion.div>
  )
}

function isValidTableResult(table) {
  return Array.isArray(table?.preview_rows) && table.preview_rows.length > 0
}

function TableResultCard({ table }) {
  const headers = table.headers || []
  const colCount = table.preview_rows?.[0]?.length ?? headers.length
  const displayHeaders = headers.length > 0
    ? headers
    : Array.from({ length: colCount }, (_, i) => `Col ${i + 1}`)

  return (
    <Link
      to={`/documents/${table.document_id}`}
      className="group block bg-surface border border-border rounded-xl px-5 py-4 hover:border-ink/15 hover:bg-paper/40 transition-all"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink font-body group-hover:text-accent transition-colors truncate">
            {table.original_filename ?? `Document #${table.document_id}`}
          </p>
          <p className="text-xs text-muted font-body mt-0.5">
            Page {table.page_number}
            {table.matched_column && (
              <> · matched in <span className="text-ink font-medium">&ldquo;{table.matched_column}&rdquo;</span></>
            )}
          </p>
        </div>
        <Badge variant="default" size="sm">table</Badge>
      </div>
      {table.preview_rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs border-collapse">
            {displayHeaders.length > 0 && (
              <thead>
                <tr className="bg-paper border-b border-border">
                  {displayHeaders.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left font-medium font-body text-muted whitespace-nowrap">
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {table.preview_rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  {(Array.isArray(row) ? row : []).map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-ink font-body">{String(cell ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Link>
  )
}

function EntityResultCard({ entity }) {
  const variant = ENTITY_VARIANTS[entity.entity_type] ?? 'default'
  const label = ENTITY_LABELS[entity.entity_type] ?? entity.entity_type
  return (
    <Link
      to={`/documents/${entity.document_id}`}
      className="group flex items-center gap-3.5 bg-surface border border-border rounded-xl px-4 py-3 hover:border-ink/15 hover:bg-paper/40 transition-all"
    >
      <Badge variant={variant} size="md">{label}</Badge>
      <span className="flex-1 min-w-0 text-sm font-body text-ink font-medium truncate group-hover:text-accent transition-colors">
        {entity.entity_value}
      </span>
      <span className="shrink-0 text-xs font-body text-muted truncate max-w-[180px]">
        {entity.original_filename ?? `Document #${entity.document_id}`}
      </span>
    </Link>
  )
}

export default function Search() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const orgId = user?.org_id

  const filterInputStyle = {
    height: '40px',
    background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
    border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    padding: '0 14px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.75)',
    outline: 'none',
  }

  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [availableTags, setAvailableTags] = useState([])
  const [results, setResults] = useState(null)
  const [activeTab, setActiveTab] = useState('documents')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('docintel_recent_searches') || '[]')
    } catch { return [] }
  })

  useEffect(() => {
    if (!orgId) return
    listTags(orgId)
      .then(({ data }) => setAvailableTags(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [orgId])

  const saveRecentSearch = (q) => {
    if (!q?.trim()) return
    setRecentSearches(prev => {
      const updated = [q, ...prev.filter(s => s !== q)].slice(0, 5)
      localStorage.setItem('docintel_recent_searches', JSON.stringify(updated))
      return updated
    })
  }

  async function runSearch(searchQuery) {
    if (!searchQuery.trim() || !orgId) return
    setLoading(true)
    setError('')
    setSubmitted(true)
    saveRecentSearch(searchQuery)
    try {
      const { data } = await searchDocuments(orgId, searchQuery.trim(), {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        tag_ids: selectedTagIds.length ? selectedTagIds : undefined,
      })
      const documents = Array.isArray(data) ? data : (data.documents ?? data.results ?? [])
      const tables = data.tables ?? []
      const entities = data.entities ?? []
      const validTables = tables.filter(isValidTableResult)
      setResults({ documents, tables, entities })
      if (documents.length > 0) setActiveTab('documents')
      else if (validTables.length > 0) setActiveTab('tables')
      else if (entities.length > 0) setActiveTab('entities')
      else setActiveTab('documents')
    } catch {
      setError('Search failed. Please try again.')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    await runSearch(query.trim())
  }

  const validTables = (results?.tables ?? []).filter(isValidTableResult)
  const docCount    = results?.documents?.length ?? 0
  const tableCount  = validTables.length
  const entityCount = results?.entities?.length ?? 0
  const totalCount  = docCount + tableCount + entityCount

  const hasActiveFilters = dateFrom || dateTo || selectedTagIds.length > 0
  const hasDateFilter = Boolean(dateFrom || dateTo)
  const activeTags = availableTags.filter(t => selectedTagIds.includes(t.id))

  const noResultsMessage = hasDateFilter ? 'No results found for the selected filters' : null

  const tabs = [
    { key: 'documents', label: 'Documents', count: docCount, icon: FileText },
    { key: 'tables',    label: 'Tables',    count: tableCount, icon: Table2 },
    { key: 'entities',  label: 'Entities',  count: entityCount, icon: Users },
  ]

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', padding: '32px 48px', position: 'relative' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="font-display text-display-md text-ink tracking-tight">Search</h1>
        <p style={{ marginTop: '4px', fontSize: '14px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)', fontFamily: "'DM Sans', sans-serif" }}>
          Full-text and semantic search across all documents
        </p>
      </div>

      <form onSubmit={handleSearch} style={{ marginBottom: '32px' }}>
        {/* Hero search bar */}
        <div style={{ display: 'flex', gap: '10px', maxWidth: '720px', width: '100%', marginBottom: '14px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <SearchIcon
              size={16}
              style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}
              strokeWidth={1.75}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents, tables, entities…"
              style={{
                width: '100%',
                height: '52px',
                fontSize: '15px',
                background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
                border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: '14px',
                color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)',
                paddingLeft: '48px',
                paddingRight: '16px',
                transition: 'all 0.2s ease',
                outline: 'none',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = theme === 'light' ? 'rgba(107,78,255,0.60)' : 'rgba(232,78,42,0.60)'
                e.currentTarget.style.boxShadow = theme === 'light' ? '0 0 0 3px rgba(107,78,255,0.12)' : '0 0 0 3px rgba(232,78,42,0.12)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.15)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              borderRadius: '14px',
              height: '52px',
              background: theme === 'light' ? '#6B4EFF' : '#E84E2A',
              color: 'white',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 600,
              padding: '0 24px',
              border: 'none',
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: loading || !query.trim() ? 0.5 : 1,
              transition: 'opacity 0.2s',
              flexShrink: 0,
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Row 1 — Date filters */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)' }}>From</label>
            <input
              type="text"
              placeholder="Start date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onFocus={e => e.target.type = 'date'}
              onBlur={e => { if (!e.target.value) e.target.type = 'text' }}
              style={{ ...FILTER_INPUT_STYLE, colorScheme: 'dark' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)' }}>To</label>
            <input
              type="text"
              placeholder="End date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onFocus={e => e.target.type = 'date'}
              onBlur={e => { if (!e.target.value) e.target.type = 'text' }}
              style={{ ...FILTER_INPUT_STYLE, colorScheme: 'dark' }}
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); setSelectedTagIds([]) }}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)',
                cursor: 'pointer',
                padding: '0 4px',
                height: '40px',
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Available tag toggles */}
        {availableTags.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.35)', marginRight: '4px' }}>Tags:</span>
            {availableTags.map(tag => {
              const active = selectedTagIds.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTagIds(prev => active ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                  style={{
                    padding: '4px 10px',
                    background: active ? (theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.12)') : (theme === 'light' ? 'rgba(107,78,255,0.06)' : 'rgba(255,255,255,0.05)'),
                    border: active ? (theme === 'light' ? '1px solid rgba(107,78,255,0.40)' : '1px solid rgba(232,78,42,0.30)') : (theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)'),
                    borderRadius: '100px',
                    color: theme === 'light' ? '#1A1040' : (active ? '#E84E2A' : 'rgba(255,255,255,0.55)'),
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'all 0.15s',
                  }}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Row 2 — Active filter tags */}
        {selectedTagIds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
              color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginRight: '4px'
            }}>Active filters:</span>
            {activeTags.map(tag => (
              <span key={tag.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '5px 12px',
                background: theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.12)',
                border: theme === 'light' ? '1px solid rgba(107,78,255,0.30)' : '1px solid rgba(232,78,42,0.30)',
                borderRadius: '100px',
                fontFamily: "'DM Sans', sans-serif", fontSize: '12px',
                color: theme === 'light' ? '#1A1040' : '#E84E2A'
              }}>
                {tag.name}
                <span
                  onClick={() => setSelectedTagIds(prev => prev.filter(id => id !== tag.id))}
                  style={{ cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                >×</span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelectedTagIds([])}
              style={{
                background: 'none', border: 'none',
                fontFamily: "'DM Sans', sans-serif", fontSize: '12px',
                color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)', cursor: 'pointer'
              }}
            >Clear all</button>
          </div>
        )}
      </form>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '500px' }}>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E84E2A', background: 'rgba(232,78,42,0.08)', border: '1px solid rgba(232,78,42,0.20)', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
          <span>⚠</span>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      )}

      {/* No results */}
      {!loading && results !== null && totalCount === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 24px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <SearchIcon size={18} strokeWidth={1.5} style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' }} />
          </div>
          <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '14px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)', margin: '0 0 6px' }}>
            {noResultsMessage ?? 'No results found'}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)' }}>
            {hasDateFilter
              ? 'Try widening your date range or clearing the date filters.'
              : (<>No matches for <span style={{ color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)', fontWeight: 500 }}>&ldquo;{query}&rdquo;</span>. Try different keywords or adjust your filters.</>)}
          </p>
        </div>
      )}

      {/* Initial state */}
      {!submitted && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', minHeight: 0, flex: 1 }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            width: '100%',
            minHeight: '380px',
            marginTop: '20px'
          }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '20px',
            background: theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.12)',
            border: theme === 'light' ? '1px solid rgba(107,78,255,0.25)' : '1px solid rgba(232,78,42,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px'
          }}>
            <SearchIcon size={32} color={theme === 'light' ? '#6B4EFF' : '#E84E2A'} strokeWidth={1.5} />
          </div>
          <h3 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: '20px',
            color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)',
            margin: '0 0 10px'
          }}>Search your documents</h3>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
            color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)',
            maxWidth: '380px',
            lineHeight: 1.6,
            margin: '0 0 32px'
          }}>
            Search across document content, extracted tables,
            named entities, and filenames — all at once.
          </p>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            {['invoice', 'contract', 'offer letter', 'bank statement', 'Aadhaar'].map(term => (
              <button
                key={term}
                onClick={() => { setQuery(term); runSearch(term) }}
                style={{
                  padding: '8px 16px',
                  background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)',
                  border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '100px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.65)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = theme === 'light' ? 'rgba(107,78,255,0.10)' : 'rgba(232,78,42,0.10)'
                  e.currentTarget.style.borderColor = theme === 'light' ? 'rgba(107,78,255,0.40)' : 'rgba(232,78,42,0.40)'
                  e.currentTarget.style.color = theme === 'light' ? '#6B4EFF' : '#E84E2A'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.65)'
                }}
              >
                {term}
              </button>
            ))}
          </div>
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)',
            letterSpacing: '0.05em'
          }}>CLICK A SUGGESTION OR TYPE ABOVE</p>

          {recentSearches.length > 0 && (
            <div style={{ marginTop: '32px', width: '100%', maxWidth: '400px' }}>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
                color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: '10px', textAlign: 'left'
              }}>Recent searches</p>
              {recentSearches.map((s, i) => (
                <div
                  key={i}
                  onClick={() => { setQuery(s); runSearch(s) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 12px', borderRadius: '8px',
                    cursor: 'pointer', transition: 'background 0.15s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Clock size={13} color={theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)'} />
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
                    color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.70)'
                  }}>{s}</span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && results !== null && totalCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <Tabs
              tabs={tabs}
              active={activeTab}
              onChange={setActiveTab}
              className="flex-1"
            />
            <span className="text-xs text-muted font-body tabular-nums pl-4 shrink-0">
              {totalCount} result{totalCount !== 1 ? 's' : ''}
            </span>
          </div>

          {activeTab === 'documents' && (
            <div className="space-y-2.5">
              {docCount > 0 ? (
                results.documents.map((doc, i) => (
                  <DocumentResultCard key={doc.id} doc={doc} query={query} index={i} />
                ))
              ) : (
                <p className="text-sm text-muted font-body text-center py-8">
                  {noResultsMessage ?? 'No documents found matching your search.'}
                </p>
              )}
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="space-y-3">
              {tableCount > 0 ? (
                validTables.map((table) => (
                  <TableResultCard key={table.id} table={table} />
                ))
              ) : (
                <p className="text-sm text-muted font-body text-center py-8">
                  {noResultsMessage ?? 'No table results found'}
                </p>
              )}
            </div>
          )}

          {activeTab === 'entities' && (
            <div className="space-y-2">
              {entityCount > 0 ? (
                results.entities.map((entity, i) => (
                  <EntityResultCard key={i} entity={entity} />
                ))
              ) : (
                <p className="text-sm text-muted font-body text-center py-8">
                  {noResultsMessage ?? 'No entity results found'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  )
}
