interface PaneHeaderProps {
  label: string
  sublabel?: string
  path: string
  onNavigateUp: () => void
  onRefresh: () => void
  onNavigateTo?: (path: string) => void
  actions?: React.ReactNode
}

function Breadcrumb({ path, onNavigateTo }: { path: string; onNavigateTo: (path: string) => void }): React.JSX.Element {
  const isWindows = path.includes('\\') || /^[A-Za-z]:/.test(path)
  const sep = isWindows ? '\\' : '/'
  const parts = path.replace(/[/\\]$/, '').split(/[\\/]/).filter(Boolean)

  function segmentPath(i: number): string {
    const joined = parts.slice(0, i + 1).join(sep)
    if (isWindows) {
      // A bare drive letter (C:) needs a trailing separator to be a valid root path.
      if (i === 0 && /^[A-Za-z]:$/.test(joined)) return joined + sep
      return joined
    }
    return '/' + joined
  }

  // Empty path = drives view. Show a static "Drives" label.
  if (parts.length === 0) {
    return (
      <span
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text)',
          flex: 1,
          minWidth: 0
        }}
      >
        Drives
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap'
      }}
    >
      {/* On Windows, a leading "Drives" crumb returns to the drive list. */}
      {isWindows && (
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onNavigateTo('')}
            title="Drives"
            style={{
              background: 'none',
              border: 'none',
              padding: '0 1px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-subtle)',
              cursor: 'pointer'
            }}
          >
            Drives
          </button>
        </span>
      )}
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1
        return (
          <span key={segmentPath(i)} style={{ display: 'flex', alignItems: 'center', flexShrink: i < parts.length - 1 ? 1 : 0, minWidth: 0 }}>
            <span style={{ color: 'var(--text-subtle)', flexShrink: 0 }}>{sep}</span>
            <button
              type="button"
              onClick={() => !isLast && onNavigateTo(segmentPath(i))}
              style={{
                background: 'none',
                border: 'none',
                padding: '0 1px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: isLast ? 'var(--text)' : 'var(--text-subtle)',
                cursor: isLast ? 'default' : 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: isLast ? 'none' : 80
              }}
              title={part}
            >
              {part}
            </button>
          </span>
        )
      })}
    </span>
  )
}

export default function PaneHeader({
  label,
  sublabel,
  path,
  onNavigateUp,
  onRefresh,
  onNavigateTo,
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
      {onNavigateTo ? (
        <Breadcrumb path={path} onNavigateTo={onNavigateTo} />
      ) : (
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
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {actions}
        <button
          aria-label="Navigate up"
          onClick={onNavigateUp}
          title="Up"
          type="button"
          className="icon-btn"
        >
          ↑
        </button>
        <button
          aria-label="Refresh"
          onClick={onRefresh}
          title="Refresh"
          type="button"
          className="icon-btn"
        >
          ↻
        </button>
      </div>
    </div>
  )
}
