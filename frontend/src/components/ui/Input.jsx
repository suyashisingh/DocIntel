import { cn } from '../../lib/cn'

export function Input({ className, label, error, hint, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium font-body" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full px-3.5 py-2.5 rounded-lg text-sm font-body',
          'focus:outline-none transition-all duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'ring-1 ring-red-500/50',
          className,
        )}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
          color: '#FFFFFF',
        }}
        onFocus={e => {
          if (!error) {
            e.target.style.borderColor = 'rgba(232,78,42,0.6)'
            e.target.style.boxShadow = '0 0 0 3px rgba(232,78,42,0.12)'
            e.target.style.background = 'rgba(255,255,255,0.08)'
          }
        }}
        onBlur={e => {
          if (!error) {
            e.target.style.borderColor = 'rgba(255,255,255,0.1)'
            e.target.style.boxShadow = 'none'
            e.target.style.background = 'rgba(255,255,255,0.06)'
          }
        }}
        {...props}
      />
      {hint && !error && (
        <p className="text-xs font-body" style={{ color: 'rgba(255,255,255,0.35)' }}>{hint}</p>
      )}
      {error && (
        <p className="text-xs font-body" style={{ color: '#f87171' }}>{error}</p>
      )}
    </div>
  )
}

export function Select({ className, label, error, children, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium font-body" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {label}
        </label>
      )}
      <select
        className={cn(
          'px-3.5 py-2.5 rounded-lg text-sm font-body',
          'focus:outline-none transition-all duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
          color: '#FFFFFF',
        }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs font-body" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}
