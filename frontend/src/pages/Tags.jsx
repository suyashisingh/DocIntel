import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { createTag, deleteTag, listTags, updateTag } from '../api/tags'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Skeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/cn'

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b']

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'w-5 h-5 rounded-full transition-all hover:scale-110',
            value === c ? 'ring-2 ring-offset-2 ring-ink/30 scale-110' : ''
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

const TABS = [
  { key: 'all',    label: 'All' },
  { key: 'mine',   label: 'Mine' },
  { key: 'global', label: 'Global' },
]

const inputCls = 'w-full px-3.5 py-2.5 text-sm font-body rounded-xl transition-all outline-none'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Tags() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const orgId = user?.org_id
  const isAdmin = user?.role === 'admin'

  const [tags, setTags]       = useState([])
  const [tab, setTab]         = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [newColor, setNewColor]     = useState(COLORS[0])
  const [newGlobal, setNewGlobal]   = useState(false)
  const [creating, setCreating]     = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName]   = useState('')
  const [editColor, setEditColor] = useState('')

  const loadTags = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    listTags(orgId)
      .then(({ data }) => setTags(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load tags.'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { loadTags() }, [loadTags])

  const myTags     = tags.filter((t) => t.created_by === user?.id)
  const globalTags = tags.filter((t) => t.created_by !== user?.id)
  const displayed  = tab === 'mine' ? myTags : tab === 'global' ? globalTags : tags

  const searchTerm   = search.trim().toLowerCase()
  const visibleTags  = searchTerm
    ? displayed.filter((t) => t.name.toLowerCase().includes(searchTerm))
    : displayed

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    try {
      const { data: tag } = await createTag(orgId, { name: newName.trim(), color: newColor, is_global: newGlobal })
      setTags((prev) => [...prev, tag])
      setNewName('')
      setNewColor(COLORS[0])
      setNewGlobal(false)
      setShowCreate(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create tag.')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(tag) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || COLORS[0])
  }

  async function confirmEdit(tagId) {
    setError('')
    try {
      const { data: updated } = await updateTag(orgId, tagId, { name: editName.trim(), color: editColor })
      setTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, ...updated } : t)))
      setEditingId(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update tag.')
    }
  }

  async function handleDelete(tagId) {
    setError('')
    try {
      await deleteTag(orgId, tagId)
      setTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not delete tag.')
    }
  }

  const tabCounts = { all: tags.length, mine: myTags.length, global: globalTags.length }

  return (
    <div className="max-w-5xl mx-auto px-4" style={{ color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.90)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-display-md tracking-tight" style={{ color: theme === 'light' ? '#1A1040' : 'white' }}>Tags</h1>
          <p className="mt-1 text-sm text-muted font-body" style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)' }}>Organize documents with labels</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold font-body rounded-xl active:scale-[0.98] transition-all"
          style={{ background: theme === 'light' ? '#6B4EFF' : '#E84E2A', color: 'white' }}
          onMouseEnter={e => { e.currentTarget.style.background = theme === 'light' ? '#5538EE' : '#E84E2A' }}
          onMouseLeave={e => { e.currentTarget.style.background = theme === 'light' ? '#6B4EFF' : '#E84E2A' }}
        >
          <Plus size={14} strokeWidth={2} />
          New tag
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl p-5 space-y-4" style={{ background: theme === 'light' ? '#FFFFFF' : '#3A3430', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.20)' }}>
          <h2 className="font-display text-sm font-semibold" style={{ color: theme === 'light' ? '#1A1040' : 'white' }}>Create tag</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tag name"
              className={inputCls}
              style={{ background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)', color: theme === 'light' ? '#1A1040' : 'white', borderRadius: '12px' }}
              onFocus={e => e.target.style.borderColor = 'rgba(232,78,42,0.60)'}
              onBlur={e => e.target.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.12)'}
            />
            <div>
              <p className="text-xs font-medium text-muted font-body mb-2">Color</p>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
            {isAdmin && (
              <label className="flex items-center gap-2.5 text-sm font-body text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={newGlobal}
                  onChange={(e) => setNewGlobal(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#0D0D0D] cursor-pointer"
                />
                Make global (visible to all members)
              </label>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-4 py-2 text-sm font-semibold font-body rounded-xl active:scale-[0.98] disabled:opacity-50 transition-all"
                style={{ background: '#E84E2A', color: 'white' }}
              >
                {creating ? 'Creating…' : 'Create tag'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName('') }}
                className="px-3 py-2 text-sm font-body text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border mb-5" style={{ borderColor: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-body -mb-px transition-colors"
            style={{
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: tab === t.key ? (theme === 'light' ? '2px solid #1A1040' : '2px solid white') : '2px solid transparent',
              color: tab === t.key ? (theme === 'light' ? '#1A1040' : 'white') : (theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)'),
              fontWeight: tab === t.key ? 500 : 400,
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {t.label}
            <span className="ml-1.5 text-xs tabular-nums opacity-60">({tabCounts[t.key]})</span>
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="w-full px-3.5 py-2.5 text-sm font-body rounded-xl outline-none transition-all"
          style={{
            background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
            border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.12)',
            color: theme === 'light' ? '#1A1040' : 'white',
            paddingRight: search ? '2.25rem' : undefined,
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(232,78,42,0.60)'}
          onBlur={e => e.target.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.12)'}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none transition-colors"
            style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)' }}
            onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'white'}
            onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)'}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-600 font-body bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
          {error}
        </div>
      )}

      {loading && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && visibleTags.length === 0 && (
        <div className="text-center py-16">
          <div className="w-10 h-10 rounded-xl border flex items-center justify-center mx-auto mb-3" style={{ background: theme === 'light' ? '#F0EEFB' : '#332E2A', borderColor: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.12)' }}>
            <Tag size={16} strokeWidth={1.5} className="text-muted" />
          </div>
          <p className="text-sm font-semibold font-display mb-1" style={{ color: theme === 'light' ? '#1A1040' : '#F5F2EC' }}>No tags found</p>
          <p className="text-xs font-body" style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85' }}>
            {searchTerm
              ? `No tags match "${search}".`
              : tab === 'mine' ? 'Create a personal tag above.'
              : tab === 'global' ? 'No tags from other members yet.'
              : 'Create your first tag above.'}
          </p>
        </div>
      )}

      {!loading && visibleTags.length > 0 && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {visibleTags.map((tag, i) => {
            const accentColor = tag.color || '#6366f1'
            const isMine = tag.created_by === user?.id
            const canEdit = isMine || isAdmin
            const docCount = tag.doc_count ?? 0

            return (
              <motion.div
                key={tag.id}
                className="flex flex-col gap-3"
                style={{
                  background: theme === 'light' ? '#FFFFFF' : '#423E3B',
                  border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)',
                  borderLeft: `4px solid ${accentColor}`,
                  borderRadius: '12px',
                  padding: '18px 20px',
                  boxShadow: theme === 'light' ? '0 2px 8px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.40)',
                }}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3) }}
                whileHover={{ y: -2, transition: { duration: 0.12 } }}
              >
                {editingId === tag.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit(tag.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="w-full px-2.5 py-1.5 text-sm font-body bg-paper border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                    <ColorPicker value={editColor} onChange={setEditColor} />
                    <div className="flex gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => confirmEdit(tag.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold font-body bg-ink text-surface rounded-lg hover:bg-ink/90 transition-colors"
                      >
                        <Check size={10} />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 text-xs font-body text-muted hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Tag name + color dot inline */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: accentColor }}
                        />
                        <p
                          className="text-base font-semibold font-display leading-snug truncate"
                          style={{ color: theme === 'light' ? '#1A1040' : '#F5F2EC' }}
                        >
                          {tag.name}
                        </p>
                      </div>
                      {tag.is_global && (
                        <span
                          className="mt-1.5 inline-block text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5"
                          style={{ color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.45)', borderColor: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.15)' }}
                        >
                          global
                        </span>
                      )}
                    </div>

                    {/* Doc count — accent-colored clickable link */}
                    <Link
                      to={`/search?tag=${tag.id}`}
                      className="text-xs font-body w-fit transition-opacity hover:opacity-80"
                      style={{ color: '#E84E2A' }}
                    >
                      {docCount} doc{docCount !== 1 ? 's' : ''} →
                    </Link>

                    {/* Bottom row: meta + action buttons */}
                    <div
                      className="flex items-center justify-between gap-2 pt-2 mt-auto"
                      style={{ borderTop: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <p className="text-[11px] font-body leading-tight" style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85' }}>
                        {isMine ? 'By you' : tag.is_global ? 'Global' : 'Shared'}
                        {tag.created_at ? ` · ${formatDate(tag.created_at)}` : ''}
                      </p>
                      {canEdit && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(tag)}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85' }}
                            onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : '#F5F2EC'}
                            onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : '#8C8A85'}
                            title="Rename"
                          >
                            <Pencil size={12} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tag.id)}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#E84E2A'}
                            onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : '#8C8A85'}
                            title="Delete"
                          >
                            <Trash2 size={12} strokeWidth={1.75} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
