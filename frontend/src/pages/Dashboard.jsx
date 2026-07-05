import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ChevronDown, MoreHorizontal, Trash2, X, Files, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { listDocuments, countDocuments, deleteDocument, bulkDelete, bulkReprocess, bulkExport } from '../api/documents'
import { listFolders, createFolder, updateFolder, deleteFolder, addDocToFolder, removeDocFromFolder } from '../api/folders'
import { listTags } from '../api/tags'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useDocumentStatus } from '../hooks/useDocumentStatus'
import BulkActionBar from '../components/BulkActionBar'
import FolderSidebar from '../components/FolderSidebar'
import TagBadge from '../components/TagBadge'
import { Skeleton, SkeletonRow } from '../components/ui/Skeleton'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { cn } from '../lib/cn'

function StatCard({ label, value, sub, icon: Icon, index = 0, border, accentTop, numColor }) {
  const [hovered, setHovered] = useState(false)
  const { theme } = useTheme()
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: 'easeOut' }}
      style={{
        background: theme === 'light' ? '#FFFFFF' : '#332E2A',
        border: hovered ? '1px solid rgba(232,78,42,0.25)' : (border || (theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.18)')),
        borderTop: accentTop,
        borderRadius: 16,
        padding: 28,
        cursor: 'default',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
        boxShadow: hovered ? '0 0 40px rgba(232,78,42,0.06)' : '0 4px 16px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.75)', letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>{label}</p>
        {Icon && (
          <div style={{ width: 20, height: 20, borderRadius: 8, background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={12} style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' }} strokeWidth={1.75} />
          </div>
        )}
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '36px', color: numColor || (theme === 'light' ? '#1A1040' : '#FFFFFF'), margin: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value ?? '—'}</p>
      {sub && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', marginTop: 8 }}>{sub}</p>}
    </motion.div>
  )
}

function StyledCheckbox({ checked, onChange, onClick, indeterminate, refProp }) {
  const { theme } = useTheme()
  const accent = theme === 'light' ? '#6B4EFF' : '#E84E2A'
  return (
    <div style={{ position: 'relative', width: 16, height: 16, flexShrink: 0 }}>
      <input
        ref={refProp}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        onClick={onClick}
        className="doc-checkbox"
        style={indeterminate && !checked ? { borderColor: accent } : {}}
      />
      {checked && (
        <svg style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {indeterminate && !checked && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 8, height: 1.5, background: accent, pointerEvents: 'none', borderRadius: 1 }} />
      )}
    </div>
  )
}

const formatType = (type) => {
  if (!type) return 'Unknown'
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

const formatName = (str) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const PAGE_SIZE = 10

function DocRow({ doc, isAdmin, canManageFolders, onDelete, deletingId, isSelected, onToggle, folders, menuOpen, onMenuToggle, onAddToFolder, onRemoveFromFolder }) {
  const { status, progress, message } = useDocumentStatus(doc.id, doc.status)
  const { theme } = useTheme()
  const effectiveStatus = status ?? doc.status
  const isActive = effectiveStatus === 'processing' || effectiveStatus === 'queued' || effectiveStatus === 'uploaded'

  const docFolderIds = doc.folder_ids || []
  const expiresAt = doc.expires_at ? new Date(doc.expires_at) : null
  const daysLeft = expiresAt ? Math.ceil((expiresAt - new Date()) / 86400000) : null
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7

  const mutedColor = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)'
  const textColor = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.92)'
  const borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)'

  return (
    <tr
      className="group doc-row"
      style={{ borderBottom: `1px solid ${borderColor}`, transition: 'background 0.15s', height: '56px', verticalAlign: 'middle' }}
      onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.07)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ paddingLeft: 20, paddingRight: 12, paddingTop: 14, paddingBottom: 14, width: 40, verticalAlign: 'middle' }}>
        <StyledCheckbox
          checked={isSelected}
          onChange={() => onToggle(doc.id)}
          onClick={e => e.stopPropagation()}
        />
      </td>
      <td style={{ padding: '14px 16px', maxWidth: 280, verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc.original_filename ?? 'Unnamed Document'}
            </span>
            {doc.pii_detected && !doc.pii_redacted && <Badge variant="error" size="sm">PII</Badge>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {docFolderIds.slice(0, 2).map(fid => {
              const f = folders.find(fl => fl.id === fid)
              if (!f) return null
              return (
                <span key={fid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, backgroundColor: `${f.color || '#6366f1'}18`, color: f.color || '#6366f1', border: `1px solid ${f.color || '#6366f1'}30` }}>
                  {f.name}
                </span>
              )
            })}
            {docFolderIds.length > 2 && <span style={{ fontSize: 10, color: mutedColor, fontFamily: "'DM Sans', sans-serif" }}>+{docFolderIds.length - 2}</span>}
            {doc.tags?.slice(0, 3).map(tag => <TagBadge key={tag.id} tag={tag} size="sm" />)}
            {doc.tags?.length > 3 && <span style={{ fontSize: 10, color: mutedColor, fontFamily: "'DM Sans', sans-serif" }}>+{doc.tags.length - 3}</span>}
            {expiringSoon && (
              <Badge variant="warning" size="sm">
                <Clock size={9} strokeWidth={2} />
                {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
              </Badge>
            )}
          </div>
        </div>
      </td>
      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
        {doc.document_type
          ? <Badge variant="default" size="sm" className="font-mono text-[10px]">{formatType(doc.document_type)}</Badge>
          : <span style={{ color: mutedColor, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>—</span>}
      </td>
      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
        {isActive && progress > 0 ? (
          <div style={{ width: 128 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: mutedColor, marginBottom: 4 }}>
              <span>{message || effectiveStatus}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ height: 2, background: borderColor, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: theme === 'light' ? '#6B4EFF' : '#E84E2A', borderRadius: 999, width: `${progress}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        ) : <StatusBadge status={effectiveStatus} />}
      </td>
      <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', verticalAlign: 'middle' }}>
        {doc.upload_time ? new Date(doc.upload_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {effectiveStatus === 'completed' && (
            <Link to={`/documents/${doc.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: theme === 'light' ? '#6B4EFF' : '#E84E2A', textDecoration: 'none', padding: '4px 8px', borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(107,78,255,0.08)' : 'rgba(232,78,42,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              View →
            </Link>
          )}
          {canManageFolders && folders.length > 0 && (
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); onMenuToggle(menuOpen ? null : doc.id) }}
                style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: mutedColor, transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.color = mutedColor; e.currentTarget.style.background = 'transparent' }}
                title="Folder options"
              >
                <MoreHorizontal size={14} strokeWidth={1.75} />
              </button>
              {menuOpen && (
                <div
                  style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 4px)', zIndex: 50, background: theme === 'light' ? '#FFFFFF' : '#1A1816', border: `1px solid ${borderColor}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: '6px 0', minWidth: 176, maxHeight: 224, overflowY: 'auto' }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <p style={{ padding: '0 12px 6px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: mutedColor, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${borderColor}`, marginBottom: 4 }}>
                    Add to folder
                  </p>
                  {folders.map(folder => {
                    const inFolder = docFolderIds.includes(folder.id)
                    return (
                      <button
                        key={folder.id}
                        onClick={() => { inFolder ? onRemoveFromFolder(doc.id, folder.id) : onAddToFolder(doc.id, folder.id); onMenuToggle(null) }}
                        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.7)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: folder.color || '#9ca3af' }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                        {inFolder && <Check size={11} style={{ color: theme === 'light' ? '#6B4EFF' : '#E84E2A', flexShrink: 0 }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => onDelete(doc.id)}
              disabled={deletingId === doc.id}
              style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: mutedColor, transition: 'color 0.15s, background 0.15s', opacity: deletingId === doc.id ? 0.4 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.color = mutedColor; e.currentTarget.style.background = 'transparent' }}
              title="Delete document"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const orgId = user?.org_id
  const isAdmin = user?.role === 'admin'
  const canManageFolders = user?.role === 'admin' || user?.role === 'analyst'
  const userRole = user?.role

  const [docs, setDocs] = useState([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const selectAllRef = useRef(null)

  const [folders, setFolders] = useState([])
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [menuOpenDocId, setMenuOpenDocId] = useState(null)

  const [tags, setTags] = useState([])
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [tagFilterMode, setTagFilterMode] = useState('AND')
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false)
  const [hoveredHeader, setHoveredHeader] = useState(null)

  useEffect(() => { setPage(0) }, [selectedFolderId, selectedTagIds, expiringSoonFilter])

  const loadDocs = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true); setError('')
    const filterParams = {}
    if (selectedFolderId !== null) filterParams.folder_id = selectedFolderId
    if (selectedTagIds.length > 0) {
      if (tagFilterMode === 'AND') filterParams.tag_ids = selectedTagIds
      else filterParams.tag_ids_any = selectedTagIds
    }
    if (expiringSoonFilter) filterParams.expiring_soon = true

    Promise.all([
      listDocuments(orgId, { ...filterParams, skip: page * PAGE_SIZE, limit: PAGE_SIZE }),
      countDocuments(orgId, filterParams),
    ])
      .then(([{ data }, { data: countData }]) => {
        const list = Array.isArray(data) ? data : (data.documents ?? data.items ?? [])
        setDocs(list)
        const serverTotal = countData?.total ?? countData?.total_count ?? countData?.count
        if (serverTotal != null) setTotal(serverTotal)
      })
      .catch(() => setError('Could not load documents.'))
      .finally(() => setLoading(false))
  }, [orgId, page, selectedFolderId, selectedTagIds, tagFilterMode, expiringSoonFilter])

  const loadFolders = useCallback(() => {
    if (!orgId) return
    listFolders(orgId).then(({ data }) => setFolders(Array.isArray(data) ? data : [])).catch(() => {})
  }, [orgId])

  const loadTags = useCallback(() => {
    if (!orgId) return
    listTags(orgId).then(({ data }) => setTags(Array.isArray(data) ? data : [])).catch(() => {})
  }, [orgId])

  useEffect(() => { loadDocs() }, [loadDocs])
  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { loadTags() }, [loadTags])
  useEffect(() => { setSelectedIds(new Set()) }, [page])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.size > 0 && selectedIds.size < docs.length
    }
  }, [selectedIds, docs])

  useEffect(() => {
    if (menuOpenDocId === null) return
    function handleClick() { setMenuOpenDocId(null) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpenDocId])

  const counts = docs.reduce((acc, d) => {
    acc.total++
    if (d.status === 'completed') acc.processed++
    else if (d.status === 'failed') acc.failed++
    else acc.pending++
    return acc
  }, { total: 0, processed: 0, pending: 0, failed: 0 })

  function toggleSelect(id) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function handleSelectAll() {
    if (selectedIds.size === docs.length && docs.length > 0) setSelectedIds(new Set())
    else setSelectedIds(new Set(docs.map(d => d.id)))
  }

  async function handleDelete(docId) {
    setDeletingId(docId)
    try {
      await deleteDocument(orgId, docId)
      setDocs(prev => prev.filter(d => d.id !== docId))
      setTotal(t => t != null ? t - 1 : t)
      setSelectedIds(prev => { const next = new Set(prev); next.delete(docId); return next })
      loadFolders()
    } catch {} finally { setDeletingId(null) }
  }

  async function confirmBulkDelete() {
    setBulkLoading(true)
    try { await bulkDelete([...selectedIds]); setSelectedIds(new Set()); setShowDeleteConfirm(false); loadDocs(); loadFolders() }
    catch {} finally { setBulkLoading(false) }
  }

  async function handleBulkAddToFolder(folderId) {
    setBulkLoading(true)
    try { await Promise.allSettled([...selectedIds].map(docId => addDocToFolder(orgId, folderId, docId))); setSelectedIds(new Set()); loadDocs(); loadFolders() }
    catch {} finally { setBulkLoading(false) }
  }

  async function handleBulkReprocess() {
    setBulkLoading(true)
    try { await bulkReprocess(orgId, [...selectedIds]); setSelectedIds(new Set()); loadDocs() }
    catch {} finally { setBulkLoading(false) }
  }

  async function handleBulkExport(format) {
    try {
      const response = await bulkExport([...selectedIds], format)
      const blob = new Blob([response.data], { type: format === 'csv' ? 'text/csv' : 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `bulk_export.${format}`; a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  async function handleCreateFolder(data) {
    try { const { data: folder } = await createFolder(orgId, data); setFolders(prev => [...prev, folder]) } catch {}
  }

  async function handleRenameFolder(folderId, name) {
    try { const { data: folder } = await updateFolder(orgId, folderId, { name }); setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: folder.name } : f)) } catch {}
  }

  async function handleDeleteFolder(folderId) {
    try { await deleteFolder(orgId, folderId); setFolders(prev => prev.filter(f => f.id !== folderId && f.parent_id !== folderId)); if (selectedFolderId === folderId) setSelectedFolderId(null) } catch {}
  }

  async function handleAddToFolder(docId, folderId) {
    try { await addDocToFolder(orgId, folderId, docId); setSelectedIds(new Set()); loadDocs(); loadFolders() } catch {}
  }

  async function handleRemoveFromFolder(docId, folderId) {
    try {
      await removeDocFromFolder(orgId, folderId, docId)
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, folder_ids: (d.folder_ids || []).filter(id => id !== folderId) } : d))
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, document_count: Math.max(0, f.document_count - 1) } : f))
    } catch {}
  }

  const totalPages = total != null ? Math.ceil(total / PAGE_SIZE) : null
  const hasNext = totalPages != null ? page < totalPages - 1 : docs.length === PAGE_SIZE
  const hasPrev = page > 0
  const selectedFolderName = selectedFolderId !== null ? folders.find(f => f.id === selectedFolderId)?.name : null

  const activeFilterCount = (expiringSoonFilter ? 1 : 0) + selectedTagIds.length

  const pageBtnStyle = {
    padding: '6px 14px', fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
    background: theme === 'light' ? '#F5F2FF' : 'rgba(255,255,255,0.06)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.7)', cursor: 'pointer', transition: 'all 0.15s',
  }

  return (
    <div className={selectedIds.size > 0 ? 'pb-24' : ''}>
      <style>{`
        .doc-checkbox {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          min-width: 16px;
          border: 1.5px solid rgba(255,255,255,0.20);
          border-radius: 4px;
          background: transparent;
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
          display: inline-block;
          vertical-align: middle;
        }
        .doc-checkbox:hover {
          border-color: rgba(232,78,42,0.60);
        }
        .doc-checkbox:checked {
          background: #E84E2A;
          border-color: #E84E2A;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='8' viewBox='0 0 10 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 4L3.5 6.5L9 1' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: center;
        }
        .doc-row .doc-checkbox {
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .doc-row:hover .doc-checkbox {
          opacity: 1;
        }
        .doc-row .doc-checkbox:checked {
          opacity: 1;
        }
        .doc-row {
          transition: background 0.15s ease;
        }
        .doc-header-row .doc-checkbox {
          opacity: 1 !important;
        }
      `}</style>
      {/* Header */}
      <div className="relative z-10 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 28, color: theme === 'light' ? '#1A1040' : '#FFFFFF', margin: 0 }}>Dashboard</h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {user?.email ? `Welcome back, ${formatName(user?.username || user?.email?.split('@')[0])}` : 'Your document workspace'}
          </p>
        </div>
        <Link
          to="/upload"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: theme === 'light' ? '#6B4EFF' : '#E84E2A', color: '#FFFFFF', fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 14, borderRadius: 10, textDecoration: 'none', transition: 'all 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(232,78,42,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
        >
          + Upload
        </Link>
      </div>

      {/* Stat cards */}
      <div className="relative z-10 grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        <StatCard label="Total" value={total ?? counts.total} icon={Files} index={0} border="1px solid rgba(255,255,255,0.10)" />
        <StatCard label="Processed" value={counts.processed} icon={CheckCircle2} index={1} border="1px solid rgba(34,197,94,0.25)" accentTop="2px solid #22c55e" numColor="#4ade80" />
        <StatCard label="Pending" value={counts.pending} icon={Clock} index={2} border="1px solid rgba(234,179,8,0.25)" accentTop="2px solid #f59e0b" numColor="#facc15" />
        <StatCard label="Failed" value={counts.failed} icon={AlertCircle} index={3} border="1px solid rgba(232,78,42,0.25)" accentTop={theme === 'light' ? '2px solid #6B4EFF' : '2px solid #E84E2A'} numColor="#f87171" />
      </div>

      {/* Filters */}
      <div className="relative z-10 mb-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpiringSoonFilter(v => !v)}
          style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, padding: '6px 10px', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center',
            background: expiringSoonFilter ? 'rgba(234,179,8,0.12)' : (theme === 'light' ? 'rgba(107,78,255,0.08)' : 'rgba(255,255,255,0.04)'),
            border: expiringSoonFilter ? '1px solid rgba(234,179,8,0.3)' : (theme === 'light' ? '1px solid #9B8EC4' : '1px solid rgba(255,255,255,0.08)'),
            color: expiringSoonFilter ? '#facc15' : (theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.45)'),
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            Expiring soon
            {expiringSoonFilter && (
              <span
                onClick={e => { e.stopPropagation(); setExpiringSoonFilter(false) }}
                style={{ marginLeft: '4px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)', fontSize: '16px', lineHeight: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'white'}
                onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)'}
              >×</span>
            )}
          </span>
        </button>

        {tags.length > 0 && (
          <>
            <div style={{ width: 1, height: 16, background: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.35)' }}>Tags:</span>
              <button
                onClick={() => setTagFilterMode(m => m === 'AND' ? 'OR' : 'AND')}
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: '2px 6px', borderRadius: 4, background: theme === 'light' ? 'rgba(107,78,255,0.15)' : 'rgba(255,255,255,0.06)', border: theme === 'light' ? '1px solid #9B8EC4' : '1px solid rgba(255,255,255,0.08)', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {tagFilterMode}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
              {tags.map(tag => {
                const active = selectedTagIds.includes(tag.id)
                return (
                  <button key={tag.id} onClick={() => setSelectedTagIds(prev => active ? prev.filter(id => id !== tag.id) : [...prev, tag.id])} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, opacity: active ? 1 : 0.5, transition: 'opacity 0.15s', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                      <TagBadge tag={tag} size="sm" />
                      {active && (
                        <span
                          onClick={e => { e.stopPropagation(); setSelectedTagIds(prev => prev.filter(id => id !== tag.id)) }}
                          style={{ marginLeft: '4px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)', fontSize: '16px', lineHeight: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'white'}
                          onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.40)'}
                        >×</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            {activeFilterCount >= 1 && (
              <button
                onClick={() => { setExpiringSoonFilter(false); setSelectedTagIds([]) }}
                style={{ background: 'none', border: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: 'rgba(232,78,42,0.65)', cursor: 'pointer', padding: '0 8px', marginLeft: '4px' }}
                onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#6B4EFF' : '#E84E2A'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,78,42,0.65)'}
              >Clear all</button>
            )}
          </>
        )}
      </div>

      {/* Documents section */}
      <div className="relative z-10 flex gap-5 items-start">
        <div style={{ flexShrink: 0, borderRight: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.15)', background: theme === 'light' ? '#E8E4F5' : '#1E1B18', paddingRight: 0 }}>
          <FolderSidebar
            folders={folders}
            selectedId={selectedFolderId}
            onSelect={setSelectedFolderId}
            onCreate={handleCreateFolder}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
            canManage={canManageFolders}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: theme === 'light' ? '#FFFFFF' : '#272320', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.15)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ padding: '16px 20px', borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: theme === 'light' ? '#1A1040' : '#FFFFFF', margin: 0 }}>
                {selectedFolderName
                  ? <><span style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', fontWeight: 400 }}>Folder · </span>{selectedFolderName}</>
                  : 'Documents'}
              </h2>
              {total != null && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.3)' }}>{total.toLocaleString()} total</span>}
            </div>

            {loading && <div>{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</div>}

            {!loading && error && (
              <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: theme === 'light' ? '#6B4EFF' : '#E84E2A' }}>{error}</div>
            )}

            {!loading && !error && docs.length === 0 && (
              <div style={{ padding: '64px 20px', textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Files size={16} strokeWidth={1.5} style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)' }} />
                </div>
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: theme === 'light' ? '#1A1040' : '#FFFFFF', margin: '0 0 4px' }}>
                  {selectedFolderName ? `No documents in "${selectedFolderName}"` : 'No documents yet'}
                </p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' }}>
                  {selectedFolderName ? 'Move documents here from your dashboard.' : <>Upload your first document to get started. <Link to="/upload" style={{ color: theme === 'light' ? '#6B4EFF' : '#E84E2A' }}>Upload now →</Link></>}
                </p>
              </div>
            )}

            {!loading && docs.length > 0 && (
              <>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontFamily: "'DM Sans', sans-serif" }}>
                  <thead>
                    <tr className="doc-header-row" style={{ background: theme === 'light' ? '#F5F2FF' : '#2E2A26', borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)', textAlign: 'left' }}>
                      <th style={{ paddingLeft: 20, paddingRight: 12, paddingTop: 12, paddingBottom: 12, width: 40 }}>
                        <StyledCheckbox refProp={selectAllRef} checked={docs.length > 0 && selectedIds.size === docs.length} onChange={handleSelectAll} indeterminate={selectedIds.size > 0 && selectedIds.size < docs.length} />
                      </th>
                      {['File', 'Type', 'Status', 'Uploaded'].map(h => (
                        <th
                          key={h}
                          style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.75)', fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredHeader(h)}
                          onMouseLeave={() => setHoveredHeader(null)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {h}
                            <ChevronDown size={12} style={{ color: hoveredHeader === h ? (theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.60)') : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.20)'), transition: 'color 0.15s' }} />
                          </div>
                        </th>
                      ))}
                      <th style={{ padding: '12px 16px', width: 128 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map(doc => (
                      <DocRow
                        key={doc.id}
                        doc={doc}
                        isAdmin={isAdmin}
                        canManageFolders={canManageFolders}
                        orgId={orgId}
                        onDelete={handleDelete}
                        deletingId={deletingId}
                        isSelected={selectedIds.has(doc.id)}
                        onToggle={toggleSelect}
                        folders={folders}
                        menuOpen={menuOpenDocId === doc.id}
                        onMenuToggle={id => setMenuOpenDocId(id)}
                        onAddToFolder={handleAddToFolder}
                        onRemoveFromFolder={handleRemoveFromFolder}
                      />
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.06)', background: theme === 'light' ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)' }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.3)' }}>
                    Page {page + 1}{totalPages != null ? ` of ${totalPages}` : ''}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{ ...pageBtnStyle, opacity: (!hasPrev || loading) ? 0.4 : 1 }} onClick={() => setPage(p => p - 1)} disabled={!hasPrev || loading} onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }} onMouseLeave={e => e.currentTarget.style.background = theme === 'light' ? '#F5F2FF' : 'rgba(255,255,255,0.06)'}>← Previous</button>
                    <button style={{ ...pageBtnStyle, opacity: (!hasNext || loading) ? 0.4 : 1 }} onClick={() => setPage(p => p + 1)} disabled={!hasNext || loading} onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }} onMouseLeave={e => e.currentTarget.style.background = theme === 'light' ? '#F5F2FF' : 'rgba(255,255,255,0.06)'}>Next →</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: theme === 'light' ? '#FFFFFF' : '#1A1816', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24, maxWidth: 380, width: '100%', margin: '0 16px', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} className="animate-scale-in">
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#1A1040' : '#FFFFFF', margin: '0 0 8px' }}>
              Delete {selectedIds.size} document{selectedIds.size !== 1 ? 's' : ''}?
            </h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', margin: '0 0 24px' }}>
              This action is permanent and cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={bulkLoading}
                style={{ padding: '8px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 14, background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.7)', cursor: 'pointer', opacity: bulkLoading ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                disabled={bulkLoading}
                style={{ padding: '8px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, background: '#dc2626', border: 'none', borderRadius: 10, color: '#FFFFFF', cursor: 'pointer', opacity: bulkLoading ? 0.5 : 1 }}
              >
                {bulkLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkActionBar
        selectedIds={[...selectedIds]}
        onDelete={() => setShowDeleteConfirm(true)}
        onReprocess={handleBulkReprocess}
        onExportCSV={() => handleBulkExport('csv')}
        onExportJSON={() => handleBulkExport('json')}
        onClear={() => setSelectedIds(new Set())}
        userRole={userRole}
        folders={folders}
        onBulkAddToFolder={handleBulkAddToFolder}
        canManageFolders={canManageFolders}
      />
    </div>
  )
}
