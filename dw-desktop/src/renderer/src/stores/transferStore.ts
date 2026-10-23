import { nanoid } from 'nanoid'
import { create } from 'zustand'
import type { TransferJob } from '../../../shared/types'
import { useEnvStore } from './envStore'
import { useFileStore } from './fileStore'

interface TransferState {
  jobs: TransferJob[]
  addJob: (job: TransferJob) => void
  addJobs: (jobs: TransferJob[]) => void
  updateJob: (jobId: string, updates: Partial<TransferJob>) => void
  clearDone: () => void
  /** Appends the saved history behind whatever started this session. */
  hydrate: (saved: TransferJob[]) => void
}

const FINISHED: TransferJob['status'][] = ['done', 'skipped', 'cancelled']

export const useTransferStore = create<TransferState>((set) => ({
  jobs: [],

  addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),

  addJobs: (jobs) => set((state) => ({ jobs: [...jobs, ...state.jobs] })),

  updateJob: (jobId, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, ...updates } : j))
    })),

  clearDone: () =>
    set((state) => {
      // Keep whole batches together: drop a batch only when none of its jobs is
      // still running or failed.
      const unfinished = new Set(
        state.jobs.filter((j) => !FINISHED.includes(j.status)).map((j) => j.batchId)
      )
      return { jobs: state.jobs.filter((j) => unfinished.has(j.batchId)) }
    }),

  hydrate: (saved) =>
    set((state) => {
      const ids = new Set(state.jobs.map((j) => j.id))
      return { jobs: [...state.jobs, ...saved.filter((j) => !ids.has(j.id))] }
    })
}))

/**
 * Loads the saved Activity history, then saves it again whenever a job is added,
 * removed or changes status. Progress ticks alone don't trigger a write.
 */
function initActivityHistory(): () => void {
  let unsubscribe: (() => void) | null = null
  let timer: number | undefined
  let disposed = false
  const signature = (jobs: TransferJob[]): string =>
    jobs.map((j) => `${j.id}:${j.status}`).join(',')
  const flush = (): void => {
    window.clearTimeout(timer)
    timer = undefined
    window.dw.activity.save(useTransferStore.getState().jobs)
  }

  void window.dw.activity.load().then((saved) => {
    // Nothing is saved before this point, so an early write can't wipe the file.
    if (disposed) return
    useTransferStore.getState().hydrate(saved)
    let last = signature(useTransferStore.getState().jobs)
    unsubscribe = useTransferStore.subscribe((state) => {
      const next = signature(state.jobs)
      if (next === last) return
      last = next
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, 500)
    })
  })
  const onUnload = (): void => {
    if (timer !== undefined) flush()
  }
  window.addEventListener('beforeunload', onUnload)

  return () => {
    disposed = true
    unsubscribe?.()
    window.removeEventListener('beforeunload', onUnload)
    if (timer !== undefined) flush()
  }
}

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

/** Starts one upload job per local path (a folder uploads as one job). */
export function startUpload(
  envName: string,
  localPaths: string[],
  remotePath: string,
  overwrite: boolean,
  batchTitle?: string
): void {
  const batchId = nanoid()
  const jobs: TransferJob[] = localPaths.map((p) => ({
    id: nanoid(),
    batchId,
    envName,
    batchTitle,
    direction: 'upload',
    label: baseName(p),
    remotePath,
    localPath: p,
    overwrite,
    status: 'queued',
    transferred: 0,
    total: 1,
    startedAt: Date.now()
  }))
  useTransferStore.getState().addJobs(jobs)
  for (const job of jobs) {
    window.dw.files.upload(envName, [job.localPath], remotePath, overwrite, job.id)
  }
}

async function runDownload(job: TransferJob): Promise<void> {
  const { updateJob } = useTransferStore.getState()
  // A cancelled batch skips jobs that hadn't started yet.
  const current = useTransferStore.getState().jobs.find((j) => j.id === job.id)
  if (current?.status === 'cancelled') return
  updateJob(job.id, { status: 'active', error: undefined })
  const result = await window.dw.files.download(job.envName, job.remotePath, job.localPath, job.id)
  const cancelled = result.error === 'Cancelled.'
  updateJob(job.id, {
    status: result.ok ? 'done' : cancelled ? 'cancelled' : 'error',
    transferred: result.ok ? 1 : 0,
    error: result.ok || cancelled ? undefined : result.error
  })
  const files = useFileStore.getState()
  if (result.ok && files.localPath === job.localPath) void files.loadLocal(job.localPath)
}

/** Downloads remote files or folders into a local folder, one job each, in order. */
export async function startDownload(
  envName: string,
  remotePaths: string[],
  localDir: string,
  batchTitle?: string
): Promise<void> {
  const batchId = nanoid()
  const jobs: TransferJob[] = remotePaths.map((p) => ({
    id: nanoid(),
    batchId,
    envName,
    batchTitle,
    direction: 'download',
    label: baseName(p),
    remotePath: p,
    localPath: localDir,
    status: 'queued',
    transferred: 0,
    total: 1,
    startedAt: Date.now()
  }))
  useTransferStore.getState().addJobs(jobs)
  for (const job of jobs) await runDownload(job)
}

