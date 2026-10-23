import { createHash, randomUUID } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, open, readdir, rename, rm, stat } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as WebReadableStream } from 'stream/web'
import { resolveAuthHeader } from './auth'
import { defaultExclusions } from './exclude'
import { FILE_TRANSFER_UNSUPPORTED, humanizeAuthError } from '../shared/authErrors'
import type {
  FileEntry,
  IPCResult,
  StoredEnv,
  UploadConflictInfo,
  UploadSummary
} from '../shared/types'

import { debugRequest, debugResponse } from './debug'

// Client for the DW10 File Transfer API (`/Admin/Api/FileTransfer`): resumable,
// checksum-verified uploads, resumable streamed downloads and atomic file
// operations. Mirrors the CLI v2 client (bin/transfer/filetransfer.js); the API
// itself is documented in Dynamicweb.Management.Api/FileTransfer/FILE-TRANSFER-API.md.

function baseUrl(env: StoredEnv): string {
  return `${env.protocol}://${env.host}`
}

function apiBase(env: StoredEnv): string {
  return `${baseUrl(env)}/Admin/Api/FileTransfer`
}

function normalizeRemotePath(path: string): string {
  if (!path || path === '.') return '/'
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

// Map a UI virtual path (rooted at /) to the file-transfer API's path (relative to
// the /Files root, but the server also accepts a leading /Files/ prefix).
export function toApiPath(virtualPath: string): string {
  const v = normalizeRemotePath(virtualPath)
  if (v === '/') return ''
  return v.replace(/^\//, '')
}

interface FileTransferErrorBody {
  code?: string
  message?: string
  retryable?: boolean
  path?: string
  sessionId?: string
}

export class FileTransferApiError extends Error {
  code?: string
  status: number
  retryable: boolean
  constructor(status: number, body: FileTransferErrorBody | undefined, rawText: string) {
    super(body?.message || rawText || `Request failed with status ${status}`)
    this.status = status
    this.code = body?.code
    this.retryable = body?.retryable === true
  }
}

// A request is worth retrying when the server said so (retryable IO_ERROR), when it
// failed server-side (5xx), or when it never reached the server at all (undici
// surfaces network failures as TypeError('fetch failed')).
function isTransientError(err: unknown): boolean {
  if (err instanceof FileTransferApiError) return err.retryable || err.status >= 500
  return err instanceof TypeError
}

const RETRY_DELAYS_MS = [500, 1500]

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransientError(err)) throw err
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }
}

function parseErrorBody(bodyText: string): FileTransferErrorBody | undefined {
  try {
    return JSON.parse(bodyText) as FileTransferErrorBody
  } catch {
    return undefined
  }
}

interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: BodyInit
  debugRequestBody?: string
  /** Non-2xx statuses that are expected and returned instead of thrown (e.g. 416). */
  okStatuses?: number[]
  signal?: AbortSignal
}

export const CANCELLED = 'Cancelled.'

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

// Thin wrapper around fetch for the FileTransfer endpoints: attaches auth, logs to
// the debug panel, and throws FileTransferApiError on failure.
async function apiFetch(
  env: StoredEnv,
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const authHeader = await resolveAuthHeader(env)
  const dbEntry = debugRequest(options.method ?? 'GET', url, options.debugRequestBody)
  const response = await fetch(url, {
    method: options.method,
    headers: { Authorization: authHeader, ...options.headers },
    body: options.body,
    signal: options.signal
  })
  if (!response.ok && !options.okStatuses?.includes(response.status)) {
    const bodyText = await response.text()
    debugResponse(dbEntry, response.status, bodyText.slice(0, 2000))
    throw new FileTransferApiError(response.status, parseErrorBody(bodyText), bodyText)
  }
  return response
}

async function apiFetchJson<T>(
  env: StoredEnv,
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await apiFetch(env, url, options)
  const bodyText = await response.text()
  // Treat an empty success body as `undefined` rather than failing to parse it.
  return bodyText ? (JSON.parse(bodyText) as T) : (undefined as T)
}

export function getJson<T>(
  env: StoredEnv,
  route: string,
  query: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  return withRetry(() =>
    apiFetchJson<T>(env, `${apiBase(env)}/${route}?${new URLSearchParams(query).toString()}`, {
      signal
    })
  )
}

