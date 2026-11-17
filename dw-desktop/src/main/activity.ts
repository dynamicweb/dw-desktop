import { app } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { TransferJob } from '../shared/types'

/**
 * The Activity history, kept in userData/activity.json so it survives a relaunch.
 * Jobs are stored newest first, exactly as the renderer's transfer store holds them.
 */

export const MAX_JOBS = 500
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const INTERRUPTED = 'Interrupted: DW Desktop closed before this finished.'

/**
 * Drops batches older than MAX_AGE_MS, then keeps whole batches (newest first) up to
 * MAX_JOBS jobs. A batch is never split, and the newest one is always kept.
 */
export function pruneActivity(jobs: TransferJob[], now = Date.now()): TransferJob[] {
  const newest = new Map<string, number>()
  const order: string[] = []
  const byBatch = new Map<string, TransferJob[]>()
  for (const job of jobs) {
    if (!byBatch.has(job.batchId)) {
      byBatch.set(job.batchId, [])
      order.push(job.batchId)
    }
    byBatch.get(job.batchId)!.push(job)
    newest.set(job.batchId, Math.max(newest.get(job.batchId) ?? 0, job.startedAt))
  }
  const kept: TransferJob[] = []
  for (const batchId of order) {
    if (now - newest.get(batchId)! > MAX_AGE_MS) continue
    const batch = byBatch.get(batchId)!
    if (kept.length > 0 && kept.length + batch.length > MAX_JOBS) break
    kept.push(...batch)
  }
  return kept
}

/** Jobs still queued or running when the app closed can't still be running now. */
export function markInterrupted(jobs: TransferJob[]): TransferJob[] {
  return jobs.map((j) =>
    j.status === 'queued' || j.status === 'active'
      ? { ...j, status: 'error', error: INTERRUPTED }
      : j
  )
}

function filePath(): string {
  return join(app.getPath('userData'), 'activity.json')
}

export function loadActivity(): TransferJob[] {
  try {
    const jobs = JSON.parse(readFileSync(filePath(), 'utf8')) as unknown
    return Array.isArray(jobs) ? pruneActivity(markInterrupted(jobs as TransferJob[])) : []
  } catch {
    return []
  }
}

export function saveActivity(jobs: TransferJob[]): void {
  const tmp = `${filePath()}.tmp`
  writeFileSync(tmp, JSON.stringify(pruneActivity(jobs)), 'utf8')
  renameSync(tmp, filePath())
}
