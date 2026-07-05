import { cn } from '../../lib/cn'

const sizes = {
  xs: 'px-2.5 py-1 text-xs rounded-md gap-1.5',
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  xl: 'px-6 py-3 text-base rounded-xl gap-2.5',
}

const variantStyles = {
  primary: {
    className: 'active:scale-[0.98]',
    style: { background: '#E84E2A', color: '#FFFFFF', border: '1px solid #E84E2A' },
    hover: { filter: 'brightness(1.1)', boxShadow: '0 4px 20px rgba(232,78,42,0.35)' },
  },
  secondary: {
    className: 'active:scale-[0.98]',
    style: { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' },
    hover: { background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.18)' },
  },
  ghost: {
    className: 'active:scale-[0.98]',
    style: { background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '1px solid transparent' },
    hover: { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)' },
  },
  danger: {
    className: 'active:scale-[0.98]',
    style: { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' },
    hover: { background: 'rgba(239,68,68,0.18)' },
  },
  'danger-solid': {
    className: 'active:scale-[0.98]',
    style: { background: '#dc2626', color: '#FFFFFF', border: '1px solid #dc2626' },
    hover: { background: '#b91c1c' },
  },
}

export function Button({ variant = 'secondary', size = 'md', className, children, style: propStyle, ...props }) {
  const v = variantStyles[variant] || variantStyles.secondary

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-body font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        'whitespace-nowrap select-none',
        sizes[size],
        v.className,
        className,
      )}
      style={{ ...v.style, ...propStyle }}
      onMouseEnter={e => { if (!props.disabled) Object.assign(e.currentTarget.style, v.hover) }}
      onMouseLeave={e => { if (!props.disabled) Object.assign(e.currentTarget.style, v.style) }}
      {...props}
    >
      {children}
    </button>
  )
}