// POSTs a JSON mutation. One Idempotency-Key is shared by every retry attempt, so
// the server applies the operation at most once even if a response is lost.
export function postJson<T>(
  env: StoredEnv,
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
  signal?: AbortSignal
): Promise<T> {
  const json = JSON.stringify(body)
  const requestHeaders = {
    'Content-Type': 'application/json',
    'Idempotency-Key': randomUUID(),
    ...headers
  }
  return withRetry(() =>
    apiFetchJson<T>(env, `${apiBase(env)}/${route}`, {
      method: 'POST',
      headers: requestHeaders,
      body: json,
      debugRequestBody: json,
      signal
    })
  )
}

export function errorToResult(err: unknown, env: StoredEnv): { ok: false; error: string } {
  if (isAbortError(err)) return { ok: false, error: CANCELLED }
  if (err instanceof FileTransferApiError) {
    if (err.status === 401 || err.status === 403) {
      return { ok: false, error: humanizeAuthError(err.message, env) }
    }
    // Every File Transfer API error carries a `code`; a bare 404 means the route
    // itself is missing, i.e. the site runs a Dynamicweb version without the API.
    if (err.status === 404 && !err.code) {
      return { ok: false, error: FILE_TRANSFER_UNSUPPORTED }
    }
    return { ok: false, error: err.message }
  }
  return { ok: false, error: humanizeAuthError((err as Error).message, env) }
}

// How many files are transferred at once.
export const FILE_CONCURRENCY = 4

// Runs `fn` over `items` with at most `limit` calls in flight.
export async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

export interface FileTransferEntry {
  path: string
  name: string
  isDirectory: boolean
  size: number
  modifiedUtc: string
  eTag?: string | null
}

function toFileEntry(item: FileTransferEntry, virtualBase: string): FileEntry {
  const virtualPath = virtualBase === '/' ? `/${item.name}` : `${virtualBase}/${item.name}`
  return {
    name: item.name,
    path: virtualPath,
    type: item.isDirectory ? ('directory' as const) : ('file' as const),
    size: item.isDirectory ? undefined : item.size,
    modified: item.modifiedUtc
  }
}

// `GET entries` returns the whole folder in one response — there is no paging.
export async function listFiles(env: StoredEnv, path: string): Promise<IPCResult<FileEntry[]>> {
  try {
    const virtualBase = normalizeRemotePath(path)
    const items = await getJson<FileTransferEntry[]>(env, 'entries', { path: toApiPath(path) })
    return { ok: true, data: items.map((item) => toFileEntry(item, virtualBase)) }
  } catch (err) {
    return errorToResult(err, env)
  }
}

export interface UploadableFile {
  localPath: string
  remoteRelativePath: string
  size: number
}

// Files picked one by one are always uploaded. Inside a picked folder, the built-in
// junk list (.git, node_modules, .DS_Store…) is left out, matched relative to that
// folder so picking a folder that is itself named e.g. node_modules still works.
async function collectLocalFiles(
  localPaths: string[]
): Promise<{ files: UploadableFile[]; excludedNames: string[] }> {
  const files: UploadableFile[] = []
  const excludedNames: string[] = []
  const excluded = defaultExclusions()
  for (const localPath of localPaths) {
    const fileStat = await stat(localPath)
    if (fileStat.isDirectory()) {
      const rootPath = dirname(localPath)
      const skip = (childPath: string, isDir: boolean): boolean => {
        if (!excluded(toSlashes(relative(localPath, childPath)), isDir)) return false
        excludedNames.push(toSlashes(relative(rootPath, childPath)))
        return true
      }
      files.push(...(await collectDirectoryFiles(rootPath, localPath, skip)))
    } else {
      files.push({ localPath, remoteRelativePath: basename(localPath), size: fileStat.size })
    }
  }
  return { files, excludedNames }
}

function toSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

