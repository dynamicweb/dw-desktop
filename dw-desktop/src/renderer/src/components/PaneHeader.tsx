interface PaneHeaderProps {
  label: string
  breadcrumbs: string[]
  onNavigateUp: () => void
  onRefresh: () => void
  actions?: React.ReactNode
}

export default function PaneHeader({
  label,
  breadcrumbs,
  onNavigateUp,
  onRefresh,
  actions
}: PaneHeaderProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-subtle)',
          flexShrink: 0
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {breadcrumbs.map((segment, index) => {
          const isLast = index === breadcrumbs.length - 1
          return (
            <span key={index} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {index > 0 && (
                <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>/</span>
              )}
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: isLast ? 'var(--text)' : 'var(--text-muted)',
                  cursor: isLast ? 'default' : 'pointer'
                }}
              >
                {segment || '/'}
              </span>
            </span>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {actions}
        <button
          aria-label="Navigate up"
          onClick={onNavigateUp}
          title="Up"
          type="button"
          style={{
            background: 'none',
            border: 'none',
            padding: '0 4px',
            fontSize: 12,
            color: 'var(--text-subtle)',
            cursor: 'pointer',
            transition: 'color 80ms ease-out'
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = 'var(--text-muted)')}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--text-subtle)')}
        >
          ↑
        </button>
        <button
          aria-label="Refresh"
          onClick={onRefresh}
          title="Refresh"
          type="button"
          style={{
            background: 'none',
            border: 'none',
            padding: '0 4px',
            fontSize: 12,
            color: 'var(--text-subtle)',
            cursor: 'pointer',
            transition: 'color 80ms ease-out'
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = 'var(--text-muted)')}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--text-subtle)')}
        >
          ↻
        </button>
      </div>
    </div>
  )
}