/** Whether a job can still be stopped. A delete from Browse is one request and can't. */
export function canCancel(job: TransferJob): boolean {
  if (job.status !== 'queued' && job.status !== 'active') return false
  return job.direction !== 'delete' || !!job.fromSync
}

/** Cancels every unfinished job of a batch. */
export function cancelBatch(batchId: string): void {
  const { jobs } = useTransferStore.getState()
  cancelJobs(jobs.filter((j) => j.batchId === batchId && canCancel(j)))
}

/** Cancels one job; the rest of its batch keeps going. */
export function cancelJob(jobId: string): void {
  const job = useTransferStore.getState().jobs.find((j) => j.id === jobId)
  if (job && canCancel(job)) cancelJobs([job])
}

function cancelJobs(open: TransferJob[]): void {
  const { updateJob } = useTransferStore.getState()
  window.dw.files.cancel(open.map((j) => j.id))
  // Queued downloads never reach the main process; mark them here.
  for (const j of open)
    if (j.direction === 'download' && j.status === 'queued') {
      updateJob(j.id, { status: 'cancelled' })
    }
}

/** Whether a failed job can be re-run from what it recorded. */
export function canRetry(job: TransferJob): boolean {
  if (job.status !== 'error' && job.status !== 'cancelled') return false
  // A local delete (sync pull) went to the trash; there is nothing to re-send.
  return job.direction !== 'delete' || !job.localPath
}

/** Re-runs the failed and cancelled jobs of a batch with their original parameters. */
export async function retryBatch(batchId: string): Promise<void> {
  const { jobs, updateJob } = useTransferStore.getState()
  const failed = jobs.filter((j) => j.batchId === batchId && canRetry(j))
  for (const job of failed) {
    updateJob(job.id, { status: 'queued', error: undefined, transferred: 0 })
    if (job.direction === 'upload') {
      window.dw.files.upload(
        job.envName,
        [job.localPath],
        job.remotePath,
        job.overwrite ?? true,
        job.id,
        job.ifMatch
      )
    } else if (job.direction === 'download') {
      await runDownload({ ...job, status: 'queued' })
    } else {
      updateJob(job.id, { status: 'active' })
      const result = await window.dw.files.delete(job.envName, job.remotePath, job.ifMatch)
      updateJob(job.id, { status: result.ok ? 'done' : 'error', error: result.error })
    }
  }
}

export function initTransferListeners(): () => void {
  const store = useTransferStore.getState()

  // Debounce remote-pane reloads so a 50-file batch triggers one refresh, not 50.
  const refreshTimers = new Map<string, number>()
  function scheduleRemoteRefresh(envName: string): void {
    const existing = refreshTimers.get(envName)
    if (existing !== undefined) window.clearTimeout(existing)
    const handle = window.setTimeout(() => {
      refreshTimers.delete(envName)
      if (useEnvStore.getState().activeEnv?.name === envName) {
        void useFileStore.getState().refreshRemote()
      }
    }, 250)
    refreshTimers.set(envName, handle)
  }
  // Downloads (e.g. a sync pull) land in the local folder; reload it once per burst.
  const LOCAL = '\u0000local'
  function scheduleLocalRefresh(): void {
    const existing = refreshTimers.get(LOCAL)
    if (existing !== undefined) window.clearTimeout(existing)
    refreshTimers.set(
      LOCAL,
      window.setTimeout(() => {
        refreshTimers.delete(LOCAL)
        const files = useFileStore.getState()
        void files.loadLocal(files.localPath)
      }, 250)
    )
  }

  const unsubProgress = window.dw.on.filesProgress(({ jobId, transferred, total }) => {
    store.updateJob(jobId, { transferred, total, status: 'active' })
  })

  const unsubDone = window.dw.on.filesDone(
    ({ jobId, ok, error, cancelled, uploaded, skipped, skippedNames, excludedNames }) => {
      // An upload where the server wrote nothing and skipped existing files is
      // reported as 'skipped' — not the misleading 'done' it used to show.
      const status: TransferJob['status'] = cancelled
        ? 'cancelled'
        : !ok
          ? 'error'
          : (skipped ?? 0) > 0 && (uploaded ?? 0) === 0
            ? 'skipped'
            : 'done'
      store.updateJob(jobId, {
        status,
        error: cancelled ? undefined : error,
        skippedNames,
        excludedNames: excludedNames?.length ? excludedNames : undefined,
        ...(status === 'done' ? { transferred: 1, total: 1 } : {})
      })
      const job = useTransferStore.getState().jobs.find((j) => j.id === jobId)
      if (!job || status !== 'done') return
      if (job.direction === 'download') {
        scheduleLocalRefresh()
      } else {
        scheduleRemoteRefresh(job.envName)
      }
    }
  )

  const disposeHistory = initActivityHistory()

  return () => {
    disposeHistory()
    unsubProgress()
    unsubDone()
    for (const handle of refreshTimers.values()) window.clearTimeout(handle)
    refreshTimers.clear()
  }
}
