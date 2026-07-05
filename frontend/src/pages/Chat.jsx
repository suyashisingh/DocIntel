import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, FileText, Mic, MicOff, Search, Send, Sparkles, Table2 } from 'lucide-react'
import { queryChat } from '../api/chat'
import { listDocuments } from '../api/documents'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { cn } from '../lib/cn'

const formatDocType = (type) => {
  if (!type) return 'Unknown'
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

const SUGGESTED = [
  'What are the key entities mentioned in my documents?',
  'Summarize the most recent invoice.',
  'What dates appear across my documents?',
  'Who are the people or organizations mentioned?',
]

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3">
      <div className="w-7 h-7 rounded-full bg-paper border border-border shrink-0 flex items-center justify-center">
        <span className="text-[9px] font-bold text-muted font-mono">AI</span>
      </div>
      <div className="bg-paper border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

function SourceChip({ source }) {
  return (
    <Link
      to={`/documents/${source.document_id}`}
      className="inline-flex items-center gap-1 text-xs font-body text-muted border border-border bg-paper rounded-lg px-2 py-0.5 hover:border-ink/20 hover:text-ink transition-colors"
    >
      Doc #{source.document_id}
      <span className="text-border">·</span>
      chunk {source.chunk_index + 1}
    </Link>
  )
}

function TableCitation({ source }) {
  const [expanded, setExpanded] = useState(false)
  const preview = source.preview

  return (
    <div className="inline-flex flex-col gap-1 align-top">
      {expanded && preview && (
        <div className="bg-paper border border-border rounded-xl overflow-x-auto max-w-xs">
          <table className="text-xs border-collapse">
            {preview.headers && (
              <thead>
                <tr className="bg-paper/80">
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium text-muted border-b border-border whitespace-nowrap font-body">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {(preview.rows || []).slice(0, 3).map((row, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 text-ink font-body">{String(cell ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(preview.row_count ?? 0) > 3 && (
            <p className="px-2 py-1 text-xs text-muted font-body">+{preview.row_count - 3} more rows</p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-1 text-xs font-body text-muted border border-border bg-paper rounded-lg px-2 py-0.5 hover:border-ink/20 hover:text-ink transition-colors"
      >
        <Table2 size={11} strokeWidth={1.75} />
        Doc #{source.document_id} · p.{source.page}
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
    </div>
  )
}

function ConfidenceBar({ score, level }) {
  if (score == null || !level) return null
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100)
  const fill = level === 'high' ? 'bg-emerald-500' : level === 'medium' ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2 pl-10">
      <div className="flex-1 h-0.5 rounded-full bg-border overflow-hidden">
        <div className={cn('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-muted tabular-nums shrink-0">{pct}%</span>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] bg-ink text-surface rounded-2xl rounded-br-sm px-4 py-2.5 text-sm font-body leading-relaxed">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-3">
      <div className="w-7 h-7 rounded-full bg-paper border border-border shrink-0 flex items-center justify-center">
        <Sparkles size={11} strokeWidth={2} className="text-muted" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className={cn(
          'bg-paper border rounded-2xl rounded-bl-sm px-4 py-3 text-sm font-body leading-relaxed',
          msg.error ? 'border-red-200 text-red-700' : 'border-border text-ink'
        )}>
          <ReactMarkdown className="prose prose-sm max-w-none">
            {msg.content}
          </ReactMarkdown>
        </div>
        {!msg.error && msg.confidence_level != null && (
          <ConfidenceBar score={msg.confidence_score} level={msg.confidence_level} />
        )}
        {msg.sources && msg.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-1 items-start">
            <span className="text-xs text-muted font-body mt-0.5">Sources:</span>
            {msg.sources.map((s, i) =>
              s.type === 'table' ? (
                <TableCitation key={i} source={s} />
              ) : (
                <SourceChip key={i} source={s} />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onSuggest }) {
  const { theme } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px', maxWidth: '520px', width: '100%' }}>
      <div style={{
        width: '72px',
        height: '72px',
        borderRadius: '20px',
        background: theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.12)',
        border: theme === 'light' ? '1px solid rgba(107,78,255,0.25)' : '1px solid rgba(232,78,42,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '20px',
        flexShrink: 0,
      }}>
        <Sparkles size={32} color={theme === 'light' ? '#6B4EFF' : '#E84E2A'} strokeWidth={1.5} />
      </div>
      <h3 className="font-display text-base font-semibold text-ink mb-1">Ask about your documents</h3>
      <p className="text-sm text-muted font-body max-w-xs">
        Select a document on the left to scope your question, or search across all documents.
      </p>
    </div>
  )
}

export default function Chat() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const orgId = user?.org_id
  const location = useLocation()

  const [docs, setDocs]                     = useState([])
  const [selectedDocId, setSelectedDocId]   = useState(null)
  const [docSearch, setDocSearch]           = useState('')
  const [messages, setMessages]             = useState([])
  const [question, setQuestion]             = useState('')
  const [loading, setLoading]               = useState(false)
  const [isListening, setIsListening]       = useState(false)
  const messagesEndRef                      = useRef(null)
  const inputRef                            = useRef(null)
  const recognitionRef                      = useRef(null)

  const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function handleVoiceInput() {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      setQuestion(event.results[0][0].transcript)
      setIsListening(false)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  useEffect(() => {
    if (!orgId) return
    listDocuments(orgId, { limit: 100 })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data.documents ?? data.items ?? [])
        setDocs(list.filter((d) => d.status === 'completed'))
      })
      .catch(() => {})
  }, [orgId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function submitQuestion(q) {
    if (!q || loading) return
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setQuestion('')
    setLoading(true)
    try {
      const { data } = await queryChat(q, selectedDocId)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          sources: data.sources ?? [],
          message_id: data.message_id,
          confidence_score: data.confidence_score,
          confidence_level: data.confidence_level,
        },
      ])
    } catch (err) {
      const detail = err.response?.data?.detail ?? 'Something went wrong. Please try again.'
      setMessages((prev) => [...prev, { role: 'assistant', content: detail, sources: [], error: true }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await submitQuestion(question.trim())
  }

  useEffect(() => {
    const prefill = location.state?.prefillQuestion
    if (prefill) submitQuestion(prefill)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDocs = docs.filter(doc => {
    if (!docSearch.trim()) return true
    const name = (doc.original_filename || doc.filename || '').toLowerCase()
    const type = (doc.document_type || '').toLowerCase()
    return name.includes(docSearch.toLowerCase()) || type.includes(docSearch.toLowerCase())
  })

  const selectedDoc = docs.find((d) => d.id === selectedDocId) ?? null

  return (
    <div className="-mx-8 -my-8 flex h-screen overflow-hidden" style={{ minWidth: '700px' }}>

      {/* Left: document selector */}
      <div style={{ width: '260px', minWidth: '220px', maxWidth: '260px', flexShrink: 0, background: theme === 'light' ? '#E8E4F5' : '#141210', borderRight: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)'}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="px-4 py-4 border-b border-border">
          <h2 className="font-display text-sm font-semibold text-ink">Documents</h2>
          <p className="mt-0.5 text-xs text-muted font-body">Scope your question</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div style={{ padding: '16px 16px 4px', flexShrink: 0 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>Documents</span>
          </div>

          <div style={{ padding: '12px 12px 8px', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)', pointerEvents: 'none' }} />
              <input
                value={docSearch}
                onChange={e => setDocSearch(e.target.value)}
                placeholder="Search documents..."
                style={{
                  width: '100%',
                  height: '34px',
                  background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'}`,
                  borderRadius: '8px',
                  paddingLeft: '30px',
                  paddingRight: '10px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '12px',
                  color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.80)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => {
                  e.target.style.borderColor = theme === 'light' ? 'rgba(107,78,255,0.50)' : 'rgba(232,78,42,0.50)'
                  e.target.style.boxShadow = theme === 'light' ? '0 0 0 2px rgba(107,78,255,0.10)' : '0 0 0 2px rgba(232,78,42,0.10)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          <button
            onClick={() => setSelectedDocId(null)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '10px 16px 10px 13px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              background: selectedDocId === null ? (theme === 'light' ? 'rgba(107,78,255,0.10)' : 'rgba(232,78,42,0.12)') : 'transparent',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.05)'}`,
              borderLeft: selectedDocId === null ? (theme === 'light' ? '3px solid #6B4EFF' : '3px solid #E84E2A') : '3px solid transparent',
              borderRadius: '8px',
              color: selectedDocId === null ? (theme === 'light' ? '#6B4EFF' : '#E84E2A') : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.65)'),
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              if (selectedDocId !== null) {
                e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)'
              }
            }}
            onMouseLeave={e => {
              if (selectedDocId !== null) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.65)'
              }
            }}
          >
            All documents
          </button>

          {docs.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted font-body">No completed documents yet.</p>
          )}
          {filteredDocs.length === 0 && docs.length > 0 && (
            <p className="px-4 py-4 text-xs text-muted font-body">No matching documents.</p>
          )}

          {filteredDocs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDocId(doc.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 16px 10px 13px',
                background: selectedDocId === doc.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.05)'}`,
                borderLeft: selectedDocId === doc.id ? (theme === 'light' ? '3px solid #6B4EFF' : '3px solid rgba(232,78,42,0.60)') : '3px solid transparent',
                borderRadius: '8px',
                color: selectedDocId === doc.id ? (theme === 'light' ? '#1A1040' : 'white') : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.65)'),
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (selectedDocId !== doc.id) {
                  e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)'
                }
              }}
              onMouseLeave={e => {
                if (selectedDocId !== doc.id) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.65)'
                }
              }}
            >
              <p style={{
                fontSize: '13px',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: selectedDocId === doc.id ? 600 : 500,
                color: 'inherit',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: 0,
              }}>
                {doc.original_filename ?? `Document #${doc.id}`}
              </p>
              {doc.document_type && (
                <span style={{ fontSize: '11px', fontFamily: "'DM Sans', sans-serif", color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' }}>
                  {formatDocType(doc.document_type)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: chat interface */}
      <div style={{ flex: 1, minWidth: '480px', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent', height: '100vh', maxHeight: '100vh' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-surface shrink-0">
          <h1 className="font-display text-sm font-semibold text-ink">Document Chat</h1>
          {selectedDoc ? (
            <p className="text-xs text-muted font-body mt-0.5">
              Scoped to:{' '}
              <span className="font-medium text-ink">
                {selectedDoc.original_filename ?? `Document #${selectedDoc.id}`}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted font-body mt-0.5">Searching all documents</p>
          )}
        </div>

        {/* Contextual document header bar */}
        {selectedDoc ? (
          <div style={{
            height: '48px',
            borderBottom: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)'}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: '10px',
            background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.02)',
            flexShrink: 0,
          }}>
            <button
              onClick={() => setSelectedDocId(null)}
              style={{
                background: 'none', border: 'none',
                color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)',
                cursor: 'pointer', padding: '4px',
                display: 'flex', alignItems: 'center',
                borderRadius: '6px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'white'}
              onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)'}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ width: '1px', height: '16px', background: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.12)' }} />
            <FileText size={14} color={theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)'} />
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.85)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {selectedDoc.original_filename || selectedDoc.filename || 'Document'}
            </span>
            {selectedDoc.document_type && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)',
                background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'}`,
                borderRadius: '6px',
                padding: '2px 8px',
                flexShrink: 0,
              }}>
                {formatDocType(selectedDoc.document_type)}
              </span>
            )}
          </div>
        ) : (
          <div style={{
            height: '48px',
            borderBottom: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)'}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: '8px',
            flexShrink: 0,
          }}>
            <BookOpen size={14} color={theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)'} />
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)',
            }}>Searching across all documents</span>
          </div>
        )}

        {/* Message list */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: messages.length > 0 ? 'flex-start' : 'center',
          overflowY: 'auto',
          minHeight: 0,
          padding: '20px 24px',
          gap: '20px',
        }}>
          {messages.length === 0 && !loading ? (
            <EmptyState onSuggest={(q) => { setQuestion(q); inputRef.current?.focus() }} />
          ) : (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && <TypingIndicator />}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions — shown above input when no messages yet */}
        {messages.length === 0 && (
          <div style={{ padding: '8px 16px 0', borderTop: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.06)'}`, flexShrink: 0 }}>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Try asking</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              {SUGGESTED.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setQuestion(s); inputRef.current?.focus() }}
                  style={{
                    padding: '7px 12px',
                    background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'}`,
                    borderRadius: '8px',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '12px',
                    color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.65)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    lineHeight: 1.3,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = theme === 'light' ? 'rgba(107,78,255,0.10)' : 'rgba(232,78,42,0.08)'
                    e.currentTarget.style.borderColor = theme === 'light' ? 'rgba(107,78,255,0.30)' : 'rgba(232,78,42,0.30)'
                    e.currentTarget.style.color = theme === 'light' ? '#6B4EFF' : 'white'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)'
                    e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.65)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleSubmit} style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, background: 'inherit', marginTop: 'auto' }}>
          <div className="flex gap-2.5 items-center">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your documents…"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-paper text-sm font-body text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 disabled:opacity-50 transition-all"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={loading}
                className={cn(
                  'shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                  isListening
                    ? 'bg-accent text-white ring-2 ring-accent/40 animate-pulse'
                    : 'border border-border bg-paper text-muted hover:border-ink/20 hover:text-ink'
                )}
                title={isListening ? 'Stop listening' : 'Speak your question'}
              >
                {isListening ? <MicOff size={15} strokeWidth={2} /> : <Mic size={15} strokeWidth={2} />}
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="shrink-0 w-10 h-10 flex items-center justify-center bg-ink text-surface rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none"
              title="Send"
            >
              <Send size={15} strokeWidth={2} />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