async function collectDirectoryFiles(
  rootPath: string,
  currentPath: string,
  skip: (childPath: string, isDir: boolean) => boolean
): Promise<UploadableFile[]> {
  const children = await readdir(currentPath, { withFileTypes: true })
  const files: UploadableFile[] = []
  for (const child of children) {
    const childPath = join(currentPath, child.name)
    if (skip(childPath, child.isDirectory())) continue
    if (child.isDirectory()) {
      files.push(...(await collectDirectoryFiles(rootPath, childPath, skip)))
    } else {
      const childStat = await stat(childPath)
      files.push({
        localPath: childPath,
        remoteRelativePath: toSlashes(relative(rootPath, childPath)),
        size: childStat.size
      })
    }
  }
  return files
}

interface UploadSessionResponse {
  id: string
  chunkSize: number
  totalChunks: number
}

export interface UploadSessionCompletion {
  targetPath: string
  size: number
  sha256: string
  eTag: string
}

// How many chunk PUTs are kept in flight at once per file. Reads/hashing stay
// sequential (the full-file SHA-256 must be computed in order); only the network
// writes overlap. Peak memory is FILE_CONCURRENCY × CHUNK_PARALLELISM × chunkSize.
const CHUNK_PARALLELISM = 2

// Above this many files, one recursive manifest walk of the target folder is
// cheaper than a per-file exists round-trip.
const EXISTS_CHECK_THRESHOLD = 8

function targetPathFor(remoteApiBase: string, relativePath: string): string {
  return remoteApiBase ? `${remoteApiBase}/${relativePath}` : relativePath
}

export interface ExistsResult {
  path: string
  exists: boolean
  isDirectory: boolean
}

// Returns the lower-cased target-relative paths of the given local files that
// already exist as files on the remote. Uses per-file exists checks for small
// batches and a single recursive manifest walk for large ones.
async function findExistingTargets(
  env: StoredEnv,
  files: UploadableFile[],
  remoteApiBase: string
): Promise<Set<string>> {
  const conflicts = new Set<string>()
  if (files.length === 0) return conflicts

  if (files.length <= EXISTS_CHECK_THRESHOLD) {
    await Promise.all(
      files.map(async (file) => {
        const target = targetPathFor(remoteApiBase, file.remoteRelativePath)
        const result = await getJson<ExistsResult>(env, 'entries/exists', { path: target })
        if (result.exists) conflicts.add(file.remoteRelativePath.toLowerCase())
      })
    )
    return conflicts
  }

  let existing: Set<string>
  try {
    const entries = await collectManifest(env, remoteApiBase)
    existing = new Set(entries.filter((e) => !e.isDirectory).map((e) => e.path.toLowerCase()))
  } catch (err) {
    // Target folder doesn't exist yet — nothing can conflict.
    if (err instanceof FileTransferApiError && err.code === 'NOT_FOUND') return conflicts
    throw err
  }
  for (const file of files) {
    if (existing.has(file.remoteRelativePath.toLowerCase())) {
      conflicts.add(file.remoteRelativePath.toLowerCase())
    }
  }
  return conflicts
}

/**
 * Pre-upload conflict check: which of the local files already exist under the
 * remote target folder? Lets the UI ask the user (replace / upload missing /
 * cancel) before any bytes are transferred.
 */
export async function checkUploadConflicts(
  env: StoredEnv,
  localPaths: string[],
  remotePath: string
): Promise<IPCResult<UploadConflictInfo>> {
  try {
    const { files } = await collectLocalFiles(localPaths)
    const remoteApiBase = toApiPath(remotePath)
    const conflictSet = await findExistingTargets(env, files, remoteApiBase)
    const conflicts = files
      .filter((f) => conflictSet.has(f.remoteRelativePath.toLowerCase()))
      .map((f) => f.remoteRelativePath)
    return { ok: true, data: { totalFiles: files.length, conflicts } }
  } catch (err) {
    return errorToResult(err, env)
  }
}

// Reads chunk `index` fully. handle.read() may return fewer bytes than requested
// (network shares, block boundaries), so loop until the chunk is complete — a
// short chunk would be rejected by the server with CHUNK_INVALID.
async function readChunk(
  handle: Awaited<ReturnType<typeof open>>,
  index: number,
  chunkSize: number,
  fileSize: number,
  localPath: string
): Promise<Buffer<ArrayBuffer>> {
  const position = index * chunkSize
  const expected = Math.min(chunkSize, fileSize - position)
  const buffer = Buffer.alloc(expected)
  let filled = 0
  while (filled < expected) {
    const { bytesRead } = await handle.read(buffer, filled, expected - filled, position + filled)
    if (bytesRead === 0) {
      throw new Error(
        `"${localPath}" is shorter than expected — it may have changed during upload.`
      )
    }
    filled += bytesRead
  }
  return buffer
}

