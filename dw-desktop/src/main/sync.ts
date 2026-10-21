import { createHash, randomUUID } from 'crypto'
import { createReadStream } from 'fs'
import { mkdir, readdir, stat } from 'fs/promises'
import { join } from 'path'
import {
  CANCELLED,
  FILE_CONCURRENCY,
  FileTransferApiError,
  collectManifest,
  downloadOneFile,
  errorToResult,
  getJson,
  isAbortError,
  localPathFor,
  mapPool,
  postJson,
  toApiPath,
  uploadOneFile,
  type FileTransferEntry
} from './dw-api'
import { createTransferState, type TransferState } from './transferState'
import type {
  IPCResult,
  StoredEnv,
  SyncAction,
  SyncItem,
  SyncPlan,
  SyncRequest,
  SyncRunItem,
  SyncRunResult
} from '../shared/types'

/**
 * Folder sync between a local folder and a remote one, ported from the CLI v2
 * (bin/transfer/sync.js). A plan classifies every path, the user reviews it, and
 * running it transfers only the selected items.
 *
 * Push (deploy to server): local-only → upload, different → replace, remote-only →
 * skip (or delete when `deleteExtra`). Pull (get from server) is the mirror image;
 * local deletes go to the OS trash.
 *
 * Conflicts: once a folder has been synced, the transfer state holds the version of
 * every file as the app left it. A replace or delete that would discard a change
 * made on the other side since then (server: eTag moved; this computer: content hash
 * moved) is a conflict and is never included until the user picks a side.
 */

interface LocalFile {
  path: string
  absolute: string
  size: number
  mtimeMs: number
}

interface PlanDetail {
  item: SyncItem
  local?: LocalFile
  localDir?: string
  remote?: FileTransferEntry
  localSha?: string
  remoteSha?: string
}

interface StoredPlan {
  env: StoredEnv
  plan: SyncPlan
  apiRoot: string
  localRoot: string
  details: Map<string, PlanDetail>
  /** Files found equal; they become part of the baseline after a successful run. */
  unchanged: PlanDetail[]
}

// Plans are kept until run (or replaced); a handful is plenty.
const plans = new Map<string, StoredPlan>()
const MAX_PLANS = 10

// Local and remote clocks and file systems disagree by a little; within this, a
// same-size file counts as unchanged when content isn't compared.
const MTIME_TOLERANCE_MS = 2000

export async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Lists a local folder as '/'-separated relative paths, keyed lower case like the server. */
export async function walkLocal(root: string): Promise<{
  files: Map<string, LocalFile>
  dirs: Map<string, { path: string; absolute: string }>
}> {
  const files = new Map<string, LocalFile>()
  const dirs = new Map<string, { path: string; absolute: string }>()
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        dirs.set(rel.toLowerCase(), { path: rel, absolute })
        await walk(absolute, rel)
      } else if (entry.isFile()) {
        const s = await stat(absolute)
        files.set(rel.toLowerCase(), { path: rel, absolute, size: s.size, mtimeMs: s.mtimeMs })
      }
    }
  }
  await walk(root, '')
  return { files, dirs }
}

function joinApi(root: string, rel: string): string {
  return root ? `${root}/${rel}` : rel
}

async function remoteSha(
  env: StoredEnv,
  state: TransferState,
  apiPath: string,
  eTag: string | null | undefined
): Promise<string> {
  const known = state.knownHash(apiPath, eTag)
  if (known) return known
  const result = await getJson<{ value: string; eTag: string }>(env, 'entries/checksum', {
    path: apiPath
  })
  state.cacheHash(apiPath, result.eTag, result.value)
  return result.value
}

function item(
  path: string,
  type: SyncItem['type'],
  action: SyncAction,
  reason: string,
  size?: number,
  remoteETag?: string | null
): SyncItem {
  return { path, type, action, reason, size, remoteETag, include: action !== 'conflict' }
}

