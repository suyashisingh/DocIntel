import { useEffect, useRef, useState } from 'react'
import { Check, Plus, Tag as TagIcon } from 'lucide-react'
import { addTagToDocument, createTag, listTags, removeTagFromDocument } from '../api/tags'

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b']

export default function TagSelector({ docId, orgId, appliedTags, onAdd, onRemove }) {
  const [open, setOpen] = useState(false)
  const [allTags, setAllTags] = useState([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open || !orgId) return
    listTags(orgId)
      .then(({ data }) => setAllTags(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [open, orgId])

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setCreating(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const appliedIds = new Set((appliedTags || []).map((t) => t.id))
  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )
  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === search.trim().toLowerCase()
  )

  async function handleToggle(tag) {
    if (appliedIds.has(tag.id)) {
      try {
        await removeTagFromDocument(docId, tag.id)
        onRemove(tag)
      } catch {}
    } else {
      try {
        await addTagToDocument(docId, tag.id)
        onAdd(tag)
      } catch {}
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const { data: tag } = await createTag(orgId, { name: newName.trim(), color: newColor })
      setAllTags((prev) => [...prev, tag])
      await addTagToDocument(docId, tag.id)
      onAdd(tag)
      setNewName('')
      setNewColor(COLORS[0])
      setCreating(false)
      setSearch('')
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-body text-muted border border-border rounded-lg hover:border-accent/40 hover:text-accent transition-colors"
      >
        <TagIcon size={11} strokeWidth={2} />
        Manage tags
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-surface border border-border rounded-xl shadow-xl py-1.5 w-56">
          <div className="px-2.5 pb-1.5">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags…"
              className="w-full px-2.5 py-1.5 text-xs font-body bg-paper border border-border rounded-lg text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>

          <div className="max-h-44 overflow-y-auto">
            {filtered.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleToggle(tag)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-body hover:bg-paper transition-colors text-ink"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color || '#6366f1' }}
                />
                <span className="flex-1 text-left truncate">{tag.name}</span>
                {appliedIds.has(tag.id) && <Check size={11} className="text-accent shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && !creating && (
              <p className="px-3 py-2 text-xs text-muted font-body text-center">No tags found</p>
            )}
          </div>

          {!creating && search.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => { setCreating(true); setNewName(search) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-body text-accent hover:bg-paper transition-colors border-t border-border mt-1"
            >
              <Plus size={11} strokeWidth={2} />
              Create &ldquo;{search}&rdquo;
            </button>
          )}

          {!creating && !search.trim() && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-body text-muted hover:text-ink hover:bg-paper transition-colors border-t border-border mt-1"
            >
              <Plus size={11} strokeWidth={2} />
              New tag
            </button>
          )}

          {creating && (
            <form
              onSubmit={handleCreate}
              className="border-t border-border mt-1 px-2.5 py-2 space-y-2"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                className="w-full px-2 py-1.5 text-xs font-body bg-paper border border-border rounded-md text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              <div className="flex gap-1 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-4 h-4 rounded-full transition-all hover:scale-110 ${
                      newColor === c ? 'ring-2 ring-offset-1 ring-ink/40 scale-110' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  disabled={saving || !newName.trim()}
                  className="flex-1 py-1 text-xs font-body font-medium bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? '…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="px-2 py-1 text-xs font-body text-muted hover:text-ink transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
