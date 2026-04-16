import { useState } from 'react'
import type { FileEntry } from '../../../shared/types'

interface FileListProps {
  entries: FileEntry[]
  loading: boolean
  selected: string[]
  onSelect: (paths: string[]) => void
  onDoubleClick: (entry: FileEntry) => void
  onContextMenu?: (entry: FileEntry, x: number, y: number) => void
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

function FileIcon({ entry, isRemote }: { entry: FileEntry; isRemote?: boolean }): React.JSX.Element {
  if (entry.type === 'directory') {
    return (
      <span
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          background: 'var(--surface-raised)',
          color: isRemote ? 'var(--accent-cool)' : 'var(--text-muted)',
          padding: '1px 4px',
          borderRadius: 'var(--r-sm)',
          flexShrink: 0
        }}
      >
        DIR
      </span>
    )
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
  dropTarget,
  pane
}: FileListProps): React.JSX.Element {
  const isRemote = pane === 'remote'
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)

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
        return (
          <div
            key={entry.path}
            onClick={(e) => handleClick(e, entry)}
            onContextMenu={(e) => {
              e.preventDefault()
              onContextMenu?.(entry, e.clientX, e.clientY)
            }}
            onDoubleClick={() => onDoubleClick(entry)}
            onDragLeave={() => setDragOverPath(null)}
            onDragOver={(e) => {
              if (entry.type === 'directory') {
                e.preventDefault()
                setDragOverPath(entry.path)
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
              color: isSelected ? 'var(--text)' : 'var(--text)',
              outline: isDragOver ? '1px dashed var(--accent-cool)' : 'none',
              outlineOffset: -1
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
