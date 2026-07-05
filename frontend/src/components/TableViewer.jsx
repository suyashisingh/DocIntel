import { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react'
import { exportTable } from '../api/tables'

const NUMERIC_RE = /^[\d.,\-+%$€₹]+$/
const GENERIC_COL_RE = /^Col \d+$/i
const ROW_LIMIT = 10

function isNumeric(val) {
  return typeof val === 'string' && NUMERIC_RE.test(val.trim()) && val.trim() !== ''
}

function toDisplayHeader(h, index) {
  if (!h || GENERIC_COL_RE.test(h)) return `Column ${index + 1}`
  return h
}

function isCellEmpty(cell) {
  return String(cell ?? '').trim() === ''
}

// confPct → badge classes that work on dark backgrounds
function confBadgeCls(confPct) {
  if (confPct == null) return ''
  if (confPct >= 80) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
  if (confPct >= 60) return 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/30'
  return 'text-red-400 bg-red-500/10 border border-red-500/30'
}

export default function TableViewer({ table, pageLabel, confPct }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortCol, setSortCol]         = useState(null)
  const [sortDir, setSortDir]         = useState('asc')
  const [exporting, setExporting]     = useState(null)
  const [showAllRows, setShowAllRows] = useState(false)

  const headers = table.headers || []
  const colCount = table.column_count || (table.rows?.[0]?.length ?? 0)
  const rawHeaders = headers.length > 0
    ? headers
    : Array.from({ length: colCount }, (_, i) => `Col ${i + 1}`)

  // Hide columns where every row's cell is empty/blank.
  const visibleColIndices = useMemo(() => {
    const rows = Array.isArray(table.rows) ? table.rows : []
    const total = rawHeaders.length
    const all = Array.from({ length: total }, (_, i) => i)
    if (rows.length === 0) return all
    const nonEmpty = all.filter((ci) => rows.some((row) => !isCellEmpty(row?.[ci])))
    return nonEmpty.length > 0 ? nonEmpty : all
  }, [table.rows, rawHeaders.length])

  const displayHeaders = visibleColIndices.map((ci) => toDisplayHeader(rawHeaders[ci], ci))

  const filteredRows = useMemo(() => {
    let rows = Array.isArray(table.rows) ? [...table.rows] : []
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter((row) =>
        row.some((cell) => String(cell ?? '').toLowerCase().includes(q))
      )
    }
    if (sortCol !== null) {
      rows.sort((a, b) => {
        const av = String(a[sortCol] ?? '')
        const bv = String(b[sortCol] ?? '')
        const an = parseFloat(av.replace(/[,\s]/g, ''))
        const bn = parseFloat(bv.replace(/[,\s]/g, ''))
        if (!isNaN(an) && !isNaN(bn)) return sortDir === 'asc' ? an - bn : bn - an
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return rows
  }, [table.rows, searchQuery, sortCol, sortDir])

  const displayRows = showAllRows ? filteredRows : filteredRows.slice(0, ROW_LIMIT)
  const hasMoreRows = filteredRows.length > ROW_LIMIT

  function handleSort(colIdx) {
    if (sortCol === colIdx) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(colIdx)
      setSortDir('asc')
    }
  }

  async function handleExport(fmt) {
    setExporting(fmt)
    try {
      const resp = await exportTable(table.id, fmt)
      const url = URL.createObjectURL(new Blob([resp.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `table_p${table.page_number}.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently ignore
    } finally {
      setExporting(null)
    }
  }

  function SortIcon({ colIdx }) {
    if (sortCol !== colIdx) return <ArrowUpDown size={11} className="opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp size={11} className="text-accent" />
      : <ArrowDown size={11} className="text-accent" />
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.08]">

      {/* ── Header info bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-white/[0.08] bg-white/[0.03]">
        {/* Left: page label */}
        <span className="text-xs text-[#8C8A85] font-body shrink-0">
          {pageLabel}
        </span>

        {/* Center: dimensions */}
        <span className="text-xs text-[#8C8A85] font-mono tabular-nums">
          {table.row_count} rows × {visibleColIndices.length} cols
        </span>

        {/* Right: confidence badge + export buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {confPct != null && (
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium font-body ${confBadgeCls(confPct)}`}>
              {confPct}%
            </span>
          )}
          <button
            onClick={() => handleExport('csv')}
            disabled={!!exporting}
            className="px-2.5 py-1 text-xs font-body border border-white/15 rounded text-[#8C8A85] hover:text-[#F5F2EC] hover:border-white/30 disabled:opacity-50 transition-colors"
          >
            {exporting === 'csv' ? '…' : 'CSV'}
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={!!exporting}
            className="px-2.5 py-1 text-xs font-body border border-white/15 rounded text-[#8C8A85] hover:text-[#F5F2EC] hover:border-white/30 disabled:opacity-50 transition-colors"
          >
            {exporting === 'xlsx' ? '…' : 'XLSX'}
          </button>
        </div>
      </div>

      {/* ── Filter input — flush, no card, sits above header row ──────── */}
      <div className="border-b border-white/[0.08]">
        <div className="relative">
          <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C8A85] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter rows…"
            className="w-full pl-9 pr-4 py-2 text-sm font-body bg-white/[0.05] text-[#F5F2EC] placeholder:text-[#8C8A85] focus:outline-none focus:bg-white/[0.07] transition-colors border-0"
          />
        </div>
        {searchQuery && (
          <p className="px-4 pb-2 text-xs text-[#8C8A85] font-body">
            {filteredRows.length} of {table.row_count} rows
          </p>
        )}
      </div>

      {/* ── Table grid ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/[0.05]">
              {displayHeaders.map((h, pos) => {
                const colIdx = visibleColIndices[pos]
                return (
                  <th
                    key={colIdx}
                    onClick={() => handleSort(colIdx)}
                    className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#8C8A85] border-b border-white/[0.08] border-r border-white/[0.05] last:border-r-0 whitespace-nowrap cursor-pointer hover:text-[#F5F2EC] select-none transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      {h}
                      <SortIcon colIdx={colIdx} />
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={displayHeaders.length}
                  className="px-4 py-6 text-center text-[#8C8A85] text-sm font-body"
                >
                  {searchQuery ? 'No rows match your filter.' : 'No data.'}
                </td>
              </tr>
            ) : (
              displayRows.map((row, ri) => (
                <tr
                  key={ri}
                  className={`border-b border-white/[0.05] last:border-0 hover:bg-white/[0.05] transition-colors ${
                    ri % 2 === 1 ? 'bg-white/[0.025]' : 'bg-transparent'
                  }`}
                >
                  {visibleColIndices.map((colIdx, pos) => {
                    const cell  = row[colIdx]
                    const val   = String(cell ?? '')
                    const display = val.trim() === '' ? '—' : val
                    const numeric = isNumeric(val)
                    return (
                      <td
                        key={colIdx}
                        className={`px-4 py-2.5 align-top cursor-default border-r border-white/[0.05] last:border-r-0 ${
                          pos === 0 ? 'text-[#F5F2EC] font-medium' : 'text-[#F5F2EC]'
                        } ${numeric ? 'text-right tabular-nums' : ''}`}
                        style={{
                          maxWidth: '200px',
                          ...(numeric ? { fontFamily: "'JetBrains Mono', 'Fira Mono', monospace" } : undefined),
                        }}
                      >
                        {display}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMoreRows && (
        <div className="border-t border-white/[0.08] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setShowAllRows((v) => !v)}
            className="text-xs font-body text-[#8C8A85] hover:text-[#F5F2EC] transition-colors"
          >
            {showAllRows ? 'Show fewer rows ↑' : `Show all ${filteredRows.length} rows ↓`}
          </button>
        </div>
      )}

    </div>
  )
}
