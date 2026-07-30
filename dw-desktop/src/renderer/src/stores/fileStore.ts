import { create } from 'zustand'
import type { CompareMode, DiffStatus, FileEntry } from '../../../shared/types'

const COMPARE_MODE_KEY = 'dw.compareMode'
const HIGHLIGHTED_STATUSES_KEY = 'dw.highlightedStatuses'
const MIRROR_NAV_KEY = 'dw.mirrorNav'
const DEFAULT_HIGHLIGHTED: DiffStatus[] = ['different', 'remote-only']

function loadCompareMode(): CompareMode {
  const v = localStorage.getItem(COMPARE_MODE_KEY)
  return v === 'auto' || v === 'on' ? v : 'off'
}

function loadHighlighted(): DiffStatus[] {
  try {
    const raw = localStorage.getItem(HIGHLIGHTED_STATUSES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed))
        return parsed.filter(
          (s): s is DiffStatus =>
            s === 'local-only' || s === 'remote-only' || s === 'different' || s === 'identical'
        )
    }
  } catch {
    // ignore
  }
  return DEFAULT_HIGHLIGHTED
}

interface FileState {
  remoteEntries: FileEntry[]
  remotePath: string
  remoteEnvName: string | null
  remoteError: string | null
  /** True number of items in the current remote folder (server-reported). */
  remoteTotalCount: number
  /** True when the remote listing is a partial first page (more entries exist). */
  remoteHasMore: boolean
  /** True once the user has explicitly loaded the folder in full. */
  remoteLoadedAll: boolean
  localEntries: FileEntry[]
  localPath: string
  selected: { pane: 'local' | 'remote'; paths: string[] }
  compareMode: CompareMode
  diffMap: Map<string, DiffStatus>
  highlightedStatuses: DiffStatus[]
  loadRemote: (envName: string, path: string) => Promise<boolean>
  loadAllRemote: () => Promise<boolean>
  /**
   * Re-fetch the current remote folder, preserving the load-all choice. Used for
   * refreshes (after uploads, manual refresh, retry) so an auto-refresh doesn't
   * silently collapse a "load all" view back to the first page. Navigating to a
   * different folder still goes through loadRemote, which resets to page one.
   */
  refreshRemote: () => Promise<boolean>
  loadLocal: (path: string, envName?: string | null) => Promise<boolean>
  setSelected: (pane: 'local' | 'remote', paths: string[]) => void
  mirrorNav: boolean
  setCompareMode: (mode: CompareMode) => void
  setDiffMap: (map: Map<string, DiffStatus>) => void
  setMirrorNav: (v: boolean) => void
  toggleHighlightedStatus: (status: DiffStatus) => void
}

function persistRemote(envName: string, remotePath: string): void {
  void window.dw.settings.setPaneState(envName, { remotePath })
}

function persistLocal(envName: string, localPath: string): void {
  void window.dw.settings.setPaneState(envName, { localPath })
}

export const useFileStore = create<FileState>((set, get) => ({
  remoteEntries: [],
  remotePath: '/',
  remoteEnvName: null,
  remoteError: null,
  remoteTotalCount: 0,
  remoteHasMore: false,
  remoteLoadedAll: false,
  localEntries: [],
  localPath: '',
  selected: { pane: 'local', paths: [] },
  compareMode: loadCompareMode(),
  diffMap: new Map(),
  highlightedStatuses: loadHighlighted(),
  mirrorNav: localStorage.getItem(MIRROR_NAV_KEY) === 'true',

  loadRemote: async (envName, path) => {
    const result = await window.dw.files.list(envName, path)
    if (result.ok) {
      const listing = result.data
      set({
        remoteEntries: listing?.entries ?? [],
        remotePath: path,
        remoteEnvName: envName,
        remoteError: null,
        remoteTotalCount: listing?.totalCount ?? listing?.entries.length ?? 0,
        remoteHasMore: listing?.hasMore ?? false,
        remoteLoadedAll: false
      })
      persistRemote(envName, path)
      return true
    }
    // Surface the failure: clear stale entries and record why the listing failed
    // so the UI can explain (bad credentials, unreachable host, server error, …)
    // instead of just showing an empty pane.
    set({
      remoteEntries: [],
      remotePath: path,
      remoteEnvName: envName,
      remoteError: result.error ?? 'Could not load remote files.',
      remoteTotalCount: 0,
      remoteHasMore: false,
      remoteLoadedAll: false
    })
    return false
  },

  // Fetch the current remote folder in full (all pages). Used by the "Load all"
  // control shown when the listing is a partial first page.
  loadAllRemote: async () => {
    const { remoteEnvName, remotePath } = get()
    if (!remoteEnvName) return false
    const result = await window.dw.files.list(remoteEnvName, remotePath, true)
    if (result.ok) {
      const listing = result.data
      set({
        remoteEntries: listing?.entries ?? [],
        remoteError: null,
        remoteTotalCount: listing?.totalCount ?? listing?.entries.length ?? 0,
        remoteHasMore: listing?.hasMore ?? false,
        remoteLoadedAll: true
      })
      return true
    }
    set({ remoteError: result.error ?? 'Could not load all remote files.' })
    return false
  },

  refreshRemote: async () => {
    const { remoteEnvName, remotePath, remoteLoadedAll } = get()
    if (!remoteEnvName) return false
    // Re-list the current folder at the same depth the user is viewing: if they
    // had loaded everything, keep loading everything; otherwise just the first
    // page. remoteLoadedAll is deliberately preserved.
    const result = await window.dw.files.list(remoteEnvName, remotePath, remoteLoadedAll)
    if (result.ok) {
      const listing = result.data
      set({
        remoteEntries: listing?.entries ?? [],
        remoteError: null,
        remoteTotalCount: listing?.totalCount ?? listing?.entries.length ?? 0,
        remoteHasMore: listing?.hasMore ?? false
      })
      return true
    }
    set({ remoteError: result.error ?? 'Could not refresh remote files.' })
    return false
  },

  loadLocal: async (path, envName) => {
    const result = await window.dw.fs.list(path)
    if (result.ok) {
      set({ localEntries: result.data ?? [], localPath: path })
      const targetEnv = envName === undefined ? get().remoteEnvName : envName
      // Skip persisting the empty (drives-view) path — it's transient navigation,
      // not a meaningful "last folder" to restore on next open.
      if (targetEnv && path) persistLocal(targetEnv, path)
      return true
    }
    return false
  },

  setSelected: (pane, paths) => {
    set({ selected: { pane, paths } })
  },

  setCompareMode: (mode) => {
    localStorage.setItem(COMPARE_MODE_KEY, mode)
    set({ compareMode: mode })
  },

  setDiffMap: (map) => {
    set({ diffMap: map })
  },

  setMirrorNav: (v) => {
    localStorage.setItem(MIRROR_NAV_KEY, String(v))
    set({ mirrorNav: v })
  },

  toggleHighlightedStatus: (status) => {
    const current = get().highlightedStatuses
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status]
    localStorage.setItem(HIGHLIGHTED_STATUSES_KEY, JSON.stringify(next))
    set({ highlightedStatuses: next })
  }
}))
