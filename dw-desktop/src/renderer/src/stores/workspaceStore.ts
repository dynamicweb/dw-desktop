import { create } from 'zustand'
import type { SavedSync } from '../../../shared/types'

const MAX_RECENT = 5

function norm(path: string): string {
  return path.toLowerCase()
}

interface WorkspaceState {
  /** Environment the lists below belong to. */
  envName: string | null
  pinned: string[]
  recent: string[]
  syncs: SavedSync[]
  load: (envName: string | null) => Promise<void>
  togglePin: (remotePath: string) => void
  /** Records a visited remote folder (newest first, root excluded). */
  addRecent: (remotePath: string) => void
  saveSync: (sync: SavedSync) => Promise<void>
  deleteSync: (id: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  envName: null,
  pinned: [],
  recent: [],
  syncs: [],

  load: async (envName) => {
    if (!envName) {
      set({ envName: null, pinned: [], recent: [], syncs: [] })
      return
    }
    const [pane, syncs] = await Promise.all([
      window.dw.settings.getPaneState(envName),
      window.dw.settings.getSyncs(envName)
    ])
    set({
      envName,
      pinned: pane.data?.pinned ?? [],
      recent: pane.data?.recent ?? [],
      syncs: syncs.data ?? []
    })
  },

  togglePin: (remotePath) => {
    const { envName, pinned } = get()
    if (!envName) return
    const next = pinned.some((p) => norm(p) === norm(remotePath))
      ? pinned.filter((p) => norm(p) !== norm(remotePath))
      : [...pinned, remotePath]
    set({ pinned: next })
    void window.dw.settings.setPaneState(envName, { pinned: next })
  },

  addRecent: (remotePath) => {
    const { envName, recent } = get()
    if (!envName || !remotePath || remotePath === '/') return
    if (norm(recent[0] ?? '') === norm(remotePath)) return
    const next = [remotePath, ...recent.filter((p) => norm(p) !== norm(remotePath))].slice(
      0,
      MAX_RECENT
    )
    set({ recent: next })
    void window.dw.settings.setPaneState(envName, { recent: next })
  },

  saveSync: async (sync) => {
    const { envName, syncs } = get()
    if (!envName) return
    set({ syncs: [...syncs.filter((s) => s.id !== sync.id), sync] })
    await window.dw.settings.saveSync(envName, sync)
  },

  deleteSync: async (id) => {
    const { envName, syncs } = get()
    if (!envName) return
    set({ syncs: syncs.filter((s) => s.id !== id) })
    await window.dw.settings.deleteSync(envName, id)
  }
}))

/** Last segment of a virtual remote path, for sidebar labels. */
export function folderName(remotePath: string): string {
  return remotePath.split('/').filter(Boolean).pop() ?? 'Files'
}
