import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, MinusCircle, PlusCircle, Sparkles } from 'lucide-react'
import { getComparison } from '../api/comparisons'
import { useComparisonStatus } from '../hooks/useComparisonStatus'
import { Skeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/cn'

function ProgressBar({ progress, message }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
      <p className="text-sm font-body text-ink font-medium">{message || 'Processing…'}</p>
      <div className="h-0.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-ink rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted font-mono tabular-nums">{progress}%</p>
    </div>
  )
}

// ── Textual diff ──────────────────────────────────────────────────────────────

function parseHunkHeader(header) {
  const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  return m ? { leftStart: parseInt(m[1], 10), rightStart: parseInt(m[2], 10) } : { leftStart: 1, rightStart: 1 }
}

function buildDiffRows(header, lines) {
  const { leftStart, rightStart } = parseHunkHeader(header)
  let ln = leftStart - 1
  let rn = rightStart - 1
  const rows = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const prefix = raw[0]
    const text = raw.slice(1).replace(/\n$/, '')

    if (prefix === ' ') {
      ln++; rn++
      rows.push({ left: { num: ln, text }, right: { num: rn, text }, type: 'unchanged' })
      i++
    } else if (prefix === '-') {
      const removed = []
      while (i < lines.length && lines[i][0] === '-') { removed.push(lines[i].slice(1).replace(/\n$/, '')); i++ }
      const added = []
      while (i < lines.length && lines[i][0] === '+') { added.push(lines[i].slice(1).replace(/\n$/, '')); i++ }
      const maxLen = Math.max(removed.length, added.length)
      for (let j = 0; j < maxLen; j++) {
        const hasL = j < removed.length
        const hasR = j < added.length
        if (hasL) ln++
        if (hasR) rn++
        const type = hasL && hasR ? 'changed' : hasL ? 'removed' : 'added'
        rows.push({ left: hasL ? { num: ln, text: removed[j] } : null, right: hasR ? { num: rn, text: added[j] } : null, type })
      }
    } else if (prefix === '+') {
      rn++
      rows.push({ left: null, right: { num: rn, text }, type: 'added' })
      i++
    } else {
      i++
    }
  }
  return rows
}

const DIFF_CONTEXT = 2

// Collapse long runs of unchanged rows down to a couple of context lines on
// each side, with a divider marking how many lines were hidden in between.
function compactRows(rows, context = DIFF_CONTEXT) {
  const result = []
  let i = 0
  while (i < rows.length) {
    if (rows[i].type !== 'unchanged') {
      result.push(rows[i])
      i++
      continue
    }
    let j = i
    while (j < rows.length && rows[j].type === 'unchanged') j++
    const runLength = j - i
    if (runLength <= context * 2) {
      for (let k = i; k < j; k++) result.push(rows[k])
    } else {
      for (let k = i; k < i + context; k++) result.push(rows[k])
      result.push({ type: 'collapsed', count: runLength - context * 2 })
      for (let k = j - context; k < j; k++) result.push(rows[k])
    }
    i = j
  }
  return result
}

function CollapsedDivider({ count }) {
  return (
    <div className="px-3 py-1.5 text-center text-[11px] font-mono text-muted bg-paper/60 border-y border-border select-none">
      ⋯ {count} unchanged line{count !== 1 ? 's' : ''} ⋯
    </div>
  )
}

