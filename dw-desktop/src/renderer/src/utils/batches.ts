import type { TransferJob } from '../../../shared/types'

export interface Batch {
  id: string
  envName: string
  title: string
  direction: TransferJob['direction']
  remotePath: string
  jobs: TransferJob[]
  activeCount: number
  doneCount: number
  skippedCount: number
  errorCount: number
  cancelledCount: number
  totalCount: number
  /** 0..1 across the batch (each job weighs the same). */
  progress: number
  status: 'active' | 'done' | 'error' | 'cancelled'
  startedAt: number
  isSync: boolean
}

function verb(direction: TransferJob['direction']): string {
  return direction === 'upload' ? 'Upload' : direction === 'download' ? 'Download' : 'Delete'
}

/** Groups jobs into batches, newest first (jobs are prepended in the store). */
export function groupBatches(jobs: TransferJob[]): Batch[] {
  const byBatch = new Map<string, Batch>()
  for (const job of jobs) {
    let b = byBatch.get(job.batchId)
    if (!b) {
      b = {
        id: job.batchId,
        envName: job.envName,
        title: job.batchTitle ?? '',
        direction: job.direction,
        remotePath: job.remotePath,
        jobs: [],
        activeCount: 0,
        doneCount: 0,
        skippedCount: 0,
        errorCount: 0,
        cancelledCount: 0,
        totalCount: 0,
        progress: 0,
        status: 'active',
        startedAt: job.startedAt,
        isSync: !!job.fromSync
      }
      byBatch.set(job.batchId, b)
    }
    // Jobs of one batch are added in order; show them in that order.
    b.jobs.unshift(job)
    b.totalCount++
    b.startedAt = Math.min(b.startedAt, job.startedAt)
    if (job.status === 'error') b.errorCount++
    else if (job.status === 'done') b.doneCount++
    else if (job.status === 'skipped') b.skippedCount++
    else if (job.status === 'cancelled') b.cancelledCount++
    else b.activeCount++
  }
  for (const b of byBatch.values()) {
    const fractions = b.jobs.map((j) =>
      j.status === 'active' && j.total > 0
        ? Math.min(1, j.transferred / j.total)
        : j.status === 'queued'
          ? 0
          : 1
    )
    b.progress = fractions.reduce((a, f) => a + f, 0) / Math.max(1, fractions.length)
    b.status =
      b.activeCount > 0
        ? 'active'
        : b.errorCount > 0
          ? 'error'
          : b.cancelledCount > 0 && b.doneCount === 0
            ? 'cancelled'
            : 'done'
    if (!b.title) {
      const n = b.totalCount
      b.title =
        n === 1
          ? `${verb(b.direction)} ${b.jobs[0].label}`
          : `${verb(b.direction)} ${n} ${n === 1 ? 'item' : 'items'}`
    }
  }
  return Array.from(byBatch.values())
}