// Chunk PUTs are idempotent by construction (the server atomically replaces the
// chunk), so they are retried without an Idempotency-Key.
async function putChunk(
  env: StoredEnv,
  sessionId: string,
  index: number,
  totalChunks: number,
  chunk: Buffer<ArrayBuffer>,
  signal?: AbortSignal
): Promise<void> {
  const chunkSha256 = createHash('sha256').update(chunk).digest('hex')
  await apiFetch(env, `${apiBase(env)}/uploads/${sessionId}/chunks/${index}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Content-Sha256': chunkSha256 },
    body: new Blob([chunk]),
    debugRequestBody: `chunk ${index + 1}/${totalChunks} (${chunk.byteLength} bytes)`,
    signal
  })
}

export interface UploadOptions {
  /** Only replace the target if it is still this version (eTag); otherwise PRECONDITION_FAILED. */
  ifMatch?: string | null
  signal?: AbortSignal
}

// Uploads one local file through the resumable chunked-upload protocol: create a
// session, stream the file as chunks (hashed in read order so the full-file
// SHA-256 is ready for finalize with no second read; PUTs overlap up to
// CHUNK_PARALLELISM), then finalize. Transient failures are retried; on any
// terminal failure the session is cancelled so the server can reclaim it early.
export async function uploadOneFile(
  env: StoredEnv,
  file: UploadableFile,
  remoteTargetPath: string,
  overwrite: boolean,
  onChunkUploaded: (bytes: number) => void,
  { ifMatch, signal }: UploadOptions = {}
): Promise<UploadSessionCompletion> {
  const session = await postJson<UploadSessionResponse>(
    env,
    'uploads',
    { targetPath: remoteTargetPath, fileSize: file.size },
    {},
    signal
  )

  try {
    const hash = createHash('sha256')
    if (session.totalChunks > 0) {
      const handle = await open(file.localPath, 'r')
      try {
        for (let start = 0; start < session.totalChunks; start += CHUNK_PARALLELISM) {
          const end = Math.min(start + CHUNK_PARALLELISM, session.totalChunks)
          const window: { index: number; chunk: Buffer<ArrayBuffer> }[] = []
          for (let index = start; index < end; index++) {
            const chunk = await readChunk(
              handle,
              index,
              session.chunkSize,
              file.size,
              file.localPath
            )
            hash.update(chunk)
            window.push({ index, chunk })
          }
          await Promise.all(
            window.map(({ index, chunk }) =>
              withRetry(() =>
                putChunk(env, session.id, index, session.totalChunks, chunk, signal)
              ).then(() => onChunkUploaded(chunk.byteLength))
            )
          )
        }
      } finally {
        await handle.close()
      }
    }

    // Finalize is idempotent by construction: a repeat returns the original completion.
    // With If-Match the server replaces only that version, so overwrite stays off.
    return await postJson<UploadSessionCompletion>(
      env,
      `uploads/${session.id}/finalize`,
      { sha256: hash.digest('hex'), overwrite: ifMatch ? false : overwrite },
      ifMatch ? { 'If-Match': ifMatch } : {},
      signal
    )
  } catch (err) {
    // Best-effort: discard the session immediately instead of leaving it for the
    // server's 24h expiry sweep.
    void apiFetch(env, `${apiBase(env)}/uploads/${session.id}`, { method: 'DELETE' }).catch(
      () => undefined
    )
    throw err
  }
}

// A replace or delete guarded by the version a sync preview saw lost to a newer
// server file.
function changedSincePreview(name: string, verb: string): string {
  return `“${name}” changed on the server since the preview, so it was not ${verb}. Preview the sync again to review it.`
}

/**
 * `ifMatch` (a sync item retried from Activity): replace only the server version the
 * sync preview saw, so a retry cannot overwrite a change made on the server since.
 */
export async function uploadFiles(
  env: StoredEnv,
  localPaths: string[],
  remotePath: string,
  overwrite: boolean,
  onProgress: (transferred: number, total: number, currentFile: string) => void,
  signal?: AbortSignal,
  ifMatch?: string | null
): Promise<IPCResult<UploadSummary>> {
  try {
    const { files: allFiles, excludedNames } = await collectLocalFiles(localPaths)
    const remoteApiBase = toApiPath(remotePath)

    // With overwrite off, existing targets are skipped (never failed): resolve
    // them up front so skipped bytes don't distort the progress total.
    let skipSet = new Set<string>()
    if (!overwrite) {
      skipSet = await findExistingTargets(env, allFiles, remoteApiBase)
    }
    const toUpload = allFiles.filter((f) => !skipSet.has(f.remoteRelativePath.toLowerCase()))
    const skippedNames = allFiles
      .filter((f) => skipSet.has(f.remoteRelativePath.toLowerCase()))
      .map((f) => f.remoteRelativePath)

    const totalBytes = toUpload.reduce((sum, f) => sum + f.size, 0)
    let transferred = 0
    let uploaded = 0
    let failed = 0
    let firstError: string | undefined

    await mapPool(toUpload, FILE_CONCURRENCY, async (file) => {
      if (signal?.aborted) return
      const targetPath = targetPathFor(remoteApiBase, file.remoteRelativePath)
      try {
        await uploadOneFile(
          env,
          file,
          targetPath,
          overwrite,
          (bytes) => {
            transferred += bytes
            onProgress(transferred, totalBytes, file.remoteRelativePath)
          },
          { signal, ifMatch }
        )
        uploaded++
        // Files with no chunks (empty files) still need a progress tick.
        if (file.size === 0) onProgress(transferred, totalBytes, file.remoteRelativePath)
      } catch (err) {
        // A file that appeared remotely between the conflict check and finalize
        // is a skip, not a failure, when overwrite is off.
        if (!overwrite && err instanceof FileTransferApiError && err.code === 'ALREADY_EXISTS') {
          skippedNames.push(file.remoteRelativePath)
          return
        }
        if (isAbortError(err)) return
        failed++
        if (!firstError)
          firstError =
            err instanceof FileTransferApiError && err.code === 'PRECONDITION_FAILED'
              ? changedSincePreview(file.remoteRelativePath, 'replaced')
              : err instanceof Error
                ? err.message
                : String(err)
      }
    })
    if (signal?.aborted) return { ok: false, error: CANCELLED }

    const summary: UploadSummary = {
      uploaded,
      skipped: skippedNames.length,
      skippedNames,
      excludedNames,
      failed,
      firstError
    }
    if (failed > 0) {
      const suffix = firstError ? ` — ${firstError}` : ''
      return {
        ok: false,
        error: `${failed} of ${toUpload.length} file(s) failed to upload${suffix}`,
        data: summary
      }
    }
    return { ok: true, data: summary }
  } catch (err) {
    return errorToResult(err, env)
  }
}

interface ManifestPage {
  path: string
  entries: FileTransferEntry[]
  nextCursor: string | null
}

const MANIFEST_PAGE_SIZE = '1000'

// Walks the recursive manifest of a directory, following `nextCursor` until the
// server reports no more pages. Entry paths are relative to the requested directory.
export async function collectManifest(
  env: StoredEnv,
  remoteDirApiPath: string,
  signal?: AbortSignal
): Promise<FileTransferEntry[]> {
  const all: FileTransferEntry[] = []
  let cursor: string | null = null
  do {
    const query: Record<string, string> = { path: remoteDirApiPath, pageSize: MANIFEST_PAGE_SIZE }
    if (cursor) query.cursor = cursor
    const page: ManifestPage = await getJson<ManifestPage>(env, 'manifest', query, signal)
    all.push(...page.entries)
    cursor = page.nextCursor
  } while (cursor)
  return all
}

// Maps a manifest path onto the local destination, refusing anything that would
// land outside it. The server validates paths too; this keeps the client safe on
// its own.
export function localPathFor(destinationRoot: string, relativePath: string): string {
  const segments = relativePath.split('/')
  const unsafe = segments.some(
    (s) => s === '' || s === '.' || s === '..' || s.includes('\\') || s.includes(':')
  )
  const resolved = resolve(destinationRoot, ...segments)
  const rel = relative(destinationRoot, resolved)
  if (unsafe || !rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Refusing to write unsafe path "${relativePath}" from the server.`)
  }
  return resolved
}