function DiffRow({ row }) {
  const leftBg  = row.type === 'removed' || row.type === 'changed' ? 'bg-red-50' : ''
  const rightBg = row.type === 'added'   || row.type === 'changed' ? 'bg-emerald-50' : ''
  return (
    <div className="flex text-xs font-mono" style={{ fontFamily: "'JetBrains Mono', 'Fira Mono', monospace" }}>
      <div className={cn('w-1/2 flex border-r border-border', leftBg)}>
        <span className="w-10 shrink-0 text-right pr-2 py-1 text-muted/70 select-none border-r border-border tabular-nums">
          {row.left?.num ?? ''}
        </span>
        <span className="px-2 py-1 whitespace-pre-wrap break-words flex-1">
          {row.left ? (row.type === 'removed' || row.type === 'changed'
            ? <span className="text-red-700 font-medium">{row.left.text}</span>
            : <span className="text-muted font-normal">{row.left.text}</span>) : ''}
        </span>
      </div>
      <div className={cn('w-1/2 flex', rightBg)}>
        <span className="w-10 shrink-0 text-right pr-2 py-1 text-muted/70 select-none border-r border-border tabular-nums">
          {row.right?.num ?? ''}
        </span>
        <span className="px-2 py-1 whitespace-pre-wrap break-words flex-1">
          {row.right ? (row.type === 'added' || row.type === 'changed'
            ? <span className="text-emerald-700 font-medium">{row.right.text}</span>
            : <span className="text-muted font-normal">{row.right.text}</span>) : ''}
        </span>
      </div>
    </div>
  )
}

