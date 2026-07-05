import { cn } from '../../lib/cn'

export function PageHeader({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-8', className)}>
      <div>
        <h1 className="font-display tracking-tight" style={{ fontSize: 28, fontWeight: 700, color: '#FFFFFF' }}>{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm font-body" style={{ color: 'rgba(255,255,255,0.45)' }}>{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 mt-1">{action}</div>}
    </div>
  )
}

export function SectionHeader({ title, action, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 mb-4', className)}>
      <h2 className="font-display tracking-tight" style={{ fontSize: 18, fontWeight: 600, color: '#FFFFFF' }}>{title}</h2>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
