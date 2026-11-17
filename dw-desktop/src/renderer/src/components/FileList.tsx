import { useMemo, useState } from 'react'
import type { DiffStatus, FileEntry } from '../../../shared/types'
import { diffKey } from '../utils/compareEntries'
import {
  formatModified,
  formatSize,
  sortEntries,
  type SortKey,
  type SortState
} from '../utils/format'
import { ChevronDownIcon, ChevronUpIcon, FileIcon, FolderIcon, MoreIcon } from './Icons'

export type Pane = 'local' | 'remote'

interface FileListProps {
  entries: FileEntry[]
  loading: boolean
  selected: string[]
  onSelect: (paths: string[]) => void
  onOpen: (entry: FileEntry) => void
  onMenu?: (entry: FileEntry, x: number, y: number) => void
  /** Entries dragged from either pane onto a folder row. */
  onDropIntoDir?: (paths: string[], sourcePane: Pane, targetDir: FileEntry) => void
  /** Entries dragged from the other pane onto the list. */
  onDropOnPane?: (paths: string[], sourcePane: Pane) => void
  /** Files dropped from the OS file manager (target folder row, if any). */
  onDropFiles?: (paths: string[], targetDir?: FileEntry) => void
  pane: Pane
  diffMap?: Map<string, DiffStatus>
  sort: SortState
  onSortChange: (sort: SortState) => void
  emptyText?: string
}

// The name gets the space first; the status column gives way in narrow panes.
const COLUMNS = 'minmax(140px, 1fr) minmax(0, 108px) 64px 92px'

function StatusChip({
  status,
  pane
}: {
  status?: DiffStatus
  pane: Pane
}): React.JSX.Element | null {
  if (status === 'different') {
    return (
      <span
        className="chip"
        style={{ background: 'var(--chip-changed-bg)', color: 'var(--chip-changed-fg)' }}
      >
        Changed
      </span>
    )
  }
  if (status === 'local-only' && pane === 'local') {
    return (
      <span
        className="chip"
        style={{ background: 'var(--chip-new-bg)', color: 'var(--chip-new-fg)' }}
      >
        Not on server
      </span>
    )
  }
  if (status === 'remote-only' && pane === 'remote') {
    return (
      <span
        className="chip"
        style={{ background: 'var(--chip-remote-bg)', color: 'var(--chip-remote-fg)' }}
      >
        Only on server
      </span>
    )
  }
  return null
}

function readDrag(e: React.DragEvent): { paths: string[]; pane: Pane } | null {
  const raw = e.dataTransfer.getData('application/x-dw-paths')
  if (!raw) return null
  try {
    return JSON.parse(raw) as { paths: string[]; pane: Pane }
  } catch {
    return null
  }
}

function osPaths(e: React.DragEvent): string[] {
  return Array.from(e.dataTransfer.files)
    .map((f) => window.dw.fs.getPathForFile(f))
    .filter(Boolean)
}

