import { create } from 'zustand'
import type { FileEntry } from '../../../shared/types'

interface FileState {
  remoteEntries: FileEntry[]
  remotePath: string
  localEntries: FileEntry[]
  localPath: string
  selected: { pane: 'local' | 'remote'; paths: string[] }
  loadRemote: (envName: string, path: string) => Promise<void>
  loadLocal: (path: string) => Promise<void>
  setSelected: (pane: 'local' | 'remote', paths: string[]) => void
}

export const useFileStore = create<FileState>((set) => ({
  remoteEntries: [],
  remotePath: '/',
  localEntries: [],
  localPath: '',
  selected: { pane: 'local', paths: [] },

  loadRemote: async (envName, path) => {
    const result = await window.dw.files.list(envName, path)
    if (result.ok) {
      set({ remoteEntries: result.data ?? [], remotePath: path })
    }
  },

  loadLocal: async (path) => {
    const result = await window.dw.fs.list(path)
    if (result.ok) {
      set({ localEntries: result.data ?? [], localPath: path })
    }
  },

  setSelected: (pane, paths) => {
    set({ selected: { pane, paths } })
  }
}))
