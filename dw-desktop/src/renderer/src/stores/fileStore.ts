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
  localEntries: FileEntry[]
  localPath: string
  selected: { pane: 'local' | 'remote'; paths: string[] }
  compareMode: CompareMode
  diffMap: Map<string, DiffStatus>
  highlightedStatuses: DiffStatus[]
  loadRemote: (envName: string, path: string) => Promise<boolean>
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
      set({
        remoteEntries: result.data ?? [],
        remotePath: path,
        remoteEnvName: envName,
        remoteError: null
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
      remoteError: result.error ?? 'Could not load remote files.'
    })
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
