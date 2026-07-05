import { useState } from 'react'
import { ChevronRight, FolderOpen, MoreHorizontal, Plus } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const FOLDER_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#64748b',
]

function ColorPicker({ value, onChange }) {
  const { theme } = useTheme()
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {FOLDER_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{
            width: 16, height: 16, borderRadius: '50%', backgroundColor: c,
            border: value === c
              ? (theme === 'light' ? '2px solid rgba(0,0,0,0.35)' : '2px solid rgba(255,255,255,0.6)')
              : '2px solid transparent',
            cursor: 'pointer', transition: 'transform 0.15s, border-color 0.15s',
            transform: value === c ? 'scale(1.15)' : 'scale(1)',
          }}
          onMouseEnter={e => { if (value !== c) e.currentTarget.style.transform = 'scale(1.1)' }}
          onMouseLeave={e => { if (value !== c) e.currentTarget.style.transform = 'scale(1)' }}
        />
      ))}
    </div>
  )
}

function FolderRow({ folder, children, selectedId, onSelect, canManage, onRename, onDelete }) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')

  const isSelected = selectedId === folder.id
  const hasChildren = children.length > 0

  const mutedColor   = theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)'
  const inactiveText = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.5)'
  const hoverBg      = theme === 'light' ? 'rgba(0,0,0,0.04)'     : 'rgba(255,255,255,0.04)'
  const hoverColor   = theme === 'light' ? '#1A1040'               : 'rgba(255,255,255,0.8)'
  const selectedBg   = theme === 'light' ? '#EDE9F8'               : 'rgba(232,78,42,0.1)'
  const selectedText = theme === 'light' ? '#1A1040'               : '#E84E2A'

  function startRename(e) {
    e.stopPropagation()
    setMenuOpen(false)
    setRenameVal(folder.name)
    setRenaming(true)
  }

  function confirmRename() {
    if (renameVal.trim() && renameVal.trim() !== folder.name) onRename(folder.id, renameVal.trim())
    setRenaming(false)
  }

  return (
    <div>
      <div
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', cursor: 'pointer', userSelect: 'none',
          background: isSelected ? selectedBg : 'transparent',
          color: isSelected ? selectedText : inactiveText,
          fontFamily: "'DM Sans', sans-serif", fontSize: 13,
          fontWeight: isSelected ? 500 : 400,
          transition: 'background 0.15s, color 0.15s',
        }}
        onClick={() => !renaming && onSelect(folder.id)}
        onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = hoverColor } }}
        onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = inactiveText } }}
        className="group"
      >
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            style={{ color: mutedColor, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }}
          >
            <ChevronRight size={12} style={{ transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }} />
          </button>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, backgroundColor: folder.color || '#6366f1' }} />

        {renaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenaming(false) }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, minWidth: 0, padding: '2px 6px', fontSize: 12,
              background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
              border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(232,78,42,0.4)',
              borderRadius: 4,
              color: theme === 'light' ? '#1A1040' : '#FFFFFF',
              outline: 'none', fontFamily: "'DM Sans', sans-serif",
            }}
          />
        ) : (
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
        )}

        {!renaming && folder.document_count > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)', marginLeft: 'auto', flexShrink: 0, paddingRight: 4 }}>{folder.document_count}</span>
        )}

        {canManage && !renaming && (
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            style={{ flexShrink: 0, padding: 2, color: mutedColor, background: 'none', border: 'none', cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s' }}
            className="group-hover:opacity-100"
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          >
            <MoreHorizontal size={12} />
          </button>
        )}

        {menuOpen && (
          <div
            style={{
              position: 'absolute', right: 8, top: 28, zIndex: 50,
              background: theme === 'light' ? '#FFFFFF' : '#1A1816',
              border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              padding: '4px 0', minWidth: 112,
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={startRename}
              style={{ width: '100%', textAlign: 'left', padding: '6px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >Rename</button>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(folder.id) }}
              style={{ width: '100%', textAlign: 'left', padding: '6px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >Delete</button>
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {children.map(child => {
            const childSelected = selectedId === child.id
            return (
              <div
                key={child.id}
                onClick={() => onSelect(child.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px 7px 32px', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  background: childSelected ? selectedBg : 'transparent',
                  color: childSelected ? selectedText : (theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.45)'),
                  fontWeight: childSelected ? 500 : 400,
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (!childSelected) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = hoverColor } }}
                onMouseLeave={e => { if (!childSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.45)' } }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, backgroundColor: child.color || '#6366f1' }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{child.name}</span>
                {child.document_count > 0 && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)' }}>{child.document_count}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function FolderSidebar({ folders, selectedId, onSelect, onCreate, onRename, onDelete, canManage }) {
  const { theme } = useTheme()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0])

  const topLevel  = folders.filter(f => f.parent_id === null)
  const childrenOf = id => folders.filter(f => f.parent_id === id)

  const dividerColor  = theme === 'light' ? '#DDD8F0'               : 'rgba(255,255,255,0.05)'
  const containerBg   = theme === 'light' ? '#E8E4F5'               : 'rgba(255,255,255,0.02)'
  const containerBdr  = theme === 'light' ? '1px solid #DDD8F0'     : '1px solid rgba(255,255,255,0.06)'
  const selectedBg    = theme === 'light' ? '#EDE9F8'               : 'rgba(232,78,42,0.1)'
  const selectedText  = theme === 'light' ? '#1A1040'               : '#E84E2A'
  const inactiveText  = theme === 'light' ? '#1A1040'               : 'rgba(255,255,255,0.45)'
  const hoverBg       = theme === 'light' ? 'rgba(0,0,0,0.04)'     : 'rgba(255,255,255,0.04)'
  const hoverColor    = theme === 'light' ? '#1A1040'               : 'rgba(255,255,255,0.75)'

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    onCreate({ name: newName.trim(), color: newColor })
    setNewName(''); setNewColor(FOLDER_COLORS[0]); setShowNew(false)
  }

  return (
    <div style={{ width: 192, flexShrink: 0 }}>
      <div style={{ background: containerBg, border: containerBdr, borderRadius: 14, overflow: 'visible' }}>
        <div style={{ padding: '12px', borderBottom: `1px solid ${dividerColor}` }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 500, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Folders</span>
        </div>

        <button
          onClick={() => onSelect(null)}
          style={{
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
            background: selectedId === null ? selectedBg : 'transparent',
            color: selectedId === null ? selectedText : inactiveText,
            fontWeight: selectedId === null ? 500 : 400,
            border: 'none', borderBottom: `1px solid ${dividerColor}`,
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { if (selectedId !== null) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = hoverColor } }}
          onMouseLeave={e => { if (selectedId !== null) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = inactiveText } }}
        >
          <FolderOpen size={13} style={{ flexShrink: 0, color: selectedId === null ? (theme === 'light' ? '#6B4EFF' : '#E84E2A') : 'inherit' }} />
          <span>All documents</span>
        </button>

        <div style={{ padding: '4px 0', overflow: 'visible' }}>
          {topLevel.length === 0 && (
            <p style={{ padding: '12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.25)', textAlign: 'center' }}>No folders yet</p>
          )}
          {topLevel.map(folder => (
            <FolderRow
              key={folder.id}
              folder={folder}
              children={childrenOf(folder.id)}
              selectedId={selectedId}
              onSelect={onSelect}
              canManage={canManage}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>

        {canManage && (
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${dividerColor}` }}>
            {showNew ? (
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Folder name"
                  style={{
                    width: '100%', padding: '6px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                    border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    color: theme === 'light' ? '#1A1040' : '#FFFFFF',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = theme === 'light' ? 'rgba(107,78,255,0.5)' : 'rgba(232,78,42,0.4)' }}
                  onBlur={e => { e.target.style.borderColor = theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.1)' }}
                />
                <ColorPicker value={newColor} onChange={setNewColor} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="submit" style={{ flex: 1, padding: '5px 0', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, background: theme === 'light' ? '#6B4EFF' : '#E84E2A', border: 'none', borderRadius: 6, color: '#FFFFFF', cursor: 'pointer' }}>Create</button>
                  <button type="button" onClick={() => { setShowNew(false); setNewName('') }} style={{ padding: '5px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, background: 'none', border: 'none', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowNew(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 10px', marginTop: '6px', marginLeft: '8px',
                  borderRadius: '6px',
                  border: theme === 'light' ? '1px dashed rgba(107,78,255,0.3)' : '1px dashed rgba(255,255,255,0.15)',
                  color: theme === 'light' ? '#6B4EFF' : 'rgba(255,255,255,0.40)',
                  fontSize: '12px', fontFamily: "'DM Sans', sans-serif",
                  cursor: 'pointer', background: 'transparent', transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.border = theme === 'light' ? '1px dashed rgba(107,78,255,0.6)' : '1px dashed rgba(232,78,42,0.4)'
                  e.currentTarget.style.color  = theme === 'light' ? '#5538EE' : 'rgba(255,255,255,0.70)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.border = theme === 'light' ? '1px dashed rgba(107,78,255,0.3)' : '1px dashed rgba(255,255,255,0.15)'
                  e.currentTarget.style.color  = theme === 'light' ? '#6B4EFF' : 'rgba(255,255,255,0.40)'
                }}
              >
                <Plus size={12} />
                New folder
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