function SortHeader({
  label,
  column,
  sort,
  onSortChange,
  align
}: {
  label: string
  column: SortKey
  sort: SortState
  onSortChange: (s: SortState) => void
  align?: 'right'
}): React.JSX.Element {
  const active = sort.key === column
  return (
    <button
      type="button"
      onClick={() =>
        onSortChange({ key: column, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })
      }
      aria-label={`Sort by ${label.toLowerCase()}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 4,
        border: 'none',
        background: 'transparent',
        padding: 0,
        fontSize: 12,
        color: active ? 'var(--text)' : 'var(--text-subtle)',
        fontWeight: active ? 500 : 400
      }}
    >
      {label}
      {active &&
        (sort.dir === 'asc' ? (
          <ChevronDownIcon size={12} strokeWidth={2} />
        ) : (
          <ChevronUpIcon size={12} strokeWidth={2} />
        ))}
    </button>
  )
}

export default function FileList({
  entries,
  loading,
  selected,
  onSelect,
  onOpen,
  onMenu,
  onDropIntoDir,
  onDropOnPane,
  onDropFiles,
  pane,
  diffMap,
  sort,
  onSortChange,
  emptyText = 'This folder is empty'
}: FileListProps): React.JSX.Element {
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [draggingPaths, setDraggingPaths] = useState<string[]>([])
  const [isDragOverPane, setIsDragOverPane] = useState(false)
  const [hoverPath, setHoverPath] = useState<string | null>(null)

  const sorted = useMemo(() => sortEntries(entries, sort), [entries, sort])
  const acceptsDrops = !!(onDropOnPane || onDropFiles)

  function handleClick(e: React.MouseEvent, entry: FileEntry): void {
    if (e.metaKey || e.ctrlKey) {
      onSelect(
        selected.includes(entry.path)
          ? selected.filter((p) => p !== entry.path)
          : [...selected, entry.path]
      )
    } else if (e.shiftKey && selected.length > 0) {
      const lastIndex = sorted.findIndex((en) => en.path === selected[selected.length - 1])
      const thisIndex = sorted.findIndex((en) => en.path === entry.path)
      if (lastIndex !== -1 && thisIndex !== -1) {
        const from = Math.min(lastIndex, thisIndex)
        const to = Math.max(lastIndex, thisIndex)
        onSelect(sorted.slice(from, to + 1).map((en) => en.path))
        return
      }
      onSelect([entry.path])
    } else {
      onSelect([entry.path])
    }
  }

  const header = (
    <div
      style={{
        height: 32,
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        alignItems: 'center',
        gap: 8,
        padding: '0 22px 0 16px'
      }}
    >
      <SortHeader label="Name" column="name" sort={sort} onSortChange={onSortChange} />
      <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
        {diffMap?.size ? 'Status' : ''}
      </span>
      <SortHeader
        label="Size"
        column="size"
        sort={sort}
        onSortChange={onSortChange}
        align="right"
      />
      <SortHeader
        label="Modified"
        column="modified"
        sort={sort}
        onSortChange={onSortChange}
        align="right"
      />
    </div>
  )

  let body: React.ReactNode
  if (loading) {
    body = (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
        Loading…
      </div>
    )
  } else if (sorted.length === 0) {
    body = (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
        {emptyText}
      </div>
    )
  } else {
    body = sorted.map((entry) => {
      const isSelected = selected.includes(entry.path)
      const isDir = entry.type === 'directory'
      const isDragOver = isDir && dragOverPath === entry.path
      const hovered = hoverPath === entry.path
      const status = diffMap?.get(diffKey(entry))
      return (
        <div
          key={entry.path}
          role="row"
          aria-selected={isSelected}
          draggable
          onClick={(e) => handleClick(e, entry)}
          onDoubleClick={() => onOpen(entry)}
          onContextMenu={(e) => {
            e.preventDefault()
            onMenu?.(entry, e.clientX, e.clientY)
          }}
          onMouseEnter={() => setHoverPath(entry.path)}
          onMouseLeave={() => setHoverPath((p) => (p === entry.path ? null : p))}
          onDragStart={(e) => {
            const paths = selected.includes(entry.path) ? selected : [entry.path]
            e.dataTransfer.setData('application/x-dw-paths', JSON.stringify({ paths, pane }))
            e.dataTransfer.effectAllowed = 'copyMove'
            setDraggingPaths(paths)
          }}
          onDragEnd={() => setDraggingPaths([])}
          onDragOver={(e) => {
            if (!isDir || !(onDropIntoDir || onDropFiles)) return
            e.preventDefault()
            e.stopPropagation()
            setDragOverPath(entry.path)
            setIsDragOverPane(false)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverPath(null)
          }}
          onDrop={(e) => {
            if (!isDir) return
            e.preventDefault()
            e.stopPropagation()
            setDragOverPath(null)
            const drag = readDrag(e)
            if (drag) {
              if (!drag.paths.includes(entry.path)) onDropIntoDir?.(drag.paths, drag.pane, entry)
              return
            }
            const files = osPaths(e)
            if (files.length > 0) onDropFiles?.(files, entry)
          }}
          style={{
            height: 40,
            display: 'grid',
            gridTemplateColumns: COLUMNS,
            alignItems: 'center',
            gap: 8,
            padding: '0 10px',
            borderRadius: 10,
            cursor: 'default',
            background: isSelected
              ? 'var(--selection)'
              : isDragOver || hovered
                ? 'var(--control-hover)'
                : 'transparent',
            outline: isDragOver ? '1.5px solid var(--text-subtle)' : 'none',
            outlineOffset: -1.5,
            opacity: draggingPaths.includes(entry.path) ? 0.45 : 1,
            fontSize: 14
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {isDir ? (
              <FolderIcon size={18} strokeWidth={1.6} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <FileIcon size={18} strokeWidth={1.6} style={{ color: 'var(--text-muted)' }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.name}
            </span>
          </span>
          <span style={{ overflow: 'hidden' }}>
            <StatusChip status={status} pane={pane} />
          </span>
          <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
            {isDir ? '—' : formatSize(entry.size)}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              fontSize: 12,
              color: 'var(--text-muted)',
              minWidth: 0
            }}
          >
            {(hovered || isSelected) && onMenu ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={`More actions for ${entry.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!isSelected) onSelect([entry.path])
                  const r = e.currentTarget.getBoundingClientRect()
                  onMenu(entry, r.right - 224, r.bottom + 4)
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{
                  width: 28,
                  height: 28,
                  background: 'var(--surface-hover)',
                  color: 'var(--text)'
                }}
              >
                <MoreIcon />
              </button>
            ) : (
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatModified(entry.modified)}
              </span>
            )}
          </span>
        </div>
      )
    })
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {header}
      <div
        role="grid"
        aria-label={pane === 'local' ? 'Files on this computer' : 'Files on the server'}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 6px 8px',
          borderRadius: '0 0 var(--r-lg) var(--r-lg)',
          background: isDragOverPane ? 'var(--control-hover)' : 'transparent',
          outline: isDragOverPane ? '1.5px dashed var(--text-subtle)' : 'none',
          outlineOffset: -6
        }}
        onDragOver={(e) => {
          if (!acceptsDrops) return
          e.preventDefault()
          setIsDragOverPane(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOverPane(false)
        }}
        onDrop={(e) => {
          if (!acceptsDrops) return
          e.preventDefault()
          setIsDragOverPane(false)
          const drag = readDrag(e)
          if (drag) {
            // Dropping onto the pane it came from is a no-op.
            if (drag.pane !== pane) onDropOnPane?.(drag.paths, drag.pane)
            return
          }
          const files = osPaths(e)
          if (files.length > 0) onDropFiles?.(files)
        }}
      >
        {body}
      </div>
    </div>
  )
}
