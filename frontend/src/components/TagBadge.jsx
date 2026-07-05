import { useTheme } from '../context/ThemeContext'

export default function TagBadge({ tag, size = 'sm', onRemove }) {
  const { theme } = useTheme()
  const hex = tag.color || '#6366f1'

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono uppercase tracking-wider leading-none ${
        size === 'sm'
          ? 'text-[10px] px-1.5 py-0.5 rounded'
          : 'text-xs px-2 py-1 rounded-md'
      }`}
      style={{
        backgroundColor: theme === 'light' ? `${hex}35` : `${hex}26`,
        color: theme === 'light' ? '#1A1040' : hex,
        border: theme === 'light' ? `1px solid ${hex}CC` : `1px solid ${hex}40`,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(tag.id) }}
          className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
          aria-label={`Remove ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