async function localFileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

// Removes partial downloads of `localPath` left over from other remote versions.
async function removeStalePartials(localPath: string, keep: string): Promise<void> {
  const prefix = `${basename(localPath)}.`
  let names: string[]
  try {
    names = await readdir(dirname(localPath))
  } catch {
    return
  }
  for (const name of names) {
    const full = join(dirname(localPath), name)
    if (name.startsWith(prefix) && name.endsWith('.dwpart') && full !== keep) {
      await rm(full, { force: true })
    }
  }
}

const DOWNLOAD_ATTEMPTS = 3

interface EntryMetadata {
  eTag: string
}

// Downloads one file, streaming it to disk. The partial file is named after the
// remote version (eTag), so an interrupted download resumes with an HTTP range
// request — guarded by If-Range, so a file that changed in the meantime is fetched
// whole instead of being spliced.
export async function downloadOneFile(
  env: StoredEnv,
  remoteApiPath: string,
  localFilePath: string,
  eTag?: string | null,
  signal?: AbortSignal
): Promise<void> {
  if (!eTag) {
    eTag = (await getJson<EntryMetadata>(env, 'entries/metadata', { path: remoteApiPath }, signal))
      .eTag
  }
  await mkdir(dirname(localFilePath), { recursive: true })
  const partial = `${localFilePath}.${eTag.replace(/[^0-9a-z-]/gi, '')}.dwpart`
  await removeStalePartials(localFilePath, partial)

  const url = `${apiBase(env)}/entries/download?path=${encodeURIComponent(remoteApiPath)}`
  for (let attempt = 1; ; attempt++) {
    const offset = await localFileSize(partial)
    const response = await withRetry(() =>
      apiFetch(env, url, {
        headers: offset > 0 ? { Range: `bytes=${offset}-`, 'If-Range': eTag } : {},
        // 416: the partial file already holds the whole range.
        okStatuses: [416],
        signal
      })
    )
    if (response.status === 416 || !response.body) break
    try {
      // 206: the server continues where the partial file ends; 200: it sent the
      // whole file (the version changed, or ranges aren't supported).
      await pipeline(
        Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
        createWriteStream(partial, { flags: response.status === 206 ? 'a' : 'w' }),
        { signal }
      )
      break
    } catch (err) {
      // The connection dropped mid-body: the partial file holds what arrived (and a
      // cancelled download keeps it too, so a retry resumes).
      if (isAbortError(err) || attempt >= DOWNLOAD_ATTEMPTS) throw err
    }
  }
  await rename(partial, localFilePath)
}

