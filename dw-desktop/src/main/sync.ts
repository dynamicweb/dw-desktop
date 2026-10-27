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
  isForbidden,
  localPathFor,
  mapPool,
  postJson,
  toApiPath,
  uploadOneFile,
  type FileTransferEntry
} from './dw-api'
import { folderForbidden } from '../shared/authErrors'
import { loadExclusions, type Exclusions } from './exclude'
import { createTransferState, type BaselineEntry, type TransferState } from './transferState'
import type {
  ErrorKind,
  ExcludedEntry,
  IPCResult,
  StoredEnv,
  SyncAction,
  SyncItem,
  SyncPlan,
  SyncPlanProgress,
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
 * Exclude rules (see exclude.ts) apply to both sides: an excluded path is neither
 * transferred nor deleted, and a folder holding an excluded path is never deleted
 * as a whole — its other contents are deleted one by one instead.
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

/**
 * Whether the side a sync copies from still holds what the last sync left there. By
 * date alone that can't be told: the server dates a file by when it was written
 * there and a download is dated by when it landed here, so right after a sync every
 * file looks newer on the side the app just wrote.
 */
function sourceUnchangedSinceSync(
  push: boolean,
  base: BaselineEntry | null,
  local: LocalFile,
  remote: FileTransferEntry
): boolean {
  if (!base) return false
  if (!push) return !!remote.eTag && base.eTag === remote.eTag
  return (
    base.size === local.size &&
    base.localMtimeMs !== undefined &&
    Math.abs(base.localMtimeMs - local.mtimeMs) < 1
  )
}

export async function hashFile(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    signal?.throwIfAborted()
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

type Excluded = Omit<ExcludedEntry, 'side'>

/**
 * Lists a local folder as '/'-separated relative paths, keyed lower case like the
 * server. Excluded paths are left out and reported; excluded folders aren't entered.
 */
export async function walkLocal(
  root: string,
  exclusions?: Exclusions,
  { signal, onEntry }: { signal?: AbortSignal; onEntry?: (path: string) => void } = {}
): Promise<{
  files: Map<string, LocalFile>
  dirs: Map<string, { path: string; absolute: string }>
  excluded: Excluded[]
}> {
  const files = new Map<string, LocalFile>()
  const dirs = new Map<string, { path: string; absolute: string }>()
  const excluded: Excluded[] = []
  async function walk(dir: string, prefix: string): Promise<void> {
    if (prefix) await exclusions?.enterDir(dir, prefix)
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      signal?.throwIfAborted()
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = join(dir, entry.name)
      const isDir = entry.isDirectory()
      if (!isDir && !entry.isFile()) continue
      const rule = exclusions?.match(rel, isDir)
      if (rule) {
        excluded.push({ path: rel, type: isDir ? 'directory' : 'file', rule })
        continue
      }
      onEntry?.(rel)
      if (isDir) {
        dirs.set(rel.toLowerCase(), { path: rel, absolute })
        await walk(absolute, rel)
      } else {
        const s = await stat(absolute)
        files.set(rel.toLowerCase(), { path: rel, absolute, size: s.size, mtimeMs: s.mtimeMs })
      }
    }
  }
  await walk(root, '')
  return { files, dirs, excluded }
}

function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** Lower-cased folders that hold an excluded path: these must never be deleted whole. */
function pinnedFolders(excluded: Excluded[]): Set<string> {
  const pinned = new Set<string>()
  for (const x of excluded) {
    for (let dir = parentPath(x.path.toLowerCase()); dir; dir = parentPath(dir)) pinned.add(dir)
  }
  return pinned
}

/** One row per path, marked with the side(s) it was found on. */
function mergeExcluded(local: Excluded[], remote: Excluded[]): ExcludedEntry[] {
  const merged = new Map<string, ExcludedEntry>()
  for (const x of local) merged.set(x.path.toLowerCase(), { ...x, side: 'local' })
  for (const x of remote) {
    const key = x.path.toLowerCase()
    const seen = merged.get(key)
    merged.set(key, seen ? { ...seen, side: 'both' } : { ...x, side: 'remote' })
  }
  return [...merged.values()].sort((a, b) => (a.path.toLowerCase() < b.path.toLowerCase() ? -1 : 1))
}

function joinApi(root: string, rel: string): string {
  return root ? `${root}/${rel}` : rel
}

async function remoteSha(
  env: StoredEnv,
  state: TransferState,
  apiPath: string,
  eTag: string | null | undefined,
  signal?: AbortSignal
): Promise<string> {
  const known = state.knownHash(apiPath, eTag)
  if (known) return known
  const result = await getJson<{ value: string; eTag: string }>(
    env,
    'entries/checksum',
    { path: apiPath },
    signal
  )
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

export interface PlanHooks {
  signal?: AbortSignal
  progress?: (p: Omit<SyncPlanProgress, 'previewId'>) => void
}

// A file that can't be compared is left out of the plan and listed with the reason.
// Only what would fail every other file too stops the preview: cancelling, a refused
// login, or a server that can't be reached.
function stopsPreview(err: unknown): boolean {
  if (isAbortError(err)) return true
  if (err instanceof FileTransferApiError)
    return (err.status === 401 || err.status === 403) && !isForbidden(err)
  return err instanceof TypeError
}

function compareFailed(
  env: StoredEnv,
  d: PlanDetail,
  size: number | undefined,
  err: unknown
): void {
  if (stopsPreview(err)) throw err
  d.item = {
    ...item(d.item.path, 'file', 'skip', 'Couldn’t compare', size, d.remote?.eTag),
    include: false,
    error: errorToResult(err, env).error
  }
}

export async function buildSyncPlan(
  env: StoredEnv,
  request: SyncRequest,
  state: TransferState = createTransferState(env),
  hooks: PlanHooks = {}
): Promise<IPCResult<SyncPlan>> {
  // Stopped on the way out too, so a failure in one worker stops the others' requests.
  const stop = new AbortController()
  const signal = hooks.signal ? AbortSignal.any([hooks.signal, stop.signal]) : stop.signal
  let failed = 0
  const report = (p: Omit<SyncPlanProgress, 'previewId' | 'failed'>): void =>
    hooks.progress?.({ ...p, failed })
  try {
    const push = request.direction === 'push'
    const apiRoot = toApiPath(request.remotePath)
    const exclusions = await loadExclusions({
      localRoot: request.localPath,
      apiRoot,
      useDefaults: request.useDefaultExcludes ?? true,
      useGitignore: request.useGitignore ?? false,
      patterns: request.exclude ?? []
    })

    let local: Awaited<ReturnType<typeof walkLocal>>
    let listed = 0
    report({ phase: 'local', done: 0 })
    try {
      local = await walkLocal(request.localPath, exclusions, {
        signal,
        onEntry: (current) => report({ phase: 'local', done: ++listed, current })
      })
    } catch (err) {
      if (isAbortError(err)) throw err
      if (push)
        return { ok: false, error: `The local folder “${request.localPath}” doesn’t exist.` }
      local = { files: new Map(), dirs: new Map(), excluded: [] }
    }

    let remoteEntries: FileTransferEntry[]
    try {
      report({ phase: 'remote', done: 0 })
      remoteEntries = await collectManifest(env, apiRoot, signal, (done) =>
        report({ phase: 'remote', done })
      )
    } catch (err) {
      if (!(err instanceof FileTransferApiError && err.code === 'NOT_FOUND')) throw err
      if (!push) return { ok: false, error: 'That folder doesn’t exist on the server.' }
      remoteEntries = []
    }
    const remoteFiles = new Map<string, FileTransferEntry>()
    const remoteDirs = new Map<string, FileTransferEntry>()
    const remoteExcluded: Excluded[] = []
    for (const e of remoteEntries) {
      const rule = exclusions.match(e.path, e.isDirectory)
      if (rule) {
        // The manifest lists everything; report only the outermost excluded path.
        const parent = parentPath(e.path)
        if (!parent || !exclusions.match(parent, true))
          remoteExcluded.push({ path: e.path, type: e.isDirectory ? 'directory' : 'file', rule })
        continue
      }
      if (e.isDirectory) remoteDirs.set(e.path.toLowerCase(), e)
      else remoteFiles.set(e.path.toLowerCase(), e)
    }
    const excluded = mergeExcluded(local.excluded, remoteExcluded)
    const pinned = pinnedFolders(excluded)

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

    let compared = 0
    report({ phase: 'compare', done: 0, total: both.length })
    const compareOne = async (l: LocalFile, r: FileTransferEntry): Promise<void> => {
      const d: PlanDetail = { item: item(l.path, 'file', 'skip', ''), local: l, remote: r }
      const apiPath = joinApi(apiRoot, r.path)
      let reason: string | null = null
      if (l.size !== r.size) {
        reason = push ? 'Different on this computer' : 'Different on the server'
      } else if (request.compareContent) {
        report({ phase: 'compare', done: compared, total: both.length, current: l.path })
        try {
          const [ls, rs] = await Promise.all([
            hashFile(l.absolute, signal),
            remoteSha(env, state, apiPath, r.eTag, signal)
          ])
          d.localSha = ls
          d.remoteSha = rs
        } catch (err) {
          compareFailed(env, d, push ? l.size : r.size, err)
          failed++
          add(d)
          return
        }
        if (d.localSha !== d.remoteSha) reason = 'Content differs'
      } else if (!sourceUnchangedSinceSync(push, state.getFile(apiPath), l, r)) {
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
    }
    await mapPool(both, FILE_CONCURRENCY * 2, async ({ local: l, remote: r }) => {
      signal.throwIfAborted()
      await compareOne(l, r)
      compared++
    })
    report({ phase: 'compare', done: compared, total: both.length })

    // Directories that exist on one side only.
    for (const [k, dir] of local.dirs) {
      if (remoteDirs.has(k)) continue
      if (push)
        add({ item: item(dir.path, 'directory', 'upload', 'New folder'), localDir: dir.absolute })
      else if (request.deleteExtra && !pinned.has(k))
        add({
          item: item(dir.path, 'directory', 'delete', 'Not on the server'),
          localDir: dir.absolute
        })
    }
    for (const [k, dir] of remoteDirs) {
      if (local.dirs.has(k)) continue
      if (!push) add({ item: item(dir.path, 'directory', 'download', 'New folder'), remote: dir })
      else if (request.deleteExtra && !pinned.has(k))
        add({ item: item(dir.path, 'directory', 'delete', 'Not on this computer'), remote: dir })
    }

    // Conflicts: only meaningful once this folder has a baseline.
    if (syncedBefore) {
      const toCheck = [...details.values()].filter(
        (d) => d.item.type === 'file' && (d.item.action === 'replace' || d.item.action === 'delete')
      )
      let checked = 0
      report({ phase: 'conflicts', done: 0, total: toCheck.length })
      await mapPool(toCheck, FILE_CONCURRENCY * 2, async (d) => {
        signal.throwIfAborted()
        const { action } = d.item
        report({ phase: 'conflicts', done: checked++, total: toCheck.length, current: d.item.path })
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
          try {
            d.localSha ??= await hashFile(d.local.absolute, signal)
          } catch (err) {
            compareFailed(env, d, d.item.size, err)
            failed++
            return
          }
          if (d.localSha !== base.sha256)
            markConflict(d, 'Changed on this computer since your last sync')
        }
      })
    }

    // A deleted folder takes its contents with it: show only the top-level deletes.
    // A recursive delete would bypass the per-file conflict checks above, so a folder
    // that holds a conflict is not deleted as a whole: its contents stay listed one by
    // one (the conflict to resolve, the rest to delete), and the folder itself stays.
    const conflictPaths = [...details.values()]
      .filter((d) => d.item.action === 'conflict')
      .map((d) => d.item.path.toLowerCase())
    const deletedDirs: string[] = []
    for (const [path, d] of details) {
      if (d.item.type !== 'directory' || d.item.action !== 'delete') continue
      const prefix = `${path.toLowerCase()}/`
      if (conflictPaths.some((c) => c.startsWith(prefix))) details.delete(path)
      else deletedDirs.push(prefix)
    }
    for (const [path, d] of details) {
      const lower = path.toLowerCase()
      if (d.item.action === 'delete' && deletedDirs.some((dir) => lower.startsWith(dir))) {
        details.delete(path)
      }
    }

    const items = [...details.values()]
      .map((d) => d.item)
      .sort((a, b) => (a.path.toLowerCase() < b.path.toLowerCase() ? -1 : 1))
    const plan: SyncPlan = {
      id: randomUUID(),
      request,
      items,
      unchanged: unchanged.length,
      syncedBefore,
      excluded,
      dwignore: exclusions.dwignore,
      gitignores: exclusions.gitignores
    }
    plans.set(plan.id, { env, plan, apiRoot, localRoot: request.localPath, details, unchanged })
    while (plans.size > MAX_PLANS) plans.delete(plans.keys().next().value as string)
    state.save()
    return { ok: true, data: plan }
  } catch (err) {
    return errorToResult(err, env)
  } finally {
    stop.abort()
  }
}

function markConflict(d: PlanDetail, reason: string): void {
  d.item = { ...d.item, action: 'conflict', reason, include: false }
}

export interface SyncOutcome {
  ok: boolean
  skipped?: boolean
  error?: string
  errorKind?: ErrorKind
}

export interface SyncEvents {
  progress: (jobId: string, transferred: number, total: number) => void
  done: (jobId: string, outcome: SyncOutcome) => void
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

  const finish = (jobId: string, outcome: SyncOutcome): void => {
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
          size: completion.size,
          localMtimeMs: d.local.mtimeMs
        })
      } else if (!push && d.remote) {
        const target = localPathFor(localRoot, it.path)
        events.progress(run.jobId, 0, d.remote.size)
        await downloadOneFile(env, apiPath, target, d.remote.eTag, itemSignal)
        events.progress(run.jobId, d.remote.size, d.remote.size)
        state.recordFile(apiPath, {
          eTag: d.remote.eTag ?? '',
          sha256: await hashFile(target),
          size: d.remote.size,
          localMtimeMs: (await stat(target)).mtimeMs
        })
      }
      finish(run.jobId, { ok: true })
    } catch (err) {
      if (isAbortError(err)) {
        events.done(run.jobId, { ok: false, error: CANCELLED })
        return
      }
      finish(run.jobId, {
        ok: false,
        error: describeError(err, it),
        ...(isForbidden(err) ? { errorKind: 'permission' as const } : {})
      })
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
      // What was known about an unchanged server version is kept; the local time only
      // moves when the content was checked equal, so a later edit still shows.
      for (const d of stored.unchanged) {
        if (!d.remote?.eTag) continue
        const apiPath = joinApi(apiRoot, d.item.path)
        const verified = !!d.localSha && d.localSha === d.remoteSha
        const known = state.getFile(apiPath)
        const same = known?.eTag === d.remote.eTag ? known : null
        state.recordFile(apiPath, {
          eTag: d.remote.eTag,
          sha256: verified ? (d.localSha ?? null) : (same?.sha256 ?? null),
          size: d.remote.size,
          localMtimeMs: verified ? d.local?.mtimeMs : same?.localMtimeMs
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
    if (isForbidden(err)) return folderForbidden(err.path ?? it.path, err.message)
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}
