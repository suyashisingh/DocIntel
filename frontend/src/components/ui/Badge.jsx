import { cn } from '../../lib/cn'
import { useTheme } from '../../context/ThemeContext'

const sizes = {
  sm: 'px-1.5 py-0.5 text-[10px] rounded-md',
  md: 'px-2 py-0.5 text-xs rounded-md',
  lg: 'px-2.5 py-1 text-xs rounded-lg',
}

export function Badge({ variant = 'default', size = 'md', className, style: propStyle, children, ...props }) {
  const { theme } = useTheme()

  const variants = {
    default:   { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' },
    ink:       { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)' },
    accent:    {
      background: theme === 'light' ? 'rgba(107,78,255,0.12)' : 'rgba(232,78,42,0.12)',
      color:      theme === 'light' ? '#6B4EFF'               : '#E84E2A',
      border:     theme === 'light' ? '1px solid rgba(107,78,255,0.25)' : '1px solid rgba(232,78,42,0.2)',
    },
    success:   { background: 'rgba(34,197,94,0.12)',  color: '#4ade80',  border: '1px solid rgba(74,222,128,0.2)' },
    warning:   { background: 'rgba(234,179,8,0.12)',  color: '#facc15',  border: '1px solid rgba(250,204,21,0.2)' },
    error:     { background: 'rgba(232,78,42,0.12)',  color: '#E84E2A',  border: '1px solid rgba(232,78,42,0.2)' },
    info:      { background: 'rgba(96,165,250,0.12)', color: '#60a5fa',  border: '1px solid rgba(96,165,250,0.2)' },
    purple:    { background: 'rgba(167,139,250,0.12)',color: '#c4b5fd',  border: '1px solid rgba(167,139,250,0.2)' },
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1 font-body font-medium leading-none', sizes[size], className)}
      style={{ ...variants[variant], ...propStyle }}
      {...props}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status, className }) {
  const map = {
    completed:  { variant: 'success',  label: 'Completed' },
    processing: { variant: 'info',     label: 'Processing' },
    queued:     { variant: 'warning',  label: 'Queued' },
    uploaded:   { variant: 'warning',  label: 'Uploaded' },
    failed:     { variant: 'error',    label: 'Failed' },
  }
  const { variant, label } = map[status] ?? { variant: 'default', label: status }
  return <Badge variant={variant} size="md" className={className}>{label}</Badge>
}