export async function downloadFile(
  env: StoredEnv,
  remotePath: string,
  localPath: string,
  signal?: AbortSignal
): Promise<IPCResult> {
  try {
    const apiPath = toApiPath(remotePath)
    const existsResult = await getJson<ExistsResult>(
      env,
      'entries/exists',
      { path: apiPath },
      signal
    )
    if (!existsResult.exists) {
      return { ok: false, error: 'No file or directory exists at that path.' }
    }

    await mkdir(localPath, { recursive: true })

    if (!existsResult.isDirectory) {
      await downloadOneFile(env, apiPath, join(localPath, basename(remotePath)), null, signal)
      return { ok: true }
    }

    // Directory download: enumerate the full recursive manifest, then fetch every
    // file individually, recreating the relative folder structure locally. Wrap the
    // contents in a subfolder named after the remote folder so they don't spill into
    // the destination root.
    const folderName = basename(remotePath.replace(/[/\\]+$/, '')) || 'download'
    const extractTarget = join(localPath, folderName)
    await mkdir(extractTarget, { recursive: true })

    const entries = await collectManifest(env, apiPath, signal)
    // Recreate directories first so empty subdirectories exist too.
    for (const entry of entries.filter((e) => e.isDirectory)) {
      await mkdir(localPathFor(extractTarget, entry.path), { recursive: true })
    }
    await mapPool(
      entries.filter((e) => !e.isDirectory),
      FILE_CONCURRENCY,
      async (entry) => {
        const remoteFileApiPath = apiPath ? `${apiPath}/${entry.path}` : entry.path
        await downloadOneFile(
          env,
          remoteFileApiPath,
          localPathFor(extractTarget, entry.path),
          entry.eTag,
          signal
        )
      }
    )

    return { ok: true }
  } catch (err) {
    return errorToResult(err, env)
  }
}

