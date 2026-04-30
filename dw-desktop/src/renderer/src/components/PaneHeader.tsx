import { useEffect, useRef, useState } from 'react'

interface PaneHeaderProps {
  label: string
  sublabel?: string
  path: string
  onNavigateUp: () => void
  upDisabled?: boolean
  onRefresh: () => void
  onNavigateTo?: (path: string) => void
  mirrorActive?: boolean
  mirrorAccent?: string
  actions?: React.ReactNode
}

function Breadcrumb({
  path,
  onNavigateTo,
  mirrorActive,
  mirrorAccent = 'var(--accent-cool)'
}: {
  path: string
  onNavigateTo: (path: string) => void
  mirrorActive?: boolean
  mirrorAccent?: string
}): React.JSX.Element {
  const isWindows = path.includes('\\') || /^[A-Za-z]:/.test(path)
  const parts = path
    .replace(/[/\\]$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
  const filesIdx = mirrorActive ? parts.findIndex((p) => p.toLowerCase() === 'files') : -1

  function segmentPath(i: number): string {
    const joined = parts.slice(0, i + 1).join('/')
    if (isWindows) {
      // A bare drive letter (C:) needs a trailing separator to be a valid root path.
      if (i === 0 && /^[A-Za-z]:$/.test(joined)) return joined + '/'
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
        const isMirrored = filesIdx !== -1 && i >= filesIdx
        const segColor =
          isLast && isMirrored
            ? `color-mix(in srgb, ${mirrorAccent} 35%, var(--text))`
            : isLast
              ? 'var(--text)'
              : isMirrored
                ? `color-mix(in srgb, ${mirrorAccent} 60%, var(--text-subtle))`
                : 'var(--text-subtle)'
        const sepColor = isMirrored
          ? `color-mix(in srgb, ${mirrorAccent} 50%, transparent)`
          : 'var(--text-subtle)'
        return (
          <span
            key={segmentPath(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: i < parts.length - 1 ? 1 : 0,
              minWidth: 0
            }}
          >
            <span style={{ color: sepColor, flexShrink: 0 }}>/</span>
            <button
              type="button"
              onClick={() => !isLast && onNavigateTo(segmentPath(i))}
              style={{
                background: 'none',
                border: 'none',
                padding: '0 1px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: segColor,
                fontWeight: isMirrored ? 500 : undefined,
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

function PencilIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path
        d="M11.5 2.5L13.5 4.5L5.5 12.5H3.5V10.5L11.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export default function PaneHeader({
  label,
  sublabel,
  path,
  onNavigateUp,
  upDisabled,
  onRefresh,
  onNavigateTo,
  mirrorActive,
  mirrorAccent,
  actions
}: PaneHeaderProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(): void {
    setInputValue(path.replace(/\\/g, '/'))
    setEditing(true)
  }

  function cancelEdit(): void {
    setEditing(false)
  }

  function commitEdit(): void {
    if (onNavigateTo) {
      onNavigateTo(inputValue.trim())
    }
    setEditing(false)
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

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
            display: 'inline-block',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-subtle)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 120,
            verticalAlign: 'baseline'
          }}
          title={label}
        >
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              display: 'inline-block',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-subtle)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 140,
              verticalAlign: 'baseline'
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

      {editing ? (
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitEdit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              cancelEdit()
            }
          }}
          onBlur={cancelEdit}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            background: 'var(--surface-raised)',
            color: 'var(--text)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--r-sm)',
            padding: '1px 6px',
            outline: 'none'
          }}
        />
      ) : onNavigateTo ? (
        <Breadcrumb
          path={path}
          onNavigateTo={onNavigateTo}
          mirrorActive={mirrorActive}
          mirrorAccent={mirrorAccent}
        />
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
        {onNavigateTo && (
          <button
            aria-label="Edit path"
            onClick={startEdit}
            title="Edit path"
            type="button"
            className="icon-btn"
            style={{ opacity: editing ? 0 : 1, pointerEvents: editing ? 'none' : 'auto' }}
          >
            <PencilIcon />
          </button>
        )}
        <button
          aria-label="Navigate up"
          onClick={onNavigateUp}
          title="Up"
          type="button"
          className="icon-btn"
          disabled={upDisabled}
          style={{
            opacity: upDisabled ? 0.3 : undefined,
            cursor: upDisabled ? 'default' : undefined
          }}
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
