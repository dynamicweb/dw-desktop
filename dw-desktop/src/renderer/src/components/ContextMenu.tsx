import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileEntry } from '../../../shared/types'
import {
  CopyIcon,
  DownloadIcon,
  FolderMoveIcon,
  PencilIcon,
  PinIcon,
  RevealIcon,
  TrashIcon,
  UploadIcon
} from './Icons'

function revealLabel(): string {
  switch (window.dw.platform) {
    case 'darwin':
      return 'Reveal in Finder'
    case 'win32':
      return 'Reveal in Explorer'
    default:
      return 'Show in file manager'
  }
}

interface ContextMenuProps {
  entry: FileEntry
  /** Number of items the menu acts on (>1 when the entry is part of a multi-selection). */
  targetCount?: number
  x: number
  y: number
  pane: 'local' | 'remote'
  hasActiveEnv: boolean
  /** Remote folders only: whether the folder is pinned in the sidebar. */
  pinned?: boolean
  onClose: () => void
  onUpload?: () => void
  onDownload?: () => void
  onDelete?: () => void
  onRename?: (newName: string) => void
  onMove?: () => void
  onTogglePin?: () => void
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
  pinned,
  onClose,
  onUpload,
  onDownload,
  onDelete,
  onRename,
  onMove,
  onTogglePin,
  onReveal,
  onCopyPath
}: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(entry.name)
  const [pos, setPos] = useState({ x, y })

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

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8))
    })
  }, [x, y, renaming, confirmDelete])

  const many = targetCount > 1
  const act = (fn?: () => void) => () => {
    fn?.()
    onClose()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${entry.name}`}
      className="popover"
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999, width: 240 }}
    >
      {pane === 'local' && (
        <>
          {hasActiveEnv && (
            <button type="button" role="menuitem" className="menu-item" onClick={act(onUpload)}>
              <UploadIcon />
              {many ? `Upload ${targetCount} items to server` : 'Upload to server'}
            </button>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={act(onReveal)}>
            <RevealIcon />
            {revealLabel()}
          </button>
          {!many && (
            <button type="button" role="menuitem" className="menu-item" onClick={act(onCopyPath)}>
              <CopyIcon />
              Copy path
            </button>
          )}
        </>
      )}

      {pane === 'remote' && (
        <>
          <button type="button" role="menuitem" className="menu-item" onClick={act(onDownload)}>
            <DownloadIcon />
            {many ? `Download ${targetCount} items` : 'Download to this computer'}
          </button>
          {!many &&
            (renaming ? (
              <div style={{ padding: '6px 10px' }}>
                <input
                  autoFocus
                  aria-label="New name"
                  className="input"
                  style={{ width: '100%', height: 32, fontSize: 13 }}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim() && newName !== entry.name) {
                      onRename?.(newName.trim())
                      onClose()
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setRenaming(false)
                    }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => setRenaming(true)}
              >
                <PencilIcon />
                Rename
              </button>
            ))}
          {onMove && (
            <button type="button" role="menuitem" className="menu-item" onClick={act(onMove)}>
              <FolderMoveIcon />
              Move to folder…
            </button>
          )}
          {!many && (
            <button type="button" role="menuitem" className="menu-item" onClick={act(onCopyPath)}>
              <CopyIcon />
              Copy path
            </button>
          )}
          {!many && entry.type === 'directory' && onTogglePin && (
            <button type="button" role="menuitem" className="menu-item" onClick={act(onTogglePin)}>
              <PinIcon />
              {pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
            </button>
          )}
          <div className="menu-separator" />
          {confirmDelete ? (
            <div style={{ padding: '6px 10px 8px' }}>
              <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 8 }}>
                {many
                  ? `Delete ${targetCount} items from the server?`
                  : `Delete ${entry.name} from the server?`}
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-danger btn-sm" onClick={act(onDelete)}>
                  Delete
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="menu-item danger"
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon />
              Delete
            </button>
          )}
        </>
      )}
    </div>,
    document.body
  )
}
