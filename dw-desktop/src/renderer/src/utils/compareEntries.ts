import type { DiffStatus, FileEntry } from '../../../shared/types'

/**
 * Builds the diff-map key for an entry. Pairs file-to-file and folder-to-folder
 * only — a local file `config` and a remote folder `config` will not match.
 */
export function diffKey(entry: FileEntry): string {
  return `${entry.type}:${entry.name.toLowerCase()}`
}

/**
 * Compares local and remote entries. Returns a map keyed by `${type}:${nameLowercase}`
 * so callers can look up the status of any entry on either side with diffKey(entry).
 *
 * Matching is by (name, type). For matched files, equality is based on size and
 * modified timestamp. Directories are always 'identical' when both sides have a
 * folder of the same name (recursive comparison is out of scope here).
 */
export function compareEntries(
  local: FileEntry[],
  remote: FileEntry[]
): Map<string, DiffStatus> {
  const result = new Map<string, DiffStatus>()
  const remoteByKey = new Map<string, FileEntry>()
  for (const e of remote) remoteByKey.set(diffKey(e), e)

  const seen = new Set<string>()
  for (const l of local) {
    const key = diffKey(l)
    seen.add(key)
    const r = remoteByKey.get(key)
    if (!r) {
      result.set(key, 'local-only')
      continue
    }
    if (l.type === 'directory') {
      result.set(key, 'identical')
      continue
    }
    const sizeMatch = l.size === r.size
    const mtimeMatch = !!l.modified && !!r.modified && l.modified === r.modified
    result.set(key, sizeMatch && mtimeMatch ? 'identical' : 'different')
  }

  for (const [key] of remoteByKey) {
    if (!seen.has(key)) result.set(key, 'remote-only')
  }

  return result
}

export function countByStatus(diff: Map<string, DiffStatus>): Record<DiffStatus, number> {
  const counts: Record<DiffStatus, number> = {
    'local-only': 0,
    'remote-only': 0,
    different: 0,
    identical: 0
  }
  for (const v of diff.values()) counts[v]++
  return counts
}

/**
 * Extracts the DW-relative path tail starting at a `/files` segment (case-insensitive).
 * Returns null if no `/files` path segment exists.
 *
 * Match rules: `files` must be a complete path segment, not a substring of one
 * (so `myfiles` does NOT match).
 *
 *   "C:\\Projects\\Client\\Files\\Templates" → "/files/templates"
 *   "/Files/Templates"                       → "/files/templates"
 *   "C:\\MyFiles\\stuff"                     → null
 *   "C:\\Downloads"                          → null
 */
export function getDwRelativeTail(p: string): string | null {
  if (!p) return null
  const norm = p.replace(/\\/g, '/').toLowerCase()
  const m = norm.match(/(?:^|\/)files(\/.*)?$/)
  if (!m) return null
  return '/files' + (m[1] ?? '')
}
