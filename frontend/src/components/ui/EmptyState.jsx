import { cn } from '../../lib/cn'

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 px-6 text-center', className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Icon size={20} strokeWidth={1.5} style={{ color: 'rgba(255,255,255,0.25)' }} />
        </div>
      )}
      <p className="font-display text-sm font-semibold mb-1" style={{ color: '#FFFFFF' }}>{title}</p>
      {description && (
        <p className="text-xs font-body max-w-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