/** `ifMatch`: delete only the server version a sync preview saw (see uploadFiles). */
export async function deleteRemote(
  env: StoredEnv,
  virtualPath: string,
  ifMatch?: string | null
): Promise<IPCResult> {
  try {
    await postJson(
      env,
      'entries/delete',
      { path: toApiPath(virtualPath), recursive: true },
      ifMatch ? { 'If-Match': ifMatch } : {}
    )
    return { ok: true }
  } catch (err) {
    // Already gone (e.g. a retried request, or deleted elsewhere): the goal is met.
    if (err instanceof FileTransferApiError && err.code === 'NOT_FOUND') return { ok: true }
    if (err instanceof FileTransferApiError && err.code === 'PRECONDITION_FAILED')
      return { ok: false, error: changedSincePreview(basename(virtualPath), 'deleted') }
    return errorToResult(err, env)
  }
}

export async function copyRemote(
  env: StoredEnv,
  source: string,
  destination: string
): Promise<IPCResult> {
  try {
    await postJson(env, 'entries/copy', {
      sourcePath: toApiPath(source),
      destinationPath: toApiPath(destination),
      overwrite: false
    })
    return { ok: true }
  } catch (err) {
    return errorToResult(err, env)
  }
}

interface CreateDirectoryResult {
  entry: FileTransferEntry
  created: boolean
}

// Creates `name` inside the remote folder `parentPath`. The endpoint is idempotent
// and also succeeds for an existing directory (`created: false`); that is reported
// as an error so the user knows nothing new was made.
export async function createRemoteDirectory(
  env: StoredEnv,
  parentPath: string,
  name: string
): Promise<IPCResult> {
  try {
    const parent = toApiPath(parentPath)
    const path = parent ? `${parent}/${name}` : name
    const result = await postJson<CreateDirectoryResult>(env, 'entries/directory', { path })
    if (!result.created) return { ok: false, error: `A folder named "${name}" already exists.` }
    return { ok: true }
  } catch (err) {
    if (err instanceof FileTransferApiError && err.code === 'ALREADY_EXISTS') {
      return { ok: false, error: `A file named "${name}" already exists.` }
    }
    return errorToResult(err, env)
  }
}

// Moves a file or folder into another remote folder, keeping its name. One atomic
// server-side rename; an existing item of that name is never replaced.
export async function moveRemote(
  env: StoredEnv,
  sourcePath: string,
  targetDir: string
): Promise<IPCResult> {
  try {
    const source = toApiPath(sourcePath)
    const name = source.split('/').pop() ?? source
    const dir = toApiPath(targetDir)
    if (
      dir.toLowerCase() === source.toLowerCase() ||
      dir.toLowerCase().startsWith(`${source.toLowerCase()}/`)
    ) {
      return { ok: false, error: `Can’t move “${name}” into itself.` }
    }
    const destinationPath = dir ? `${dir}/${name}` : name
    await postJson(env, 'entries/move', { sourcePath: source, destinationPath, overwrite: false })
    return { ok: true }
  } catch (err) {
    if (err instanceof FileTransferApiError && err.code === 'ALREADY_EXISTS') {
      return {
        ok: false,
        error: 'An item with that name already exists in the destination folder.'
      }
    }
    if (err instanceof FileTransferApiError && err.code === 'NOT_FOUND') {
      return { ok: false, error: 'The destination folder doesn’t exist on the server.' }
    }
    return errorToResult(err, env)
  }
}

export async function renameRemote(
  env: StoredEnv,
  filePath: string,
  newName: string
): Promise<IPCResult> {
  try {
    const apiPath = toApiPath(filePath)
    const lastSlash = apiPath.lastIndexOf('/')
    const dirPath = lastSlash === -1 ? '' : apiPath.substring(0, lastSlash)
    const destinationPath = dirPath ? `${dirPath}/${newName}` : newName
    await postJson(env, 'entries/move', { sourcePath: apiPath, destinationPath, overwrite: false })
    return { ok: true }
  } catch (err) {
    return errorToResult(err, env)
  }
}
