import { Lock } from 'lucide-react'

export function LockedState({ title = "You don't have permission to access this section", subtitle = 'Contact your organization admin to request access' }) {
  return (
    <div className="px-5 py-20 text-center">
      <div className="w-10 h-10 rounded-xl bg-paper border border-border flex items-center justify-center mx-auto mb-3">
        <Lock size={16} strokeWidth={1.5} className="text-muted" />
      </div>
      <p className="text-sm font-semibold text-ink font-display mb-1">{title}</p>
      <p className="text-xs text-muted font-body">{subtitle}</p>
    </div>
  )
}
