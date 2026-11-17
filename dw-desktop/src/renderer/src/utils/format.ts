import type { FileEntry } from '../../../shared/types'

export type SortKey = 'name' | 'size' | 'modified'
export interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

export function formatSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** "Today 10:41", "Yesterday", "12 Oct", or "12 Oct 2024". */
export function formatModified(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (d.getTime() >= startOfToday) return `Today ${time}`
  if (d.getTime() >= startOfToday - 86_400_000) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  })
}

/** Folders first, then by the chosen column; ties fall back to the name. */
export function sortEntries(entries: FileEntry[], sort: SortState): FileEntry[] {
  const factor = sort.dir === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    let cmp = 0
    if (sort.key === 'size') cmp = (a.size ?? 0) - (b.size ?? 0)
    else if (sort.key === 'modified') {
      cmp = Date.parse(a.modified ?? '') - Date.parse(b.modified ?? '')
    }
    if (!cmp || Number.isNaN(cmp)) {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    return cmp * factor
  })
}
