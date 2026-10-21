import { useEffect, useRef, useState } from 'react'
import { ArrowUpIcon, PencilIcon, RefreshIcon } from './Icons'

interface PaneHeaderProps {
  path: string
  onNavigateUp: () => void
  upDisabled?: boolean
  onRefresh: () => void
  onNavigateTo?: (path: string) => void
  /** Extra icon buttons, shown before the edit/up/refresh buttons. */
  actions?: React.ReactNode
}

function Breadcrumb({
  path,
  onNavigateTo
}: {
  path: string
  onNavigateTo: (path: string) => void
}): React.JSX.Element {
  const isWindows = path.includes('\\') || /^[A-Za-z]:/.test(path)
  const parts = path
    .replace(/[/\\]$/, '')
    .split(/[\\/]/)
    .filter(Boolean)

  function segmentPath(i: number): string {
    const joined = parts.slice(0, i + 1).join('/')
    if (isWindows) {
      // A bare drive letter (C:) needs a trailing separator to be a valid root path.
      if (i === 0 && /^[A-Za-z]:$/.test(joined)) return joined + '/'
      return joined
    }
    return '/' + joined
  }

  const crumb: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: '0 1px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }

  // Empty path = drives view.
  if (parts.length === 0) {
    return <span style={{ ...crumb, padding: 0, color: 'var(--text)' }}>Drives</span>
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
      {isWindows && (
        <button
          type="button"
          onClick={() => onNavigateTo('')}
          title="Drives"
          style={{ ...crumb, flexShrink: 0 }}
        >
          Drives
        </button>
      )}
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1
        return (
          <span
            key={segmentPath(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: isLast ? 0 : 1,
              minWidth: 0
            }}
          >
            <span
              style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            >
              {isWindows && i === 0 ? ' ' : '/'}
            </span>
            <button
              type="button"
              onClick={() => !isLast && onNavigateTo(segmentPath(i))}
              title={part}
              style={{
                ...crumb,
                color: isLast ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: isLast ? 500 : 400,
                cursor: isLast ? 'default' : 'pointer',
                maxWidth: isLast ? 'none' : 110
              }}
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
  path,
  onNavigateUp,
  upDisabled,
  onRefresh,
  onNavigateTo,
  actions
}: PaneHeaderProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function commitEdit(): void {
    onNavigateTo?.(inputValue.trim())
    setEditing(false)
  }

  return (
    <div
      style={{
        height: 44,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 8px 0 14px',
        borderBottom: '1px solid var(--border)'
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {editing ? (
          <input
            ref={inputRef}
            aria-label="Folder path"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitEdit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setEditing(false)
              }
            }}
            onBlur={() => setEditing(false)}
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              background: 'var(--surface-raised)',
              color: 'var(--text)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              padding: '1px 6px',
              minWidth: 0
            }}
          />
        ) : onNavigateTo ? (
          <Breadcrumb path={path} onNavigateTo={onNavigateTo} />
        ) : (
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{path}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {actions}
        {onNavigateTo && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Edit path"
            title="Edit path"
            onClick={() => {
              setInputValue(path.replace(/\\/g, '/'))
              setEditing(true)
            }}
          >
            <PencilIcon size={15} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Up one folder"
          title="Up one folder"
          onClick={onNavigateUp}
          disabled={upDisabled}
        >
          <ArrowUpIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh"
          title="Refresh"
          onClick={onRefresh}
        >
          <RefreshIcon />
        </button>
      </div>
    </div>
  )
}