export async function buildSyncPlan(
  env: StoredEnv,
  request: SyncRequest,
  state: TransferState = createTransferState(env)
): Promise<IPCResult<SyncPlan>> {
  try {
    const push = request.direction === 'push'
    const apiRoot = toApiPath(request.remotePath)

    let local: Awaited<ReturnType<typeof walkLocal>>
    try {
      local = await walkLocal(request.localPath)
    } catch {
      if (push)
        return { ok: false, error: `The local folder “${request.localPath}” doesn’t exist.` }
      local = { files: new Map(), dirs: new Map() }
    }

    let remoteEntries: FileTransferEntry[]
    try {
      remoteEntries = await collectManifest(env, apiRoot)
    } catch (err) {
      if (!(err instanceof FileTransferApiError && err.code === 'NOT_FOUND')) throw err
      if (!push) return { ok: false, error: 'That folder doesn’t exist on the server.' }
      remoteEntries = []
    }
    const remoteFiles = new Map<string, FileTransferEntry>()
    const remoteDirs = new Map<string, FileTransferEntry>()
    for (const e of remoteEntries)
      (e.isDirectory ? remoteDirs : remoteFiles).set(e.path.toLowerCase(), e)

    const syncedBefore = state.isTracked(apiRoot)
    const details = new Map<string, PlanDetail>()
    const unchanged: PlanDetail[] = []
    const add = (d: PlanDetail): void => {
      details.set(d.item.path, d)
    }

    // Files on both sides: decide equal / different (in parallel, hashing is slow).
    const both: { local: LocalFile; remote: FileTransferEntry }[] = []
    for (const [k, l] of local.files) {
      const r = remoteFiles.get(k)
      if (r) both.push({ local: l, remote: r })
      else if (push)
        add({ item: item(l.path, 'file', 'upload', 'Not on the server', l.size), local: l })
      else if (request.deleteExtra)
        add({ item: item(l.path, 'file', 'delete', 'Not on the server', l.size), local: l })
      else add({ item: item(l.path, 'file', 'skip', 'Only on this computer', l.size), local: l })
    }
    for (const [k, r] of remoteFiles) {
      if (local.files.has(k)) continue
      if (!push)
        add({
          item: item(r.path, 'file', 'download', 'Not on this computer', r.size, r.eTag),
          remote: r
        })
      else if (request.deleteExtra)
        add({
          item: item(r.path, 'file', 'delete', 'Not on this computer', r.size, r.eTag),
          remote: r
        })
      else
        add({ item: item(r.path, 'file', 'skip', 'Only on the server', r.size, r.eTag), remote: r })
    }

    await mapPool(both, FILE_CONCURRENCY * 2, async ({ local: l, remote: r }) => {
      const d: PlanDetail = { item: item(l.path, 'file', 'skip', ''), local: l, remote: r }
      const apiPath = joinApi(apiRoot, r.path)
      let reason: string | null = null
      if (l.size !== r.size) {
        reason = push ? 'Different on this computer' : 'Different on the server'
      } else if (request.compareContent) {
        const [ls, rs] = await Promise.all([
          hashFile(l.absolute),
          remoteSha(env, state, apiPath, r.eTag)
        ])
        d.localSha = ls
        d.remoteSha = rs
        if (ls !== rs) reason = 'Content differs'
      } else {
        const delta = l.mtimeMs - Date.parse(r.modifiedUtc)
        if (push && delta > MTIME_TOLERANCE_MS) reason = 'Newer on this computer'
        if (!push && delta < -MTIME_TOLERANCE_MS) reason = 'Newer on the server'
      }
      if (reason === null) {
        unchanged.push(d)
        return
      }
      d.item = item(l.path, 'file', 'replace', reason, push ? l.size : r.size, r.eTag)
      add(d)
    })

    // Directories that exist on one side only.
    for (const [k, dir] of local.dirs) {
      if (remoteDirs.has(k)) continue
      if (push)
        add({ item: item(dir.path, 'directory', 'upload', 'New folder'), localDir: dir.absolute })
      else if (request.deleteExtra)
        add({
          item: item(dir.path, 'directory', 'delete', 'Not on the server'),
          localDir: dir.absolute
        })
    }
    for (const [k, dir] of remoteDirs) {
      if (local.dirs.has(k)) continue
      if (!push) add({ item: item(dir.path, 'directory', 'download', 'New folder'), remote: dir })
      else if (request.deleteExtra)
        add({ item: item(dir.path, 'directory', 'delete', 'Not on this computer'), remote: dir })
    }

    // A deleted folder takes its contents with it: show only the top-level deletes.
    const deletedDirs = [...details.values()]
      .filter((d) => d.item.type === 'directory' && d.item.action === 'delete')
      .map((d) => `${d.item.path.toLowerCase()}/`)
    for (const [path, d] of details) {
      const lower = path.toLowerCase()
      if (d.item.action === 'delete' && deletedDirs.some((dir) => lower.startsWith(dir))) {
        details.delete(path)
      }
    }

    // Conflicts: only meaningful once this folder has a baseline.
    if (syncedBefore) {
      await mapPool([...details.values()], FILE_CONCURRENCY * 2, async (d) => {
        if (d.item.type !== 'file') return
        const { action } = d.item
        if (action !== 'replace' && action !== 'delete') return
        const apiPath = joinApi(apiRoot, d.item.path)
        const base = state.getFile(apiPath)
        if (push && d.remote) {
          if (!base) markConflict(d, 'Added on the server since your last sync')
          else if (base.eTag !== d.remote.eTag)
            markConflict(d, 'Changed on the server since your last sync')
        } else if (!push && d.local) {
          if (!base) {
            if (action === 'replace') markConflict(d, 'Added on this computer since your last sync')
            return
          }
          if (!base.sha256) return
          d.localSha ??= await hashFile(d.local.absolute)
          if (d.localSha !== base.sha256)
            markConflict(d, 'Changed on this computer since your last sync')
        }
      })
    }

    const items = [...details.values()]
      .map((d) => d.item)
      .sort((a, b) => (a.path.toLowerCase() < b.path.toLowerCase() ? -1 : 1))
    const plan: SyncPlan = {
      id: randomUUID(),
      request,
      items,
      unchanged: unchanged.length,
      syncedBefore
    }
    plans.set(plan.id, { env, plan, apiRoot, localRoot: request.localPath, details, unchanged })
    while (plans.size > MAX_PLANS) plans.delete(plans.keys().next().value as string)
    state.save()
    return { ok: true, data: plan }
  } catch (err) {
    return errorToResult(err, env)
  }
}

