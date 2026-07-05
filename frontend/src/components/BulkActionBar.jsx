import { useEffect, useRef, useState } from 'react'
import { Download, Folder, RefreshCw, Trash2, X } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function BulkActionBar({
  selectedIds,
  onDelete,
  onReprocess,
  onExportCSV,
  onExportJSON,
  onClear,
  userRole,
  folders = [],
  onBulkAddToFolder,
  canManageFolders,
}) {
  const count = selectedIds.length
  const isAdmin = userRole === 'admin'
  const canReprocess = userRole === 'admin' || userRole === 'analyst'
  const { theme } = useTheme()

  const [folderMenuOpen, setFolderMenuOpen] = useState(false)
  const folderMenuRef = useRef(null)

  useEffect(() => {
    if (!folderMenuOpen) return
    function handle(e) {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setFolderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [folderMenuOpen])

  // Close folder menu when bar hides
  useEffect(() => {
    if (count === 0) setFolderMenuOpen(false)
  }, [count])

  return (
    <div
      className={`fixed bottom-0 left-56 right-0 z-50 transition-transform duration-200 ${
        count > 0 ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-surface border-t border-border px-6 py-4 flex items-center gap-3 flex-wrap shadow-overlay">
        <span className="text-ink font-body text-sm font-medium min-w-max">
          {count} document{count !== 1 ? 's' : ''} selected
        </span>

        <div className="w-px h-4 bg-border mx-1" />

        {canReprocess && (
          <button
            onClick={onReprocess}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body rounded-lg border border-border text-ink hover:bg-paper transition-colors"
          >
            <RefreshCw size={12} strokeWidth={2} />
            Reprocess
          </button>
        )}

        {canManageFolders && folders.length > 0 && (
          <div ref={folderMenuRef} className="relative">
            <button
              onClick={() => setFolderMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body rounded-lg border border-border text-ink hover:bg-paper transition-colors"
            >
              <Folder size={12} strokeWidth={2} />
              Move to Folder
            </button>
            {folderMenuOpen && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 50, background: theme === 'light' ? '#FFFFFF' : '#1A1816', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '6px 0', minWidth: 192, maxHeight: 224, overflowY: 'auto' }}>
                <p style={{ padding: '0 12px 6px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
                  Add all to folder
                </p>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => { onBulkAddToFolder(folder.id); setFolderMenuOpen(false) }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.7)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(107,78,255,0.06)' : 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, backgroundColor: folder.color || '#9ca3af' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onExportCSV}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body rounded-lg border border-border text-ink hover:bg-paper transition-colors"
        >
          <Download size={12} strokeWidth={2} />
          Export CSV
        </button>

        <button
          onClick={onExportJSON}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body rounded-lg border border-border text-ink hover:bg-paper transition-colors"
        >
          <Download size={12} strokeWidth={2} />
          Export JSON
        </button>

        {isAdmin && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={12} strokeWidth={2} />
            Delete
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={onClear}
          className="p-1.5 text-muted hover:text-ink transition-colors rounded"
          aria-label="Clear selection"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