function TextualResult({ result }) {
  const { stats, hunks } = result
  const ratio = Math.round((stats.ratio ?? 0) * 100)
  const [showFullDiff, setShowFullDiff] = useState(false)

  const hunkRows = hunks.map((hunk) => {
    const rows = buildDiffRows(hunk.header, hunk.lines)
    return { header: hunk.header, rows: showFullDiff ? rows : compactRows(rows) }
  })

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-center gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-center">
          <p className="text-2xl font-bold font-display text-emerald-700 tabular-nums">+{stats.added}</p>
          <p className="text-xs font-body text-emerald-600 mt-0.5">Added</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-center">
          <p className="text-2xl font-bold font-display text-red-600 tabular-nums">−{stats.removed}</p>
          <p className="text-xs font-body text-red-500 mt-0.5">Removed</p>
        </div>
        <div className="bg-paper border border-border rounded-xl px-5 py-3 text-center">
          <p className="text-2xl font-bold font-display text-muted tabular-nums">{stats.unchanged}</p>
          <p className="text-xs font-body text-muted mt-0.5">Unchanged</p>
        </div>
        <div
          className="rounded-xl px-7 py-4 text-center"
          style={{ background: 'var(--color-accent-subtle)', border: '1px solid rgb(var(--color-accent-rgb) / 0.3)' }}
        >
          <p className="font-bold font-display tabular-nums" style={{ fontSize: '2rem', lineHeight: 1, color: 'var(--color-accent)' }}>{ratio}%</p>
          <p className="text-xs font-body font-semibold mt-1" style={{ color: 'var(--color-accent)' }}>Similarity</p>
          <p className="text-[10px] font-body text-muted mt-1">Based on line-by-line text differences</p>
        </div>
      </div>

      {hunks.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-6 text-sm font-body text-muted text-center">
          Documents are identical.
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1 flex text-xs font-body text-muted bg-paper/40 border border-border rounded-lg overflow-hidden">
              <div className="w-1/2 px-3 py-2 border-r border-border font-medium">Document A</div>
              <div className="w-1/2 px-3 py-2 font-medium">Document B</div>
            </div>
            <button
              type="button"
              onClick={() => setShowFullDiff((v) => !v)}
              className="shrink-0 px-3 py-2 text-xs font-medium font-body border border-border rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors"
            >
              {showFullDiff ? 'Show compact view ↑' : 'Show full diff ↓'}
            </button>
          </div>

          <div className="space-y-5">
            {hunkRows.map((hunk, hi) => (
              <div key={hi} className="bg-surface border border-border rounded-xl overflow-hidden shadow-xs">
                <div className="bg-paper border-b border-border px-3 py-2 text-[11px] font-mono text-muted tracking-wide" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {hunk.header}
                </div>
                {hunk.rows.map((row, ri) => (
                  row.type === 'collapsed'
                    ? <CollapsedDivider key={ri} count={row.count} />
                    : <DiffRow key={ri} row={row} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Semantic result ───────────────────────────────────────────────────────────

const STATUS_META = {
  matched:  { label: 'Matched',  icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  modified: { label: 'Modified', icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
  added:    { label: 'Added',    icon: PlusCircle,   color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200' },
  removed:  { label: 'Removed',  icon: MinusCircle,  color: 'text-red-500',     bg: 'bg-red-50 border-red-200' },
}

function truncatePoint(text, len = 160) {
  if (!text) return ''
  const trimmed = text.trim()
  return trimmed.length > len ? `${trimmed.slice(0, len).trimEnd()}…` : trimmed
}

const KEY_POINTS_PREVIEW = 6

function FullPairingList({ pairings }) {
  return (
    <div className="divide-y divide-white/40">
      {pairings.map((p, i) => (
        <div key={i} className="px-4 py-3 bg-white/30 space-y-1.5">
          {p.chunk_a && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-red-500 mb-0.5">Doc A</p>
              <p className="text-xs font-body text-ink leading-relaxed">{p.chunk_a}</p>
            </div>
          )}
          {p.chunk_b && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 mb-0.5">Doc B</p>
              <p className="text-xs font-body text-ink leading-relaxed">{p.chunk_b}</p>
            </div>
          )}
          {p.similarity > 0 && (
            <p className="text-xs font-mono text-muted tabular-nums">
              Similarity: {Math.round(p.similarity * 100)}%
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// Every group can be a wall of raw chunk text — show a short bulleted list of
// key points instead, with an expander for the full untruncated content.
function KeyPointsList({ status, pairings }) {
  const [showFull, setShowFull] = useState(false)
  const preview = pairings.slice(0, KEY_POINTS_PREVIEW)
  const hasMore = pairings.length > KEY_POINTS_PREVIEW

  if (showFull) {
    return (
      <>
        <FullPairingList pairings={pairings} />
        <button
          type="button"
          onClick={() => setShowFull(false)}
          className="w-full px-4 py-2.5 text-xs font-body text-muted hover:text-ink bg-white/20 hover:bg-white/30 transition-colors text-center"
        >
          Show fewer ↑
        </button>
      </>
    )
  }

  return (
    <>
      <ul className="divide-y divide-white/40">
        {preview.map((p, i) => (
          <li key={i} className="px-4 py-2.5 bg-white/30 flex items-start gap-2.5">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-current shrink-0 opacity-50" />
            {status === 'modified' ? (
              <p className="text-xs font-body leading-relaxed">
                <span className="text-red-500/80 line-through decoration-red-300/70">{truncatePoint(p.chunk_a, 90)}</span>
                <span className="mx-1.5 text-muted">→</span>
                <span className="text-emerald-700">{truncatePoint(p.chunk_b, 90)}</span>
              </p>
            ) : (
              <p className="text-xs font-body text-ink leading-relaxed">
                {truncatePoint(status === 'removed' ? p.chunk_a : (p.chunk_b ?? p.chunk_a))}
              </p>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setShowFull(true)}
        className="w-full px-4 py-2.5 text-xs font-body text-muted hover:text-ink bg-white/20 hover:bg-white/30 transition-colors text-center"
      >
        Show full content{hasMore ? ` (${pairings.length} total)` : ''} ↓
      </button>
    </>
  )
}

function PairingGroup({ status, pairings }) {
  const [open, setOpen] = useState(status === 'modified' || status === 'added' || status === 'removed')
  const meta = STATUS_META[status]
  const Icon = meta.icon

  return (
    <div className={cn('border rounded-xl overflow-hidden', meta.bg)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn('w-full flex items-center justify-between px-4 py-3 text-sm font-medium font-body', meta.color)}
      >
        <span className="flex items-center gap-2">
          <Icon size={14} strokeWidth={1.75} />
          {meta.label}
          <span className="ml-1 bg-white/60 rounded-full px-2 py-0.5 text-xs tabular-nums font-mono">
            {pairings.length}
          </span>
        </span>
        {open ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
      </button>

      {open && <KeyPointsList status={status} pairings={pairings} />}
    </div>
  )
}

function SemanticResult({ result, summary }) {
  const { overall_similarity, pairings, stats } = result
  const pct = Math.round((overall_similarity ?? 0) * 100)

  const grouped = {}
  for (const p of pairings) {
    if (!grouped[p.status]) grouped[p.status] = []
    grouped[p.status].push(p)
  }

  const order = ['matched', 'modified', 'added', 'removed']

  return (
    <div className="space-y-8">
      <div className="bg-surface border border-border rounded-xl p-6 flex items-center gap-8">
        <div className="shrink-0">
          <p className="font-display font-bold tabular-nums" style={{ fontSize: '3rem', lineHeight: 1, color: 'var(--color-accent)' }}>{pct}%</p>
          <p className="text-xs font-body font-semibold mt-1" style={{ color: 'var(--color-accent)' }}>Overall similarity</p>
          <p className="text-[10px] font-body text-muted mt-1">Based on semantic embedding distance</p>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3">
          {order.map((s) => {
            const M = STATUS_META[s]
            const I = M.icon
            return (
              <div key={s} className="flex items-center gap-2">
                <I size={13} className={M.color} strokeWidth={1.75} />
                <span className="text-xs text-muted font-body capitalize">{s}</span>
                <span className="ml-auto font-mono font-semibold text-xs text-ink tabular-nums">{stats[s] ?? 0}</span>
              </div>
            )
          })}
        </div>
      </div>

      {summary && (
        <div className="bg-paper border border-border rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={13} strokeWidth={1.75} className="text-muted" />
            <p className="text-label text-muted uppercase tracking-[0.07em] font-body">AI Change Summary</p>
          </div>
          <div className="prose prose-sm max-w-none text-ink font-body">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {order
          .filter((s) => grouped[s]?.length)
          .map((s) => <PairingGroup key={s} status={s} pairings={grouped[s]} />)}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompareResult() {
  const { id } = useParams()
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState('')

  const fetchComparison = useCallback(() => {
    getComparison(id)
      .then(({ data }) => setComparison(data))
      .catch(() => setFetchError('Could not load comparison.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchComparison() }, [fetchComparison])

  const initialStatus = comparison?.status ?? null
  const { status, progress, message } = useComparisonStatus(
    comparison ? parseInt(id, 10) : null,
    initialStatus,
  )

  useEffect(() => {
    if (status === 'completed' && comparison?.status !== 'completed') fetchComparison()
  }, [status, comparison?.status, fetchComparison])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="max-w-6xl mx-auto">
        <Link to="/compare" className="text-sm text-muted hover:text-ink font-body transition-colors">
          ← New comparison
        </Link>
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700 font-body">
          {fetchError}
        </div>
      </div>
    )
  }

  const docALabel = `Document #${comparison.doc_a_id}`
  const docBLabel = `Document #${comparison.doc_b_id}`
  const modeLabel = comparison.mode === 'textual' ? 'Textual Diff' : 'Semantic Comparison'

  const statusCls = status === 'completed'
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    : status === 'failed'
    ? 'bg-red-50 text-red-600 border border-red-200'
    : 'bg-paper text-muted border border-border'

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <Link to="/compare" className="inline-flex items-center text-sm text-muted hover:text-ink font-body transition-colors">
        ← New comparison
      </Link>

      <div
        className="sticky top-0 z-10 flex items-start justify-between gap-4 py-3 border-b border-border"
        style={{ background: 'var(--color-bg)' }}
      >
        <div>
          <h1 className="font-display text-display-md text-ink tracking-tight">
            {docALabel} vs {docBLabel}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold font-body"
              style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
            >
              {modeLabel}
            </span>
            {comparison.created_at && (
              <span className="text-xs text-muted font-body">
                {new Date(comparison.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <span className={cn('shrink-0 inline-block px-2.5 py-1 rounded-full text-xs font-medium font-body capitalize', statusCls)}>
          {status}
        </span>
      </div>

      {(status === 'pending' || status === 'processing') && (
        <ProgressBar progress={progress} message={message} />
      )}

      {status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700 font-body">
          Comparison failed.{' '}
          {comparison.result?.error && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs">Details</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap break-all font-mono">{comparison.result.error}</pre>
            </details>
          )}
        </div>
      )}

      {status === 'completed' && comparison.result && (
        comparison.mode === 'textual' ? (
          <TextualResult result={comparison.result} />
        ) : (
          <SemanticResult result={comparison.result} summary={comparison.summary} />
        )
      )}
    </div>
  )
}
