import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ChevronDown, FileText, GitCompare, Zap } from 'lucide-react'
import { listDocuments } from '../api/documents'
import { createComparison } from '../api/comparisons'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Skeleton } from '../components/ui/Skeleton'
import { LockedState } from '../components/ui/LockedState'
import { isForbidden } from '../lib/http'

function DocumentSelect({ value, onChange, documents, placeholder, excludeId }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const { theme } = useTheme()

  const selected = documents.find((d) => d.id === value)
  const filtered = documents.filter((doc) => {
    if (doc.id === excludeId) return false
    const name = doc.original_filename || `Document #${doc.id}`
    return name.toLowerCase().includes(search.toLowerCase())
  })

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const border = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.12)'

  return (
    <div style={{ position: 'relative' }} ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: '44px',
          textAlign: 'left',
          padding: '0 14px',
          background: theme === 'light' ? '#FFFFFF' : '#2A2522',
          border: `1px solid ${border}`,
          borderRadius: '10px',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
          color: selected ? (theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.85)') : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)'),
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'rgba(107,78,255,0.50)'}
        onBlur={e => e.currentTarget.style.borderColor = border}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? (selected.original_filename || `Document #${selected.id}`) : placeholder}
        </span>
        <ChevronDown size={14} color={theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)'} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          zIndex: 50,
          width: '100%',
          marginTop: '6px',
          background: theme === 'light' ? '#FFFFFF' : '#2A2522',
          border: `1px solid ${border}`,
          borderRadius: '10px',
          boxShadow: theme === 'light' ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.40)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px', borderBottom: `1px solid ${border}` }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${border}`,
                borderRadius: '8px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
          </div>
          <ul style={{ maxHeight: '208px', overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 }}>
            {filtered.length === 0 ? (
              <li style={{ padding: '12px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' }}>
                No documents found
              </li>
            ) : (
              filtered.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(doc.id); setOpen(false); setSearch('') }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                      {doc.original_filename || `Document #${doc.id}`}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', textTransform: 'capitalize', margin: 0 }}>
                      {doc.status}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

const MODES = [
  { key: 'textual',  label: 'Textual Diff',       desc: 'Line-by-line diff of the extracted document text.' },
  { key: 'semantic', label: 'Semantic Comparison', desc: 'Embedding-based semantic similarity across content chunks.' },
]

export default function Compare() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [documents, setDocuments]     = useState([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docAId, setDocAId]           = useState(null)
  const [docBId, setDocBId]           = useState(null)
  const [mode, setMode]               = useState('textual')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')
  const [forbidden, setForbidden]     = useState(false)

  useEffect(() => {
    const orgId = user?.org_id
    if (!orgId) return
    listDocuments(orgId, { limit: 200 })
      .then(({ data }) => {
        const docs = Array.isArray(data) ? data : []
        setDocuments(docs)
        const preA = searchParams.get('doc_a')
        if (preA) {
          const id = parseInt(preA, 10)
          if (docs.find((d) => d.id === id)) setDocAId(id)
        }
      })
      .catch(() => setError('Failed to load documents.'))
      .finally(() => setDocsLoading(false))
  }, [user?.org_id, searchParams])

  const canCompare = docAId && docBId && docAId !== docBId && !submitting

  async function handleCompare() {
    if (!canCompare) return
    setSubmitting(true)
    setError('')
    try {
      const { data } = await createComparison(docAId, docBId, mode)
      navigate(`/compare/${data.id}`)
    } catch (err) {
      if (isForbidden(err)) setForbidden(true)
      else setError(err.response?.data?.detail || 'Failed to start comparison.')
      setSubmitting(false)
    }
  }

  const modeDescriptions = {
    textual:  'Line-by-line diff of the extracted document text. Changes highlighted in red and green.',
    semantic: 'AI-powered similarity scoring using vector embeddings. Shows conceptual overlap between documents.',
  }

  const selectedMode = MODES.find((m) => m.key === mode)
  const permDenied = forbidden || user?.permissions?.compare?.use === false

  if (permDenied) {
    return (
      <div style={{ maxWidth: '900px', width: '100%', margin: '0 auto', padding: '32px 48px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 className="font-display text-display-md text-ink tracking-tight">Compare Documents</h1>
          <p style={{ marginTop: '4px', fontSize: '14px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)', fontFamily: "'DM Sans', sans-serif" }}>
            Side-by-side textual or semantic comparison
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl">
          <LockedState />
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', width: '100%', margin: '0 auto', padding: '32px 48px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="font-display text-display-md text-ink tracking-tight">Compare Documents</h1>
        <p style={{ marginTop: '4px', fontSize: '14px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)', fontFamily: "'DM Sans', sans-serif" }}>
          Side-by-side textual or semantic comparison
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '20px', background: 'rgba(232,78,42,0.10)', border: '1px solid rgba(232,78,42,0.25)', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", color: '#E84E2A' }}>
          {error}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '100%', background: theme === 'light' ? '#FFFFFF' : '#2C2926', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', boxShadow: theme === 'light' ? '0 4px 24px rgba(0,0,0,0.08)' : '0 4px 24px rgba(0,0,0,0.40)' }}>

        {/* Document pickers */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Document A
            </label>
            {docsLoading ? (
              <Skeleton className="h-10 rounded-xl" />
            ) : (
              <DocumentSelect
                value={docAId}
                onChange={setDocAId}
                documents={documents}
                placeholder="Select document A…"
                excludeId={docBId}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => { const temp = docAId; setDocAId(docBId); setDocBId(temp) }}
            title="Swap documents"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)',
              border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              alignSelf: 'flex-end',
              marginBottom: '2px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(107,78,255,0.15)'
              e.currentTarget.style.borderColor = 'rgba(107,78,255,0.40)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)'
              e.currentTarget.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.15)'
            }}
          >
            <ArrowLeftRight size={14} color={theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.60)'} />
          </button>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Document B
            </label>
            {docsLoading ? (
              <Skeleton className="h-10 rounded-xl" />
            ) : (
              <DocumentSelect
                value={docBId}
                onChange={setDocBId}
                documents={documents}
                placeholder="Select document B…"
                excludeId={docAId}
              />
            )}
          </div>
        </div>

        {/* Mode selector */}
        <div>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Comparison mode
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {MODES.map((m) => {
              const accent = theme === 'light' ? '#6B4EFF' : '#E84E2A'
              const accentHover = theme === 'light' ? '#5538EE' : '#E84E2A'
              return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  fontWeight: mode === m.key ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: mode === m.key ? accent : (theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)'),
                  color: mode === m.key ? 'white' : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.75)'),
                  border: mode === m.key ? `1px solid ${accent}` : (theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.25)'),
                }}
                onMouseEnter={e => { if (mode !== m.key) { e.currentTarget.style.borderColor = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.45)'; e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'white' } }}
                onMouseLeave={e => { if (mode !== m.key) { e.currentTarget.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.75)' } }}
              >
                {m.label}
              </button>
              )
            })}
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', marginTop: '10px', lineHeight: 1.5 }}>
            {modeDescriptions[mode] || modeDescriptions.textual}
          </p>
        </div>

        {/* Compare button */}
        <button
          type="button"
          onClick={handleCompare}
          disabled={!canCompare}
          title={!canCompare ? 'Select two documents to compare' : ''}
          style={{
            width: '100%',
            height: '48px',
            background: canCompare ? (theme === 'light' ? '#6B4EFF' : '#E84E2A') : (theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.10)'),
            color: canCompare ? 'white' : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)'),
            fontFamily: "'Syne', sans-serif",
            fontWeight: 600,
            fontSize: '15px',
            borderRadius: '12px',
            border: canCompare ? 'none' : (theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)'),
            cursor: canCompare ? 'pointer' : 'not-allowed',
            marginTop: '8px',
            transition: 'all 0.2s ease',
            opacity: canCompare ? 1 : 0.40,
            pointerEvents: canCompare ? 'auto' : 'none',
          }}
          onMouseEnter={e => { if (canCompare) { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none' }}
        >
          {submitting ? 'Starting…' : 'Compare'}
        </button>
      </div>

      {/* Empty state placeholder */}
      {!submitting && (
        <div style={{
          marginTop: '24px',
          width: '100%',
          background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.03)',
          border: theme === 'light' ? '1px dashed #DDD8F0' : '1px dashed rgba(255,255,255,0.15)',
          borderRadius: '16px',
          padding: '60px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}>
          <div style={{
            width: '56px', height: '56px',
            borderRadius: '16px',
            background: theme === 'light' ? 'rgba(107,78,255,0.08)' : 'rgba(232,78,42,0.08)',
            border: theme === 'light' ? '1px solid rgba(107,78,255,0.15)' : '1px solid rgba(232,78,42,0.15)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}>
            <GitCompare size={24} color={theme === 'light' ? 'rgba(107,78,255,0.60)' : 'rgba(232,78,42,0.60)'} strokeWidth={1.5} />
          </div>

          <h3 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 600, fontSize: '16px',
            color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.70)',
            margin: '0 0 8px',
          }}>Comparison results will appear here</h3>

          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)',
            maxWidth: '360px',
            lineHeight: 1.6,
            margin: 0,
          }}>
            Select two documents above and click Compare
            to see a side-by-side textual diff or semantic
            similarity analysis.
          </p>

          <div style={{ display: 'flex', gap: '24px', marginTop: '32px' }}>
            {[
              ['Textual Diff',  'Line-by-line changes highlighted'],
              ['Semantic',      'AI-powered similarity scoring'],
              ['Side-by-side',  'Parallel document view'],
            ].map(([title, desc]) => (
              <div key={title} style={{
                textAlign: 'center',
                padding: '16px',
                background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.03)',
                border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                minWidth: '140px',
              }}>
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: '13px', fontWeight: 600, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.70)', margin: '0 0 4px' }}>{title}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.4 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info strip */}
      {!submitting && (
        <div style={{
          marginTop: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          width: '100%',
        }}>
          {[
            { title: 'Upload documents first', desc: 'Go to Upload to add PDFs, images, or ZIPs before comparing.', Icon: FileText },
            { title: 'AI-powered analysis', desc: 'Semantic comparison uses embeddings to find conceptual similarities.', Icon: Zap },
          ].map(({ title, desc, Icon }) => (
            <div key={title} style={{
              padding: '16px 20px',
              background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.04)',
              border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.09)',
              borderRadius: '12px',
              display: 'flex', gap: '12px', alignItems: 'flex-start',
            }}>
              <div style={{
                width: '32px', height: '32px', flexShrink: 0,
                borderRadius: '8px',
                background: theme === 'light' ? 'rgba(107,78,255,0.08)' : 'rgba(232,78,42,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} color={theme === 'light' ? '#6B4EFF' : '#E84E2A'} />
              </div>
              <div>
                <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '13px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.70)', margin: '0 0 4px' }}>{title}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.5 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
