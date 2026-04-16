import { useState } from 'react'
import type { FileEntry } from '../../../shared/types'

interface FileListProps {
  entries: FileEntry[]
  loading: boolean
  selected: string[]
  onSelect: (paths: string[]) => void
  onDoubleClick: (entry: FileEntry) => void
  onContextMenu?: (entry: FileEntry, x: number, y: number) => void
  onDropIntoDir?: (paths: string[], targetDir: FileEntry) => void
  dropTarget?: boolean
  pane?: 'local' | 'remote'
}

const EXT_LABELS: Record<string, string> = {
  js: 'JS', ts: 'TS', tsx: 'TSX', jsx: 'JSX',
  css: 'CSS', html: 'HTM', htm: 'HTM',
  svg: 'SVG', png: 'IMG', jpg: 'IMG', jpeg: 'IMG', gif: 'IMG', webp: 'IMG',
  zip: 'ZIP', gz: 'GZ', tar: 'TAR',
  json: 'JSON', xml: 'XML', md: 'MD', txt: 'TXT'
}

function FolderIcon({ color }: { color: string }): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5.793L7.207 3.914C7.395 4.102 7.649 4.207 7.914 4.207H13.5C14.052 4.207 14.5 4.655 14.5 5.207V12.5C14.5 13.052 14.052 13.5 13.5 13.5H2.5C1.948 13.5 1.5 13.052 1.5 12.5V3.5Z"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FileIcon({ entry, isRemote }: { entry: FileEntry; isRemote?: boolean }): React.JSX.Element {
  if (entry.type === 'directory') {
    return <FolderIcon color={isRemote ? 'var(--accent-cool)' : 'var(--text-muted)'} />
  }
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  const label = EXT_LABELS[ext] ?? (ext.slice(0, 3).toUpperCase() || 'FILE')
  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        background: 'var(--surface-raised)',
        color: 'var(--text-muted)',
        padding: '1px 4px',
        borderRadius: 'var(--r-sm)',
        flexShrink: 0
      }}
    >
      {label}
    </span>
  )
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileList({
  entries,
  loading,
  selected,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onDropIntoDir,
  dropTarget,
  pane
}: FileListProps): React.JSX.Element {
  const isRemote = pane === 'remote'
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [draggingPaths, setDraggingPaths] = useState<string[]>([])

  function handleClick(e: React.MouseEvent, entry: FileEntry): void {
    if (e.metaKey || e.ctrlKey) {
      if (selected.includes(entry.path)) {
        onSelect(selected.filter((p) => p !== entry.path))
      } else {
        onSelect([...selected, entry.path])
      }
    } else if (e.shiftKey && selected.length > 0) {
      const lastSelected = selected[selected.length - 1]
      const lastIndex = entries.findIndex((en) => en.path === lastSelected)
      const thisIndex = entries.findIndex((en) => en.path === entry.path)
      if (lastIndex !== -1 && thisIndex !== -1) {
        const from = Math.min(lastIndex, thisIndex)
        const to = Math.max(lastIndex, thisIndex)
        onSelect(entries.slice(from, to + 1).map((en) => en.path))
        return
      }
      onSelect([entry.path])
    } else {
      onSelect([entry.path])
    }
  }

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-subtle)',
          fontSize: 12
        }}
      >
        Loading…
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-subtle)',
          fontSize: 13,
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic'
        }}
      >
        Empty directory
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {entries.map((entry) => {
        const isSelected = selected.includes(entry.path)
        const isDragOver = dropTarget && dragOverPath === entry.path && entry.type === 'directory'
        const isDragging = draggingPaths.includes(entry.path)
        return (
          <div
            key={entry.path}
            draggable
            onClick={(e) => handleClick(e, entry)}
            onContextMenu={(e) => {
              e.preventDefault()
              onContextMenu?.(entry, e.clientX, e.clientY)
            }}
            onDoubleClick={() => onDoubleClick(entry)}
            onDragStart={(e) => {
              const paths = selected.includes(entry.path) ? selected : [entry.path]
              e.dataTransfer.setData('application/x-dw-paths', JSON.stringify({ paths, pane }))
              e.dataTransfer.effectAllowed = 'move'
              setDraggingPaths(paths)
            }}
            onDragEnd={() => setDraggingPaths([])}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverPath(null)
              }
            }}
            onDragOver={(e) => {
              if (dropTarget && entry.type === 'directory') {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverPath(entry.path)
              }
            }}
            onDrop={(e) => {
              if (!dropTarget || entry.type !== 'directory') return
              e.preventDefault()
              setDragOverPath(null)
              const raw = e.dataTransfer.getData('application/x-dw-paths')
              if (raw && onDropIntoDir) {
                const { paths } = JSON.parse(raw) as { paths: string[]; pane: string }
                onDropIntoDir(paths, entry)
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 12px',
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: 13,
              transition: 'background 80ms ease-out',
              background: isSelected ? 'var(--selection)' : 'transparent',
              color: 'var(--text)',
              outline: isDragOver ? '1px dashed var(--accent-cool)' : 'none',
              outlineOffset: -1,
              opacity: isDragging ? 0.4 : 1
            }}
            onMouseEnter={(e) => {
              if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'
            }}
            onMouseLeave={(e) => {
              if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            <FileIcon entry={entry} isRemote={isRemote} />
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13,
                color: isRemote && entry.type === 'directory' ? 'var(--accent-cool)' : 'var(--text)'
              }}
            >
              {entry.name}
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-subtle)',
                flexShrink: 0
              }}
            >
              {entry.type === 'directory' ? '' : formatSize(entry.size)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
