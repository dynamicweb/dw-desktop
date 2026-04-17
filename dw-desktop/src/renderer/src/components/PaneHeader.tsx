interface PaneHeaderProps {
  label: string
  sublabel?: string
  path: string
  onNavigateUp: () => void
  onRefresh: () => void
  actions?: React.ReactNode
}

export default function PaneHeader({
  label,
  sublabel,
  path,
  onNavigateUp,
  onRefresh,
  actions
}: PaneHeaderProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          flexShrink: 0,
          minWidth: 0
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-subtle)'
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-subtle)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 220
            }}
            title={sublabel}
          >
            {sublabel}
          </span>
        )}
      </span>
      <span
        aria-hidden
        style={{
          width: 1,
          alignSelf: 'stretch',
          background: 'var(--border)',
          flexShrink: 0
        }}
      />
      <span
        title={path}
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {path}
      </span>
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
