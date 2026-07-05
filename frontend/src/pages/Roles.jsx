import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Pencil, Plus, Shield, ShieldCheck, Trash2, X } from 'lucide-react'
import { getRoles, createRole, updateRole, deleteRole } from '../api/roles'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { LockedState } from '../components/ui/LockedState'
import { isForbidden } from '../lib/http'
import { cn } from '../lib/cn'

const PERMISSION_SCHEMA = [
  {
    category: 'documents',
    label: 'Documents',
    actions: [
      { key: 'upload',     label: 'Upload documents' },
      { key: 'view',       label: 'View results' },
      { key: 'delete',     label: 'Delete documents' },
      { key: 'reprocess',  label: 'Reprocess documents' },
      { key: 'export',     label: 'Export documents' },
    ],
  },
  {
    category: 'chat',
    label: 'Chat',
    actions: [{ key: 'use', label: 'Use AI chat' }],
  },
  {
    category: 'analytics',
    label: 'Analytics',
    actions: [{ key: 'view', label: 'View analytics' }],
  },
  {
    category: 'team',
    label: 'Team',
    actions: [
      { key: 'view',   label: 'View team members' },
      { key: 'invite', label: 'Invite members' },
      { key: 'remove', label: 'Remove members' },
    ],
  },
  {
    category: 'roles',
    label: 'Roles',
    actions: [
      { key: 'view',   label: 'View roles' },
      { key: 'manage', label: 'Manage roles' },
    ],
  },
  {
    category: 'compare',
    label: 'Compare',
    actions: [{ key: 'use', label: 'Compare documents' }],
  },
  {
    category: 'search',
    label: 'Search',
    actions: [{ key: 'use', label: 'Search documents' }],
  },
]

// Four representative permissions shown in each card summary
const CARD_PERMISSIONS = [
  { category: 'documents', key: 'upload',  label: 'Upload documents' },
  { category: 'documents', key: 'delete',  label: 'Delete documents' },
  { category: 'team',      key: 'invite',  label: 'Invite members'   },
  { category: 'roles',     key: 'manage',  label: 'Manage roles'     },
]

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none',
        checked ? 'bg-ink' : 'bg-border',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

function initPermissions(perms) {
  const result = {}
  for (const { category, actions } of PERMISSION_SCHEMA) {
    result[category] = {}
    for (const { key } of actions) {
      result[category][key] = perms?.[category]?.[key] ?? false
    }
  }
  return result
}

