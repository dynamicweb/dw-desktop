import { mkdir } from 'fs/promises'
import { ipcMain, shell } from 'electron'
import { cancelJobs, releaseJobs, trackJobs } from '../cancellation'
import { hasGitignore } from '../exclude'
import { buildSyncPlan, runSyncPlan } from '../sync'
import { errorToResult, postJson, toApiPath } from '../dw-api'
import { getEnvOrError } from './files'
import type {
  IPCResult,
  SyncPlan,
  SyncPlanProgress,
  SyncRequest,
  SyncRunItem
} from '../../shared/types'

const PROGRESS_INTERVAL_MS = 150

export function registerSyncHandlers(): void {
  // Progress goes out on sync:planProgress, at most every PROGRESS_INTERVAL_MS within a
  // phase; the last update held back is sent when the phase changes or the preview
  // ends, so every step shows its final count. sync:cancelPlan stops the preview.
  ipcMain.handle(
    'sync:plan',
    async (
      event,
      { request, previewId }: { request: SyncRequest; previewId: string }
    ): Promise<IPCResult<SyncPlan>> => {
      const result = getEnvOrError(request.envName)
      if ('ok' in result) return result as IPCResult<SyncPlan>
      const controller = trackJobs([previewId])
      let held: SyncPlanProgress | null = null
      let lastPhase = ''
      let lastSent = 0
      const send = (p: SyncPlanProgress): void => {
        held = null
        lastPhase = p.phase
        lastSent = Date.now()
        if (!event.sender.isDestroyed()) event.sender.send('sync:planProgress', p)
      }
      try {
        return await buildSyncPlan(result.env, request, undefined, {
          signal: controller.signal,
          progress: (update) => {
            const p = { previewId, ...update }
            if (p.phase !== lastPhase) {
              if (held) send(held)
              send(p)
            } else if (Date.now() - lastSent < PROGRESS_INTERVAL_MS) held = p
            else send(p)
          }
        })
      } finally {
        if (held) send(held)
        releaseJobs([previewId])
      }
    }
  )

  ipcMain.on('sync:cancelPlan', (_event, previewId: string) => cancelJobs([previewId]))

  // Retry of a sync folder item: create that one folder, like the run did (the server
  // endpoint is idempotent; a local folder is made with its parents).
  ipcMain.handle(
    'sync:makeDirectory',
    async (
      _event,
      {
        envName,
        remotePath,
        localPath
      }: { envName: string; remotePath?: string; localPath?: string }
    ): Promise<IPCResult> => {
      if (localPath) {
        try {
          await mkdir(localPath, { recursive: true })
          return { ok: true }
        } catch (err) {
          return { ok: false, error: (err as Error).message }
        }
      }
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      try {
        await postJson(result.env, 'entries/directory', { path: toApiPath(remotePath ?? '/') })
        return { ok: true }
      } catch (err) {
        return errorToResult(err, result.env)
      }
    }
  )

  ipcMain.handle(
    'sync:inspectLocal',
    async (_event, localPath: string): Promise<IPCResult<{ gitignore: boolean }>> => {
      return { ok: true, data: { gitignore: await hasGitignore(localPath) } }
    }
  )

  // Fire-and-forget like uploads: every item reports through files:progress /
  // files:done under its job id, so the transfer store and Activity treat a sync
  // like any other batch. sync:finished closes the run.
  ipcMain.on('sync:run', (event, { planId, items }: { planId: string; items: SyncRunItem[] }) => {
    const jobIds = items.map((i) => i.jobId)
    // Each item can be cancelled on its own; cancelling every unfinished item (Cancel
    // on the batch) cancels the run, which also skips recording the sync baseline.
    const itemControllers = new Map(jobIds.map((id) => [id, trackJobs([id])]))
    const unfinished = new Set(jobIds)
    const controller = new AbortController()
    for (const c of itemControllers.values()) {
      c.signal.addEventListener('abort', () => {
        if ([...unfinished].every((id) => itemControllers.get(id)?.signal.aborted)) {
          controller.abort()
        }
      })
    }
    void runSyncPlan(
      planId,
      items,
      {
        progress: (jobId, transferred, total) =>
          event.sender.send('files:progress', { jobId, transferred, total, currentFile: '' }),
        done: (jobId, outcome) => {
          unfinished.delete(jobId)
          event.sender.send('files:done', {
            jobId,
            ok: outcome.ok,
            error: outcome.error,
            errorKind: outcome.errorKind,
            cancelled: !!itemControllers.get(jobId)?.signal.aborted && !outcome.ok,
            uploaded: outcome.skipped ? 0 : 1,
            skipped: outcome.skipped ? 1 : 0
          })
        }
      },
      {
        trash: (path) => shell.trashItem(path),
        itemSignal: (jobId) => itemControllers.get(jobId)?.signal
      },
      controller.signal
    )
      .then((result) => event.sender.send('sync:finished', { planId, ...result }))
      .finally(() => releaseJobs(jobIds))
  })
}
