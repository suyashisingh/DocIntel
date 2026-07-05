import { cn } from '../../lib/cn'

export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div
      className={cn('flex items-center gap-0', className)}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            'relative px-4 py-2.5 text-sm font-medium font-body transition-colors whitespace-nowrap',
            'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:transition-all after:duration-150',
            tab.disabled && 'opacity-40 pointer-events-none',
          )}
          style={{
            color: active === tab.key ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
          }}
        >
          <span
            className="after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5"
            style={{ position: 'relative' }}
          >
            {tab.label}
            <span
              style={{
                position: 'absolute', bottom: -11, left: 0, right: 0,
                height: 2, borderRadius: 999,
                background: active === tab.key ? '#E84E2A' : 'transparent',
                transition: 'background 0.15s',
              }}
            />
          </span>
          {tab.count !== undefined && (
            <span
              className="ml-1.5 tabular-nums text-xs"
              style={{ color: active === tab.key ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)' }}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
