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

interface ContextMenuProps {
  entry: FileEntry
  x: number
  y: number
  pane: 'local' | 'remote'
  hasActiveEnv: boolean
  onClose: () => void
  onUpload?: () => void
  onDownload?: () => void
  onDelete?: () => void
  onCopy?: (destination: string) => void
  onMove?: (destination: string) => void
  onReveal?: () => void
  onCopyPath?: () => void
}

export default function ContextMenu({
  entry,
  x,
  y,
  pane,
  hasActiveEnv,
  onClose,
  onUpload,
  onDownload,
  onDelete,
  onCopy,
  onMove,
  onReveal,
  onCopyPath
}: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLUListElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCopyInput, setShowCopyInput] = useState(false)
  const [showMoveInput, setShowMoveInput] = useState(false)
  const [destPath, setDestPath] = useState(entry.path)

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
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--r-md)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    padding: '4px 0',
    minWidth: 160,
    listStyle: 'none'
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    fontSize: 12,
    color: 'var(--text)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 80ms ease-out'
  }

  const dangerStyle: React.CSSProperties = {
    ...itemStyle,
    color: 'var(--danger)'
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

  function ItemLi({ style, onClick, children }: { style: React.CSSProperties; onClick?: () => void; children: React.ReactNode }): React.JSX.Element {
    return (
      <li
        style={style}
        onClick={onClick}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      >
        {children}
      </li>
    )
  }

  return createPortal(
    <ul ref={ref} style={menuStyle}>
      {pane === 'local' && (
        <>
          {hasActiveEnv && (
            <ItemLi style={itemStyle} onClick={() => { onUpload?.(); onClose() }}>
              Upload to remote
            </ItemLi>
          )}
          <ItemLi style={itemStyle} onClick={() => { onReveal?.(); onClose() }}>
            {revealLabel()}
          </ItemLi>
        </>
      )}

      {pane === 'remote' && (
        <>
          <ItemLi style={itemStyle} onClick={() => { onDownload?.(); onClose() }}>
            Copy to local folder
          </ItemLi>

          {showDeleteConfirm ? (
            <li style={{ padding: '6px 12px' }}>
              <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>Delete {entry.name}?</p>
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
            <ItemLi style={dangerStyle} onClick={() => setShowDeleteConfirm(true)}>
              Delete
            </ItemLi>
          )}

          {showCopyInput ? (
            <li style={{ padding: '6px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 4 }}>Copy to:</p>
              <input
                autoFocus
                style={inputStyle}
                type="text"
                value={destPath}
                onChange={(e) => setDestPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onCopy?.(destPath); onClose() }
                  if (e.key === 'Escape') setShowCopyInput(false)
                }}
              />
            </li>
          ) : (
            <ItemLi style={itemStyle} onClick={() => setShowCopyInput(true)}>
              Copy
            </ItemLi>
          )}

          {showMoveInput ? (
            <li style={{ padding: '6px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 4 }}>Move to:</p>
              <input
                autoFocus
                style={inputStyle}
                type="text"
                value={destPath}
                onChange={(e) => setDestPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onMove?.(destPath); onClose() }
                  if (e.key === 'Escape') setShowMoveInput(false)
                }}
              />
            </li>
          ) : (
            <ItemLi style={itemStyle} onClick={() => setShowMoveInput(true)}>
              Move
            </ItemLi>
          )}

          <ItemLi style={itemStyle} onClick={() => { onCopyPath?.(); onClose() }}>
            Copy path to clipboard
          </ItemLi>
        </>
      )}
    </ul>,
    document.body
  )
}