function markConflict(d: PlanDetail, reason: string): void {
  d.item = { ...d.item, action: 'conflict', reason, include: false }
}

export interface SyncEvents {
  progress: (jobId: string, transferred: number, total: number) => void
  done: (jobId: string, outcome: { ok: boolean; skipped?: boolean; error?: string }) => void
}

export interface SyncRunDeps {
  state?: TransferState
  /** Moves a local file or folder to the OS trash (pull deletes). */
  trash: (absolutePath: string) => Promise<void>
  /** Cancels a single item without stopping the rest of the run. */
  itemSignal?: (jobId: string) => AbortSignal | undefined
}

/**
 * Runs the selected items of a plan. Each item reports through `events` under its
 * jobId. Order: folders first, then files (in parallel), then deletes.
 */
export async function runSyncPlan(
  planId: string,
  runItems: SyncRunItem[],
  events: SyncEvents,
  deps: SyncRunDeps,
  signal?: AbortSignal
): Promise<IPCResult<SyncRunResult>> {
  const stored = plans.get(planId)
  if (!stored) return { ok: false, error: 'This preview has expired. Preview the sync again.' }
  const { env, plan, apiRoot, localRoot, details } = stored
  const push = plan.request.direction === 'push'
  const state = deps.state ?? createTransferState(env)
  const result: SyncRunResult = { done: 0, skipped: 0, failed: 0, cancelled: false }

  const selected = runItems
    .map((r) => ({ run: r, d: details.get(r.path) }))
    .filter((x): x is { run: SyncRunItem; d: PlanDetail } => !!x.d)

  const finish = (
    jobId: string,
    outcome: { ok: boolean; skipped?: boolean; error?: string }
  ): void => {
    if (outcome.skipped) result.skipped++
    else if (outcome.ok) result.done++
    else result.failed++
    events.done(jobId, outcome)
  }

  async function runOne({ run, d }: { run: SyncRunItem; d: PlanDetail }): Promise<void> {
    const own = deps.itemSignal?.(run.jobId)
    const itemSignal = own && signal ? AbortSignal.any([signal, own]) : (own ?? signal)
    if (itemSignal?.aborted) {
      events.done(run.jobId, { ok: false, error: CANCELLED })
      return
    }
    const { item: it } = d
    const isConflict = it.action === 'conflict'
    // A conflict resolved in favour of the side that would be overwritten: leave it.
    const keepTarget = isConflict && run.resolution === (push ? 'remote' : 'local')
    if (it.action === 'skip' || keepTarget || (isConflict && !run.resolution)) {
      finish(run.jobId, { ok: true, skipped: true })
      return
    }
    const apiPath = joinApi(apiRoot, it.path)
    // A resolved conflict was either a replace or a delete; the side that exists decides.
    const deleting = it.action === 'delete' || (isConflict && (push ? !d.local : !d.remote))
    try {
      if (deleting) {
        if (push) {
          const guard: Record<string, string> =
            it.type === 'file' && d.remote?.eTag && !isConflict ? { 'If-Match': d.remote.eTag } : {}
          try {
            await postJson(
              env,
              'entries/delete',
              { path: apiPath, recursive: true },
              guard,
              itemSignal
            )
          } catch (err) {
            if (!(err instanceof FileTransferApiError && err.code === 'NOT_FOUND')) throw err
          }
          state.forget(apiPath)
        } else {
          await deps.trash(d.local?.absolute ?? d.localDir ?? localPathFor(localRoot, it.path))
          state.forget(apiPath)
        }
      } else if (it.type === 'directory') {
        if (push) await postJson(env, 'entries/directory', { path: apiPath }, {}, itemSignal)
        else await mkdir(localPathFor(localRoot, it.path), { recursive: true })
      } else if (push && d.local) {
        const file = {
          localPath: d.local.absolute,
          remoteRelativePath: it.path,
          size: d.local.size
        }
        let sent = 0
        const completion = await uploadOneFile(
          env,
          file,
          apiPath,
          it.action !== 'upload',
          (bytes) => {
            sent += bytes
            events.progress(run.jobId, sent, file.size)
          },
          // Guard a plain replace with the planned version; a resolved conflict overwrites.
          { ifMatch: it.action === 'replace' ? d.remote?.eTag : null, signal: itemSignal }
        )
        state.recordFile(apiPath, {
          eTag: completion.eTag,
          sha256: completion.sha256,
          size: completion.size
        })
      } else if (!push && d.remote) {
        const target = localPathFor(localRoot, it.path)
        events.progress(run.jobId, 0, d.remote.size)
        await downloadOneFile(env, apiPath, target, d.remote.eTag, itemSignal)
        events.progress(run.jobId, d.remote.size, d.remote.size)
        state.recordFile(apiPath, {
          eTag: d.remote.eTag ?? '',
          sha256: await hashFile(target),
          size: d.remote.size
        })
      }
      finish(run.jobId, { ok: true })
    } catch (err) {
      if (isAbortError(err)) {
        events.done(run.jobId, { ok: false, error: CANCELLED })
        return
      }
      finish(run.jobId, { ok: false, error: describeError(err, it) })
    }
  }

  const folders = selected.filter(
    (x) => x.d.item.type === 'directory' && x.d.item.action !== 'delete'
  )
  const deletes = selected.filter((x) => x.d.item.action === 'delete')
  const files = selected.filter((x) => !folders.includes(x) && !deletes.includes(x))

  try {
    for (const x of folders) await runOne(x)
    await mapPool(files, FILE_CONCURRENCY, runOne)
    for (const x of deletes) await runOne(x)
  } finally {
    result.cancelled = !!signal?.aborted
    if (!result.cancelled) {
      // Files found equal when planning are verified in sync: they join the baseline.
      for (const d of stored.unchanged) {
        if (!d.remote?.eTag) continue
        const sha = d.localSha && d.localSha === d.remoteSha ? d.localSha : null
        state.recordFile(joinApi(apiRoot, d.item.path), {
          eTag: d.remote.eTag,
          sha256: sha,
          size: d.remote.size
        })
      }
      state.markRootSynced(apiRoot)
      plans.delete(planId)
    }
    state.save()
  }
  return { ok: true, data: result }
}

function describeError(err: unknown, it: SyncItem): string {
  if (err instanceof FileTransferApiError) {
    if (err.code === 'PRECONDITION_FAILED' || err.code === 'ALREADY_EXISTS') {
      return `“${it.path}” changed on the server while syncing, so it was not overwritten. Preview again to review it.`
    }
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}
