import { create } from 'zustand'
import type { TransferJob } from '../../../shared/types'

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
      jobs: state.jobs.filter((j) => j.status !== 'done')
    }))
}))

export function initTransferListeners(): () => void {
  const store = useTransferStore.getState()

  const unsubProgress = window.dw.on.filesProgress(({ jobId, transferred, total }) => {
    store.updateJob(jobId, { transferred, total, status: 'active' })
  })

  const unsubDone = window.dw.on.filesDone(({ jobId, ok, error }) => {
    store.updateJob(jobId, { status: ok ? 'done' : 'error', error })
  })

  return () => {
    unsubProgress()
    unsubDone()
  }
}
