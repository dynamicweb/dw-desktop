import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileEntry } from '../../../shared/types'

function revealLabel(): string {
  switch (window.dw.platform) {
    case 'darwin': return 'Reveal in Finder'
    case 'win32': return 'Reveal in Explorer'
    default: return 'Show in file manager'
  }
}

function Icon({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

const ICONS = {
  upload: <><path d="M8 10.5V2.5" /><path d="M4.5 6L8 2.5L11.5 6" /><path d="M3 12.5V13.5H13V12.5" /></>,
  download: <><path d="M8 2.5V10.5" /><path d="M4.5 7L8 10.5L11.5 7" /><path d="M3 12.5V13.5H13V12.5" /></>,
  reveal: <><path d="M1.5 4.5V12C1.5 12.55 1.95 13 2.5 13H13.5C14.05 13 14.5 12.55 14.5 12V5.5C14.5 4.95 14.05 4.5 13.5 4.5H7.5L6 3H2.5C1.95 3 1.5 3.45 1.5 4V4.5Z" /></>,
  copy: <><rect x="5" y="5" width="8.5" height="8.5" rx="1" /><path d="M10.5 5V3.5C10.5 2.95 10.05 2.5 9.5 2.5H3.5C2.95 2.5 2.5 2.95 2.5 3.5V9.5C2.5 10.05 2.95 10.5 3.5 10.5H5" /></>,
  move: <><path d="M2.5 8H13.5" /><path d="M10 4.5L13.5 8L10 11.5" /></>,
  clipboard: <><rect x="4" y="3" width="8" height="11" rx="1" /><path d="M6 3V2.5C6 2.22 6.22 2 6.5 2H9.5C9.78 2 10 2.22 10 2.5V3" /></>,
  rename: <><path d="M10.5 2.5L13.5 5.5L5.5 13.5H2.5V10.5L10.5 2.5Z" /></>,
  trash: <><path d="M2.5 4.5H13.5" /><path d="M6 4.5V3C6 2.72 6.22 2.5 6.5 2.5H9.5C9.78 2.5 10 2.72 10 3V4.5" /><path d="M3.5 4.5L4.2 13.1C4.24 13.58 4.64 13.95 5.12 13.95H10.88C11.36 13.95 11.76 13.58 11.8 13.1L12.5 4.5" /></>
}

interface ContextMenuProps {
  entry: FileEntry
  /** Number of items the menu will act on (1 for single right-click, >1 when the right-clicked entry is part of a multi-selection). */
  targetCount?: number
  x: number
  y: number
  pane: 'local' | 'remote'
  hasActiveEnv: boolean
  onClose: () => void
  onUpload?: () => void
  onDownload?: () => void
  onDelete?: () => void
  onRename?: (newName: string) => void
  onReveal?: () => void
  onCopyPath?: () => void
}

export default function ContextMenu({
  entry,
  targetCount = 1,
  x,
  y,
  pane,
  hasActiveEnv,
  onClose,
  onUpload,
  onDownload,
  onDelete,
  onRename,
  onReveal,
  onCopyPath
}: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLUListElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameInput, setShowRenameInput] = useState(false)
  const [newName, setNewName] = useState(entry.name)

  useEffect(() => {
    function handleOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 9999,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.32), 0 2px 6px rgba(0,0,0,0.18)',
    padding: 6,
    minWidth: 200,
    listStyle: 'none'
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
    fontSize: 13,
    color: 'var(--text)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    borderRadius: 'var(--r-sm)',
    transition: 'background 80ms ease-out, color 80ms ease-out'
  }

  const dangerStyle: React.CSSProperties = {
    ...itemStyle,
    color: 'var(--danger)'
  }

  const separatorStyle: React.CSSProperties = {
    height: 1,
    background: 'var(--border)',
    margin: '4px 2px'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--r-sm)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text)',
    padding: '4px 8px',
    marginBottom: 4
  }

  function ItemLi({
    style,
    icon,
    onClick,
    danger,
    children
  }: {
    style: React.CSSProperties
    icon?: React.ReactNode
    onClick?: () => void
    danger?: boolean
    children: React.ReactNode
  }): React.JSX.Element {
    return (
      <li
        style={style}
        onClick={onClick}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement
          if (danger) {
            el.style.background = 'rgba(196, 69, 58, 0.12)'
            el.style.color = 'var(--danger)'
          } else {
            el.style.background = 'var(--surface-hover)'
          }
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.background = 'transparent'
          if (danger) el.style.color = 'var(--danger)'
        }}
      >
        {icon !== undefined && <Icon>{icon}</Icon>}
        {children}
      </li>
    )
  }

  return createPortal(
    <ul ref={ref} style={menuStyle}>
      {pane === 'local' && (
        <>
          {hasActiveEnv && (
            <ItemLi style={itemStyle} icon={ICONS.upload} onClick={() => { onUpload?.(); onClose() }}>
              {targetCount > 1 ? `Upload ${targetCount} items to remote` : 'Upload to remote'}
            </ItemLi>
          )}
          <ItemLi style={itemStyle} icon={ICONS.reveal} onClick={() => { onReveal?.(); onClose() }}>
            {revealLabel()}
          </ItemLi>
        </>
      )}

      {pane === 'remote' && (
        <>
          <ItemLi style={itemStyle} icon={ICONS.download} onClick={() => { onDownload?.(); onClose() }}>
            {targetCount > 1 ? `Copy ${targetCount} items to local folder` : 'Copy to local folder'}
          </ItemLi>

          {targetCount === 1 && (
            <ItemLi style={itemStyle} icon={ICONS.clipboard} onClick={() => { onCopyPath?.(); onClose() }}>
              Copy path to clipboard
            </ItemLi>
          )}

          {targetCount === 1 && (showRenameInput ? (
            <li style={{ padding: '6px 10px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 4 }}>Rename to:</p>
              <input
                autoFocus
                style={inputStyle}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim() && newName !== entry.name) {
                    onRename?.(newName.trim())
                    onClose()
                  }
                  if (e.key === 'Escape') setShowRenameInput(false)
                }}
              />
            </li>
          ) : (
            <ItemLi style={itemStyle} icon={ICONS.rename} onClick={() => setShowRenameInput(true)}>
              Rename
            </ItemLi>
          ))}

          <li style={separatorStyle} />

          {showDeleteConfirm ? (
            <li style={{ padding: '6px 12px' }}>
              <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>
                {targetCount > 1
                  ? `Delete ${targetCount} items?`
                  : `Delete ${entry.name}?`}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={{
                    fontSize: 10,
                    background: 'var(--danger)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--r-sm)',
                    padding: '2px 8px',
                    cursor: 'pointer'
                  }}
                  onClick={() => { onDelete?.(); onClose() }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  style={{
                    fontSize: 10,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <ItemLi style={dangerStyle} icon={ICONS.trash} danger onClick={() => setShowDeleteConfirm(true)}>
              Delete
            </ItemLi>
          )}
        </>
      )}
    </ul>,
    document.body
  )
}
