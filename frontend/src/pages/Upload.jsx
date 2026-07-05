import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X, FileText, Image, Archive, CheckCircle2, XCircle, Upload as UploadIcon, Zap, Search, MessageSquare, ArrowRight } from 'lucide-react'
import { uploadDocument, listDocuments } from '../api/documents'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useDocumentStatus } from '../hooks/useDocumentStatus'
import GradientOrbs from '../components/effects/GradientOrbs'
import { cn } from '../lib/cn'

const ACCEPT = { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg', '.tiff', '.webp'], 'application/zip': ['.zip'] }
const MAX_SIZE = 50 * 1024 * 1024

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeIcon(file) {
  if (file.type === 'application/pdf') return FileText
  if (file.type.startsWith('image/')) return Image
  return Archive
}

function ProcessingTracker({ documentId, filename }) {
  const { status, progress, message } = useDocumentStatus(documentId, null)
  const { theme } = useTheme()

  if (status === 'completed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12 }}>
        <CheckCircle2 size={18} style={{ color: '#4ade80', flexShrink: 0 }} strokeWidth={1.75} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: '#4ade80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
            {filename || `Document #${documentId}`}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(74,222,128,0.7)', marginTop: 2 }}>Processing complete</p>
        </div>
        <Link to={`/documents/${documentId}`} style={{ flexShrink: 0, fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: '#4ade80', textDecoration: 'none', padding: '4px 10px', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8 }}>
          View →
        </Link>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', background: 'rgba(232,78,42,0.1)', border: '1px solid rgba(232,78,42,0.2)', borderRadius: 12 }}>
        <XCircle size={18} style={{ color: '#E84E2A', flexShrink: 0 }} strokeWidth={1.75} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: '#E84E2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
            {filename || `Document #${documentId}`}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(232,78,42,0.7)', marginTop: 2 }}>Processing failed</p>
        </div>
        <Link to={`/documents/${documentId}`} style={{ flexShrink: 0, fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", color: '#E84E2A', textDecoration: 'none' }}>
          Details →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 16px', background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.04)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 16, margin: 0 }}>
          {filename || `Document #${documentId}`}
        </p>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
          {progress > 0 ? `${progress}%` : '—'}
        </span>
      </div>
      <div style={{ height: 2, background: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ height: '100%', background: '#E84E2A', borderRadius: 999, width: `${progress > 0 ? progress : 100}%`, opacity: progress > 0 ? 1 : 0.3, transition: 'width 0.3s' }} />
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)' }}>{message || 'Processing…'}</p>
    </div>
  )
}

export default function Upload() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const orgId = user?.org_id
  const role = user?.role

  const navigate = useNavigate()

  const [files, setFiles] = useState([])
  const [rejected, setRejected] = useState('')
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')

  const [recentDocs, setRecentDocs] = useState([])
  const [recentLoading, setRecentLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    listDocuments(orgId, { sort_by: 'upload_time', sort_order: 'desc', limit: 5 })
      .then(({ data }) => setRecentDocs(Array.isArray(data) ? data : (data?.documents ?? [])))
      .catch(() => {})
      .finally(() => setRecentLoading(false))
  }, [orgId])

  const onDrop = useCallback((accepted, rejections) => {
    setResults([])
    setError('')
    setProgress(0)
    if (rejections.length) {
      setRejected(rejections[0].errors[0]?.message ?? 'File not accepted')
      setFiles([])
    } else {
      setRejected('')
      setFiles(accepted)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_SIZE,
    multiple: true,
  })

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (!files.length || !orgId) return
    setUploading(true)
    setError('')
    setProgress(0)
    try {
      const { data } = await uploadDocument(orgId, files, setProgress)
      const docs = Array.isArray(data) ? data : [data]
      setResults(docs)
      setFiles([])
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  if (role === 'viewer') {
    return (
      <div className="max-w-xl relative">
        <GradientOrbs className="z-0" />
        <div className="relative z-10 mb-8">
          <h1 className="font-display text-display-md text-ink tracking-tight">Upload documents</h1>
          <p className="mt-1 text-sm text-muted font-body">PDF or image files up to 50 MB</p>
        </div>
        <div className="relative z-10 bg-surface border border-border rounded-2xl px-8 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-paper border border-border flex items-center justify-center mx-auto mb-4">
            <UploadIcon size={18} strokeWidth={1.5} className="text-muted" />
          </div>
          <p className="text-sm font-semibold text-ink font-display mb-1">Upload not available</p>
          <p className="text-xs text-muted font-body">Viewer accounts cannot upload documents. Contact your admin to change your role.</p>
        </div>
      </div>
    )
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const rootProps = getRootProps()

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', padding: '40px 48px', background: 'transparent' }}>
      <GradientOrbs className="z-0" />

      <div className="relative z-10 mb-8">
        <h1 className="font-display text-display-md text-ink tracking-tight">Upload documents</h1>
        <p className="mt-1 text-sm text-muted font-body">PDF, image, or ZIP files — up to 50 MB each</p>
      </div>

      {/* Dropzone */}
      <motion.div
        {...rootProps}
        style={{
          width: '100%',
          maxWidth: '680px',
          minHeight: '280px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '20px',
          border: isDragActive ? (theme === 'light' ? '2px dashed #6B4EFF' : '2px dashed #E84E2A') : (theme === 'light' ? '2px dashed #DDD8F0' : '2px dashed rgba(255,255,255,0.20)'),
          background: isDragActive ? (theme === 'light' ? 'rgba(107,78,255,0.06)' : 'rgba(232,78,42,0.06)') : (theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.02)'),
          padding: '60px 40px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        whileHover={{ scale: isDragActive ? 1 : 1.01 }}
        transition={{ duration: 0.15 }}
        onDragOver={e => { rootProps.onDragOver?.(e); e.currentTarget.style.border = theme === 'light' ? '2px dashed #6B4EFF' : '2px dashed #E84E2A'; e.currentTarget.style.background = theme === 'light' ? 'rgba(107,78,255,0.06)' : 'rgba(232,78,42,0.06)' }}
        onDragLeave={e => { rootProps.onDragLeave?.(e); e.currentTarget.style.border = theme === 'light' ? '2px dashed #DDD8F0' : '2px dashed rgba(255,255,255,0.20)'; e.currentTarget.style.background = theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.02)' }}
        onMouseEnter={e => { e.currentTarget.style.border = theme === 'light' ? '2px dashed #6B4EFF' : '2px dashed rgba(232,78,42,0.60)'; e.currentTarget.style.background = theme === 'light' ? 'rgba(107,78,255,0.04)' : 'rgba(232,78,42,0.04)' }}
        onMouseLeave={e => { e.currentTarget.style.border = theme === 'light' ? '2px dashed #DDD8F0' : '2px dashed rgba(255,255,255,0.20)'; e.currentTarget.style.background = theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.02)' }}
      >
        <input {...getInputProps()} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: isDragActive ? (theme === 'light' ? 'rgba(107,78,255,0.25)' : 'rgba(232,78,42,0.25)') : (theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.15)'),
              border: isDragActive ? (theme === 'light' ? '1px solid rgba(107,78,255,0.50)' : '1px solid rgba(232,78,42,0.50)') : (theme === 'light' ? '1px solid rgba(107,78,255,0.30)' : '1px solid rgba(232,78,42,0.30)'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
            }}
            animate={isDragActive ? { scale: [1, 1.08, 1], transition: { duration: 0.4, repeat: Infinity } } : { scale: 1 }}
          >
            <UploadIcon size={28} strokeWidth={1.5} style={{ color: theme === 'light' ? '#6B4EFF' : '#E84E2A' }} />
          </motion.div>
          {files.length > 0 ? (
            <div style={{ textAlign: 'center' }}>
              <p className="text-sm font-semibold text-ink font-body">
                {files.length === 1 ? files[0].name : `${files.length} files selected`}
              </p>
              <p className="text-xs text-muted font-body mt-0.5">{formatBytes(totalSize)} total</p>
            </div>
          ) : isDragActive ? (
            <p className="text-sm font-semibold text-accent font-body">Drop to upload</p>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p className="text-sm font-body text-ink">
                <span className="font-semibold">Drag files here</span>
                {' '}or{' '}
                <span className="text-accent font-semibold">browse</span>
              </p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px' }}>
                {['PDF', 'PNG', 'JPG', 'TIFF', 'WEBP', 'ZIP'].map(fmt => (
                  <span key={fmt} style={{ padding: '3px 10px', background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.10)', borderRadius: '100px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.50)' }}>{fmt}</span>
                ))}
              </div>
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)' }}>Max 50 MB per file</span>
                <span style={{ color: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.15)', fontSize: '11px' }}>·</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)' }}>Up to 50 files at once</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {files.length === 0 && results.length === 0 && (
        <>
          <div style={{ maxWidth: '680px', margin: '32px auto 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>What happens after upload</span>
            <div style={{ flex: 1, height: '1px', background: theme === 'light' ? '#DDD8F0' : 'rgba(255,255,255,0.07)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', maxWidth: '680px', margin: '0 auto' }}>
            {[
              { Icon: Zap,           title: 'AI Extraction',   desc: 'Text, tables, and entities extracted automatically' },
              { Icon: Search,        title: 'Semantic Search',  desc: 'Your document becomes instantly searchable' },
              { Icon: MessageSquare, title: 'AI Chat Ready',    desc: 'Ask questions and get cited answers immediately' },
            ].map(({ Icon, title, desc }) => (
              <div key={title} style={{ background: theme === 'light' ? '#2D1B69' : '#2C2926', border: theme === 'light' ? '1px solid rgba(107,78,255,0.3)' : '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.30)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(107,78,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <Icon size={18} color={theme === 'light' ? '#A78BFA' : '#E84E2A'} />
                </div>
                <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '14px', color: 'white', margin: 0 }}>{title}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: 'rgba(255,255,255,0.55)', margin: '6px 0 0' }}>{desc}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {files.length === 0 && results.length === 0 && (
        <div style={{ maxWidth: '680px', margin: '40px auto 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '14px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.70)', margin: 0 }}>
              Recently uploaded
            </h3>
            <span
              onClick={() => navigate('/dashboard')}
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(232,78,42,0.80)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#E84E2A'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,78,42,0.80)'}
            >
              View all
              <ArrowRight size={13} />
            </span>
          </div>
          {recentLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} style={{ height: '48px', background: theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '8px' }} />
            ))
          ) : recentDocs.length === 0 ? (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)', textAlign: 'center', padding: '20px 0' }}>
              No documents uploaded yet
            </p>
          ) : (
            recentDocs.slice(0, 5).map(doc => (
              <div
                key={doc.id}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: theme === 'light' ? '#FFFFFF' : '#2A2522', border: theme === 'light' ? '1px solid #DDD8F0' : '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? '#F0EEFB' : 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = theme === 'light' ? '#FFFFFF' : '#2A2522'}
                onClick={() => navigate(`/documents/${doc.id}`)}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.12)', border: theme === 'light' ? '1px solid rgba(107,78,255,0.20)' : '1px solid rgba(232,78,42,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={14} color={theme === 'light' ? '#6B4EFF' : '#E84E2A'} />
                </div>
                <span style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: theme === 'light' ? '#1A1040' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.original_filename || doc.filename || 'Unnamed'}
                </span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', padding: '3px 10px', borderRadius: '100px', background: doc.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)', color: doc.status === 'completed' ? '#4ade80' : '#facc15', border: doc.status === 'completed' ? '1px solid rgba(74,222,128,0.20)' : '1px solid rgba(250,204,21,0.20)', textTransform: 'capitalize', flexShrink: 0 }}>
                  {doc.status || 'Processing'}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: theme === 'light' ? '#7B6FA0' : 'rgba(255,255,255,0.30)', flexShrink: 0 }}>
                  {doc.upload_time ? new Date(doc.upload_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {rejected && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-accent font-body">
          <XCircle size={13} strokeWidth={2} />
          {rejected}
        </p>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((f, i) => {
            const FileIcon = fileTypeIcon(f)
            return (
              <div
                key={i}
                className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 hover:border-ink/10 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-paper border border-border flex items-center justify-center shrink-0">
                  <FileIcon size={14} strokeWidth={1.75} className="text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body text-ink font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted font-body">{formatBytes(f.size)}</p>
                </div>
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="shrink-0 w-6 h-6 rounded-md text-muted hover:text-ink hover:bg-paper flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Remove file"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && !uploading && results.length === 0 && (
        <button
          onClick={handleUpload}
          className="mt-5 w-full bg-ink text-surface font-body font-semibold text-sm py-3 rounded-xl hover:bg-ink/90 active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          Upload {files.length === 1 ? '1 file' : `${files.length} files`}
        </button>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-xs font-body text-muted">
            <span>Uploading {files.length === 1 ? '1 file' : `${files.length} files`}…</span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
          <div className="h-0.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-2 text-sm text-accent font-body bg-accent/5 border border-accent/20 rounded-xl px-4 py-3">
          <XCircle size={15} strokeWidth={2} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Processing trackers */}
      {results.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-body text-muted">Processing {results.length} document{results.length !== 1 ? 's' : ''}…</p>
          {results.map((doc) => (
            <ProcessingTracker key={doc.id} documentId={doc.id} filename={doc.original_filename} />
          ))}
        </div>
      )}
    </div>
  )
}
