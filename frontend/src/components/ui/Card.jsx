import { cn } from '../../lib/cn'

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn('rounded-xl', className)}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn('px-5 py-4 flex items-center justify-between gap-4', className)}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h2
      className={cn('font-display text-sm font-semibold', className)}
      style={{ color: '#FFFFFF' }}
      {...props}
    >
      {children}
    </h2>
  )
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn('px-5 py-3.5 flex items-center gap-3', className)}
      style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      {...props}
    >
      {children}
    </div>
  )
}
