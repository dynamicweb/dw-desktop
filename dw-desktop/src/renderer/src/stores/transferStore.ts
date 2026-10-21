import { create } from 'zustand'
import type { TransferJob } from '../../../shared/types'
import { useEnvStore } from './envStore'
import { useFileStore } from './fileStore'

interface TransferState {
  jobs: TransferJob[]
  addJob: (job: TransferJob) => void
  updateJob: (jobId: string, updates: Partial<TransferJob>) => void
  clearDone: () => void
}

export const useTransferStore = create<TransferState>((set) => ({
  jobs: [],

  addJob: (job) =>
    set((state) => ({ jobs: [job, ...state.jobs] })),

  updateJob: (jobId, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, ...updates } : j))
    })),

  clearDone: () =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.status !== 'done' && j.status !== 'skipped')
    }))
}))

export function initTransferListeners(): () => void {
  const store = useTransferStore.getState()

  // Debounce remote-pane reloads so a 50-file batch triggers one refresh, not 50.
  const refreshTimers = new Map<string, number>()
  function scheduleRemoteRefresh(path: string): void {
    const existing = refreshTimers.get(path)
    if (existing !== undefined) window.clearTimeout(existing)
    const handle = window.setTimeout(() => {
      refreshTimers.delete(path)
      const activeEnv = useEnvStore.getState().activeEnv
      const { remotePath, refreshRemote } = useFileStore.getState()
      if (activeEnv && remotePath === path) {
        // Preserve the load-all choice across the post-upload refresh.
        void refreshRemote()
      }
    }, 250)
    refreshTimers.set(path, handle)
  }

  const unsubProgress = window.dw.on.filesProgress(({ jobId, transferred, total }) => {
    store.updateJob(jobId, { transferred, total, status: 'active' })
  })

  const unsubDone = window.dw.on.filesDone(
    ({ jobId, ok, error, uploaded, skipped, skippedNames }) => {
      // An upload where the server wrote nothing and skipped existing files is
      // reported as 'skipped' — not the misleading 'done' it used to show.
      const status: TransferJob['status'] = !ok
        ? 'error'
        : (skipped ?? 0) > 0 && (uploaded ?? 0) === 0
          ? 'skipped'
          : 'done'
      store.updateJob(jobId, { status, error, skippedNames })
      if (!ok) return
      const job = useTransferStore.getState().jobs.find((j) => j.id === jobId)
      if (!job || job.direction !== 'upload') return
      scheduleRemoteRefresh(job.remotePath)
    }
  )

  return () => {
    unsubProgress()
    unsubDone()
    for (const handle of refreshTimers.values()) window.clearTimeout(handle)
    refreshTimers.clear()
  }
}