export default function Roles() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const [forbidden, setForbidden] = useState(false)
  const [roles, setRoles]         = useState([])
  const [selected, setSelected]   = useState(null)
  const [editName, setEditName]   = useState('')
  const [editDesc, setEditDesc]   = useState('')
  const [editPerms, setEditPerms] = useState({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const [newName, setNewName]     = useState('')
  const [newDesc, setNewDesc]     = useState('')
  const [creating, setCreating]   = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // UI-only state — no logic changes
  const [showEditModal, setShowEditModal] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const fetchRoles = useCallback(() => {
    setLoading(true)
    getRoles()
      .then(({ data }) => setRoles(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (isForbidden(err)) setForbidden(true)
        else setError('Could not load roles.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  // Close modal once delete succeeds (selected cleared by handleDelete)
  useEffect(() => { if (!selected) setShowEditModal(false) }, [selected])

  // Fire handleDelete after selectRole(role) has settled in state
  useEffect(() => {
    if (pendingDeleteId !== null && selected?.id === pendingDeleteId) {
      setPendingDeleteId(null)
      handleDelete()
    }
  }, [selected, pendingDeleteId]) // eslint-disable-line

  function selectRole(role) {
    setSelected(role)
    setEditName(role.name)
    setEditDesc(role.description || '')
    setEditPerms(initPermissions(role.permissions))
    setError('')
    setSuccess('')
  }

  function togglePerm(category, action, value) {
    setEditPerms((prev) => ({
      ...prev,
      [category]: { ...prev[category], [action]: value },
    }))
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const permissions = {}
      for (const { category, actions } of PERMISSION_SCHEMA) {
        permissions[category] = {}
        for (const { key } of actions) {
          permissions[category][key] = editPerms[category]?.[key] ?? false
        }
      }
      const { data } = await updateRole(selected.id, { name: editName, description: editDesc || null, permissions })
      setRoles((prev) => prev.map((r) => (r.id === data.id ? data : r)))
      setSelected(data)
      setEditPerms(initPermissions(data.permissions))
      setSuccess('Saved.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save role.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected || selected.is_system) return
    setDeleting(true)
    setError('')
    try {
      await deleteRole(selected.id)
      setRoles((prev) => prev.filter((r) => r.id !== selected.id))
      setSelected(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete role.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    try {
      const { data } = await createRole({ name: newName.trim(), description: newDesc.trim() || null, permissions: initPermissions({}) })
      setRoles((prev) => [...prev, data])
      selectRole(data)
      setShowNew(false)
      setNewName('')
      setNewDesc('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create role.')
    } finally {
      setCreating(false)
    }
  }

  function openEdit(role) {
    selectRole(role)
    setShowEditModal(true)
  }

  function requestDelete(role) {
    if (role.is_system) return
    selectRole(role)
    setPendingDeleteId(role.id)
  }

  const filteredRoles = searchQuery.trim()
    ? roles.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : roles

  const permDenied = !loading && (forbidden || user?.permissions?.roles?.view === false)

  if (permDenied) {
    return (
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-6">
          <h1 className="font-display text-display-md text-ink tracking-tight">Roles</h1>
          <p className="mt-1 text-sm text-muted font-body">Define what each role can do.</p>
        </div>
        <div className="bg-surface border border-border rounded-xl">
          <LockedState />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-display-md text-ink tracking-tight">Roles</h1>
          <p className="mt-1 text-sm text-muted font-body">Define what each role can do.</p>
        </div>
        <button
          onClick={() => { setShowNew((v) => !v); setError('') }}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold font-body bg-ink text-surface hover:bg-ink/90 active:scale-[0.98] transition-all"
        >
          <Plus size={13} strokeWidth={2} />
          New role
        </button>
      </div>

      {/* Count + search bar */}
      <div className="flex items-center gap-3 mb-5">
        <span className="font-display text-sm font-semibold text-ink shrink-0">
          {searchQuery.trim()
            ? `${filteredRoles.length} of ${roles.length} roles`
            : `All roles (${roles.length})`}
        </span>
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roles..."
            className="w-full px-3 py-2 text-sm font-body bg-surface border border-border rounded-xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition-all"
            style={{ paddingRight: searchQuery ? '2rem' : undefined }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none text-muted hover:text-ink transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* New role form */}
      {showNew && (
        <div className="mb-5 bg-surface border border-border rounded-xl p-4">
          <h2 className="font-display text-sm font-semibold text-ink mb-3">Create role</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              autoFocus
              placeholder="Role name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-sm font-body bg-paper border border-border rounded-xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition-all"
            />
            <input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm font-body bg-paper border border-border rounded-xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition-all"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-4 py-2 text-sm font-semibold font-body bg-ink text-surface rounded-xl hover:bg-ink/90 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating…' : 'Create role'}
              </button>
              <button
                type="button"
                onClick={() => { setShowNew(false); setNewName(''); setNewDesc('') }}
                className="px-3 py-2 text-sm font-body text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && !showEditModal && (
        <div className="mb-4 text-xs text-red-600 font-body bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
          {error}
        </div>
      )}

      {/* Skeleton loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 rounded-xl animate-pulse" style={{ background: theme === 'light' ? '#F0EEFB' : '#252525', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)' }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredRoles.length === 0 && (
        <div className="text-center py-20">
          <Shield className="w-12 h-12 mx-auto mb-3 text-[#E84E2A]" strokeWidth={1.25} />
          <p className="text-sm font-semibold font-display text-ink mb-1">
            {searchQuery.trim() ? 'No roles match your search' : 'No roles yet'}
          </p>
          <p className="text-xs text-muted font-body">
            {searchQuery.trim() ? 'Try a different search term.' : 'Create your first custom role above.'}
          </p>
        </div>
      )}

      {/* Card grid */}
      {!loading && filteredRoles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRoles.map((role, i) => {
            const perms = role.permissions || {}
            const isExpanded = expandedId === role.id

            return (
              <motion.div
                key={role.id}
                className="flex flex-col rounded-xl p-4"
                style={{
                  background: theme === 'light' ? '#FFFFFF' : '#252525',
                  border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)',
                  borderLeft: role.is_system ? '3px solid #E84E2A' : (theme === 'light' ? '3px solid #DDD8F0' : '3px solid #444'),
                }}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3) }}
              >
                {/* Header: icon + name + badge */}
                <div className="flex items-center gap-2 mb-1.5">
                  {role.is_system
                    ? <ShieldCheck size={14} strokeWidth={1.75} className="shrink-0 text-[#E84E2A]" />
                    : <Shield      size={14} strokeWidth={1.75} style={{ flexShrink: 0, color: theme === 'light' ? '#7B6FA0' : '#8C8A85' }} />
                  }
                  <span className="text-sm font-semibold font-body capitalize truncate" style={{ color: theme === 'light' ? '#1A1040' : (role.is_system ? '#F5F2EC' : '#C8C5C0') }}>
                    {role.name}
                  </span>
                  {role.is_system ? (
                    <span className="shrink-0 ml-auto text-[10px] font-medium font-mono text-muted border border-border rounded-sm px-1.5 py-0 uppercase tracking-wide">
                      system
                    </span>
                  ) : (
                    <span className="shrink-0 ml-auto text-[10px] font-medium px-1.5 py-0 rounded-sm uppercase tracking-wide" style={{ background: theme === 'light' ? '#F0EEFB' : '#2a2a2a', color: theme === 'light' ? '#7B6FA0' : '#A8A5A0', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid #444' }}>
                      custom
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs font-body mb-3 italic" style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85', fontStyle: role.description ? 'normal' : 'italic' }}>
                  {role.description || 'No description added'}
                </p>

                {/* Permission summary (4 key permissions) */}
                <div className="space-y-1.5 mb-3">
                  {CARD_PERMISSIONS.map(({ category, key, label }) => {
                    const granted = perms[category]?.[key] ?? false
                    return (
                      <div key={`${category}.${key}`} className="flex items-center gap-1.5 text-xs font-body">
                        <span style={{ color: granted ? '#4ade80' : (theme === 'light' ? '#DDD8F0' : '#4a4a4a') }}>{granted ? '✓' : '✗'}</span>
                        <span style={{ color: granted ? (theme === 'light' ? '#1A1040' : '#B0ADA8') : (theme === 'light' ? '#7B6FA0' : '#5a5a5a') }}>{label}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Expanded all-permissions view (system roles) */}
                {isExpanded && (
                  <div className="mb-3 pt-3 space-y-3" style={{ borderTop: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)' }}>
                    {PERMISSION_SCHEMA.map(({ category, label: catLabel, actions }) => (
                      <div key={category}>
                        <p className="text-[10px] font-mono uppercase tracking-[0.07em] mb-1.5" style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85' }}>
                          {catLabel}
                        </p>
                        <div className="space-y-1.5">
                          {actions.map(({ key, label: aLabel }) => {
                            const granted = perms[category]?.[key] ?? false
                            return (
                              <div key={key} className="flex items-center gap-1.5 text-xs font-body">
                                <span style={{ color: granted ? '#4ade80' : (theme === 'light' ? '#DDD8F0' : '#4a4a4a') }}>{granted ? '✓' : '✗'}</span>
                                <span style={{ color: granted ? (theme === 'light' ? '#1A1040' : '#B0ADA8') : (theme === 'light' ? '#7B6FA0' : '#5a5a5a') }}>{aLabel}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-auto pt-3 flex items-center" style={{ borderTop: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)' }}>
                  {role.is_system ? (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : role.id)}
                      className="inline-flex items-center gap-1 text-xs font-body transition-colors"
                      style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : '#F5F2EC'}
                      onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : '#8C8A85'}
                    >
                      {isExpanded
                        ? <><ChevronUp   size={12} strokeWidth={2} /> Hide permissions</>
                        : <><ChevronDown size={12} strokeWidth={2} /> View permissions</>
                      }
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(role)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium font-body rounded-lg transition-colors"
                        style={{ border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)', color: theme === 'light' ? '#7B6FA0' : '#C8C5C0', background: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.color = theme === 'light' ? '#1A1040' : '#F5F2EC'; e.currentTarget.style.borderColor = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.20)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : '#C8C5C0'; e.currentTarget.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.10)' }}
                      >
                        <Pencil size={11} strokeWidth={1.75} />
                        Edit
                      </button>
                      <button
                        onClick={() => requestDelete(role)}
                        disabled={deleting && selected?.id === role.id}
                        className="p-1.5 rounded-lg text-[#8C8A85] hover:text-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
                        title="Delete role"
                      >
                        <Trash2 size={13} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Edit modal (custom roles) */}
      {showEditModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowEditModal(false) }}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
            style={{ background: theme === 'light' ? '#FFFFFF' : '#1a1714', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)' }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)' }}>
              <h2 className="font-display text-base font-semibold capitalize" style={{ color: theme === 'light' ? '#1A1040' : '#F5F2EC' }}>
                Edit {selected.name}
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = theme === 'light' ? '#1A1040' : '#F5F2EC'}
                onMouseLeave={e => e.currentTarget.style.color = theme === 'light' ? '#7B6FA0' : '#8C8A85'}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1">
              {/* Name + description */}
              <div className="px-5 py-4 space-y-2" style={{ borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)' }}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-1.5 font-display text-base font-semibold text-ink bg-transparent border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition"
                />
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-1.5 text-xs font-body text-muted bg-transparent border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition placeholder:text-muted/60"
                />
              </div>

              {/* Permission toggles */}
              <div>
                {PERMISSION_SCHEMA.map(({ category, label, actions }) => (
                  <div key={category} className="px-5 py-4" style={{ borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.07em] mb-3" style={{ color: theme === 'light' ? '#7B6FA0' : '#8C8A85' }}>
                      {label}
                    </h3>
                    <div className="space-y-3">
                      {actions.map(({ key, label: actionLabel }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm font-body" style={{ color: theme === 'light' ? '#1A1040' : '#C8C5C0' }}>{actionLabel}</span>
                          <Toggle
                            checked={editPerms[category]?.[key] ?? false}
                            onChange={(val) => togglePerm(category, key, val)}
                            disabled={false}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 flex items-center justify-between gap-4" style={{ borderTop: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)' }}>
              <div className="text-xs font-body">
                {error  && <p className="text-red-400">{error}</p>}
                {success && <p className="text-emerald-400">{success}</p>}
              </div>
              <div className="flex gap-2.5 shrink-0">
                <button
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className="px-3 py-1.5 text-xs font-medium font-body text-red-400 border border-red-400/20 rounded-xl hover:bg-red-400/10 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete role'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || deleting}
                  className="px-4 py-1.5 text-xs font-semibold font-body bg-ink text-surface rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  )
}
