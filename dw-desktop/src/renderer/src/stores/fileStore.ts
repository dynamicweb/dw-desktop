import { create } from 'zustand'
import type { FileEntry } from '../../../shared/types'

interface FileState {
  remoteEntries: FileEntry[]
  remotePath: string
  remoteEnvName: string | null
  localEntries: FileEntry[]
  localPath: string
  selected: { pane: 'local' | 'remote'; paths: string[] }
  loadRemote: (envName: string, path: string) => Promise<void>
  loadLocal: (path: string, envName?: string | null) => Promise<void>
  setSelected: (pane: 'local' | 'remote', paths: string[]) => void
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
  localEntries: [],
  localPath: '',
  selected: { pane: 'local', paths: [] },

  loadRemote: async (envName, path) => {
    const result = await window.dw.files.list(envName, path)
    if (result.ok) {
      set({ remoteEntries: result.data ?? [], remotePath: path, remoteEnvName: envName })
      persistRemote(envName, path)
    }
  },

  loadLocal: async (path, envName) => {
    const result = await window.dw.fs.list(path)
    if (result.ok) {
      set({ localEntries: result.data ?? [], localPath: path })
      const targetEnv = envName === undefined ? get().remoteEnvName : envName
      // Skip persisting the empty (drives-view) path — it's transient navigation,
      // not a meaningful "last folder" to restore on next open.
      if (targetEnv && path) persistLocal(targetEnv, path)
    }
  },

  setSelected: (pane, paths) => {
    set({ selected: { pane, paths } })
  }
}))
