import { create } from 'zustand'
import type { StoredEnv, SyncDirection } from '../../../shared/types'

export type View = 'browse' | 'sync' | 'activity' | 'settings'

/** Prefill for the Sync view, e.g. from Browse's "Sync folder" or a saved sync. */
export interface SyncDraft {
  localPath: string
  remotePath: string
  direction?: SyncDirection
  compareContent?: boolean
  deleteExtra?: boolean
  useDefaultExcludes?: boolean
  useGitignore?: boolean
  exclude?: string[]
  /** Saved sync this draft came from, so it can be updated in place. */
  savedId?: string
  name?: string
}

const COLLAPSED_KEY = 'dw.sidebarCollapsed'

interface UiState {
  view: View
  sidebarCollapsed: boolean
  showAddEnv: boolean
  editEnv: StoredEnv | null
  syncDraft: SyncDraft | null
  /** A remote folder Browse should open (from the sidebar); the nonce makes repeats fire. */
  remoteRequest: { path: string; nonce: number } | null
  /** When Activity was last open; failures after this still deserve attention. */
  activitySeenAt: number
  setView: (view: View) => void
  requestRemoteFolder: (path: string) => void
  toggleSidebar: () => void
  openAddEnv: () => void
  openEditEnv: (env: StoredEnv) => void
  closeEnvDialogs: () => void
  /** Opens the Sync view prefilled with this draft. */
  startSync: (draft: SyncDraft) => void
  clearSyncDraft: () => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'browse',
  sidebarCollapsed: localStorage.getItem(COLLAPSED_KEY) === 'true',
  showAddEnv: false,
  editEnv: null,
  syncDraft: null,
  remoteRequest: null,
  // Failures from earlier sessions are in Activity, but don't light up the pill.
  activitySeenAt: Date.now(),
  setView: (view) =>
    set((s) =>
      // Entering or leaving Activity counts as having seen what's there.
      view === 'activity' || s.view === 'activity' ? { view, activitySeenAt: Date.now() } : { view }
    ),
  requestRemoteFolder: (path) => set({ remoteRequest: { path, nonce: Date.now() } }),
  toggleSidebar: () =>
    set((s) => {
      localStorage.setItem(COLLAPSED_KEY, String(!s.sidebarCollapsed))
      return { sidebarCollapsed: !s.sidebarCollapsed }
    }),
  openAddEnv: () => set({ showAddEnv: true, editEnv: null }),
  openEditEnv: (env) => set({ editEnv: env, showAddEnv: false }),
  closeEnvDialogs: () => set({ showAddEnv: false, editEnv: null }),
  startSync: (draft) => set({ syncDraft: draft, view: 'sync' }),
  clearSyncDraft: () => set({ syncDraft: null })
}))
