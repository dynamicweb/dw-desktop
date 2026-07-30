import { createReadStream } from 'fs'
import { mkdir, readdir, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, relative } from 'path'
import AdmZip from 'adm-zip'
import { resolveAuthHeader } from './auth'
import { humanizeAuthError } from '../shared/authErrors'
import type { FileEntry, IPCResult, RemoteListing, StoredEnv, UploadOutcome } from '../shared/types'

import { debugRequest, debugResponse } from './debug'

function baseUrl(env: StoredEnv): string {
  return `${env.protocol}://${env.host}`
}

function normalizeRemotePath(path: string): string {
  if (!path || path === '.') return '/'
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

// Map a UI virtual path (rooted at /) to the actual DW remote path (/Files/...)
function toApiPath(virtualPath: string): string {
  const v = normalizeRemotePath(virtualPath)
  if (v === '/') return '/Files'
  return `/Files${v}`
}

interface UploadableFile {
  localPath: string
  remoteRelativePath: string
  size: number
}

async function collectLocalFiles(localPaths: string[]): Promise<UploadableFile[]> {
  const files: UploadableFile[] = []
  for (const localPath of localPaths) {
    const fileStat = await stat(localPath)
    if (fileStat.isDirectory()) {
      files.push(...(await collectDirectoryFiles(dirname(localPath), localPath)))
    } else {
      files.push({ localPath, remoteRelativePath: basename(localPath), size: fileStat.size })
    }
  }
  return files
}

async function collectDirectoryFiles(
  rootPath: string,
  currentPath: string
): Promise<UploadableFile[]> {
  const children = await readdir(currentPath, { withFileTypes: true })
  const files: UploadableFile[] = []
  for (const child of children) {
    const childPath = join(currentPath, child.name)
    if (child.isDirectory()) {
      files.push(...(await collectDirectoryFiles(rootPath, childPath)))
    } else {
      const childStat = await stat(childPath)
      files.push({
        localPath: childPath,
        remoteRelativePath: relative(rootPath, childPath).replace(/\\/g, '/'),
        size: childStat.size
      })
    }
  }
  return files
}

const BATCH_SIZE = 300

// DW's AssetsByDirectory endpoint pages its results. The page-size query
// parameter is `PagingSize` (capital P/S) — the lowercase `pageSize` we used to
// send was silently ignored, so the server fell back to its default page size
// of 96 and truncated larger folders. We request a full page and surface the
// server's true `totalCount` so the UI can offer an explicit "load all" for
// folders bigger than one page, rather than eagerly fetching everything.
// Default entries fetched per page when listing a remote folder. Overridable
// per environment via `StoredEnv.listPageSize`. LIST_MAX_PAGES bounds the
// "load all" walk so a bad server `totalPages` can't loop unbounded.
const DEFAULT_LIST_PAGE_SIZE = 500
const LIST_MAX_PAGES = 100

function resolvePageSize(env: StoredEnv): number {
  return typeof env.listPageSize === 'number' && env.listPageSize > 0
    ? Math.floor(env.listPageSize)
    : DEFAULT_LIST_PAGE_SIZE
}

function mapAssetEntry(item: Record<string, unknown>, virtualBase: string): FileEntry {
  const name = String(item['name'] ?? item['Name'] ?? '')
  // Detect directories: the API returns sizeInBytes as null for folders
  const sizeInBytes = typeof item['sizeInBytes'] === 'number' ? item['sizeInBytes'] : null
  const isDir = sizeInBytes === null || (sizeInBytes === 0 && !name.includes('.'))
  const virtualPath = virtualBase === '/' ? `/${name}` : `${virtualBase}/${name}`
  return {
    name,
    path: virtualPath,
    type: isDir ? ('directory' as const) : ('file' as const),
    size: isDir ? undefined : (sizeInBytes ?? undefined),
    modified: typeof item['updatedAt'] === 'string' ? item['updatedAt'] : undefined
  }
}

interface AssetPage {
  items: Record<string, unknown>[]
  totalCount: number
  totalPages: number
}

async function fetchAssetPage(
  env: StoredEnv,
  authHeader: string,
  apiPath: string,
  pageIndex: number,
  pageSize: number
): Promise<IPCResult<AssetPage>> {
  const url = `${baseUrl(env)}/Admin/Api/AssetsByDirectory?DirectoryPath=${encodeURIComponent(apiPath)}&IncludeFolders=true&RecursiveSearch=false&PagingSize=${pageSize}&PagingIndex=${pageIndex}`
  const dbEntry = debugRequest('GET', url)
  const response = await fetch(url, { headers: { Authorization: authHeader } })
  const bodyText = await response.text()
  debugResponse(
    dbEntry,
    response.status,
    (() => {
      try {
        return JSON.stringify(JSON.parse(bodyText), null, 2).slice(0, 4000)
      } catch {
        return bodyText.slice(0, 4000)
      }
    })()
  )
  if (!response.ok)
    return {
      ok: false,
      error: humanizeAuthError(`Server returned ${response.status}: ${bodyText.slice(0, 200)}`, env)
    }
  const payload = JSON.parse(bodyText) as {
    model?: { data?: Record<string, unknown>[]; totalCount?: number; totalPages?: number }
  }
  const items = payload.model?.data ?? []
  return {
    ok: true,
    data: {
      items,
      totalCount:
        typeof payload.model?.totalCount === 'number' ? payload.model.totalCount : items.length,
      totalPages: typeof payload.model?.totalPages === 'number' ? payload.model.totalPages : 1
    }
  }
}

/**
 * Lists a remote directory. By default only the first page (`LIST_PAGE_SIZE`)
 * is fetched and `hasMore` reports whether the folder holds more entries; pass
 * `loadAll` to walk every page (bounded by `LIST_MAX_PAGES`) for folders the
 * user has explicitly chosen to load in full.
 */
export async function listFiles(
  env: StoredEnv,
  path: string,
  loadAll = false
): Promise<IPCResult<RemoteListing>> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const apiPath = toApiPath(path)
    const virtualBase = normalizeRemotePath(path)
    const pageSize = resolvePageSize(env)

    const items: Record<string, unknown>[] = []
    let pageIndex = 1
    let totalPages = 1
    let totalCount = 0

    do {
      const page = await fetchAssetPage(env, authHeader, apiPath, pageIndex, pageSize)
      if (!page.ok) return { ok: false, error: page.error }
      items.push(...page.data!.items)
      totalCount = page.data!.totalCount
      totalPages = page.data!.totalPages
      pageIndex += 1
      if (!loadAll) break
    } while (pageIndex <= totalPages && pageIndex <= LIST_MAX_PAGES)

    const entries = items.map((item) => mapAssetEntry(item, virtualBase))
    return { ok: true, data: { entries, totalCount, hasMore: entries.length < totalCount } }
  } catch (err) {
    return { ok: false, error: humanizeAuthError((err as Error).message, env) }
  }
}

export async function uploadFiles(
  env: StoredEnv,
  localPaths: string[],
  remotePath: string,
  overwrite: boolean,
  onProgress: (transferred: number, total: number, currentFile: string) => void
): Promise<IPCResult<UploadOutcome>> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const allFiles = await collectLocalFiles(localPaths)
    const totalBytes = allFiles.reduce((sum, f) => sum + f.size, 0)
    let transferred = 0
    let uploadedCount = 0
    const skippedNames: string[] = []

    const uploadUrl = `${baseUrl(env)}/Admin/Api/Upload?createMissingDirectories=true&createEmptyFiles=false`
    const remoteApiBase = normalizeRemotePath(remotePath).replace(/^\//, '')

    // The DW Upload endpoint takes a single `path` per request and ignores subdirectory
    // components in the multipart filename. To preserve a local folder tree we must group
    // files by their subdirectory relative to the target and POST one multipart per group,
    // sending only basenames as filenames.
    const groups = new Map<string, UploadableFile[]>()
    for (const file of allFiles) {
      const rel = file.remoteRelativePath.replace(/\\/g, '/')
      const slash = rel.lastIndexOf('/')
      const subDir = slash === -1 ? '' : rel.substring(0, slash)
      const groupKey = subDir
      const bucket = groups.get(groupKey) ?? []
      bucket.push(file)
      groups.set(groupKey, bucket)
    }

    for (const [subDir, groupFiles] of groups) {
      const groupRemotePath = subDir ? `${remoteApiBase}/${subDir}` : remoteApiBase

      for (let i = 0; i < groupFiles.length; i += BATCH_SIZE) {
        const batch = groupFiles.slice(i, i + BATCH_SIZE)
        const formData = new FormData()
        formData.append('path', groupRemotePath)
        formData.append('skipExistingFiles', String(!overwrite))
        formData.append('allowOverwrite', String(overwrite))

        const batchFiles = batch.map((f) => basename(f.remoteRelativePath))
        const dbEntry = debugRequest(
          'POST',
          uploadUrl,
          JSON.stringify(
            {
              path: groupRemotePath,
              skipExistingFiles: !overwrite,
              allowOverwrite: overwrite,
              files: batchFiles
            },
            null,
            2
          )
        )

        for (const file of batch) {
          const chunks: Buffer[] = []
          for await (const chunk of createReadStream(file.localPath, {
            highWaterMark: 256 * 1024
          })) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
            chunks.push(buf)
            transferred += buf.byteLength
            onProgress(transferred, totalBytes, file.remoteRelativePath)
          }
          formData.append(
            'files',
            new Blob([Buffer.concat(chunks)]),
            basename(file.remoteRelativePath)
          )
        }

        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { Authorization: authHeader },
          body: formData
        })
        const bodyText = await response.text()
        debugResponse(
          dbEntry,
          response.status,
          (() => {
            try {
              return JSON.stringify(JSON.parse(bodyText), null, 2).slice(0, 2000)
            } catch {
              return bodyText.slice(0, 500)
            }
          })()
        )
        if (!response.ok)
          return {
            ok: false,
            error: `Upload failed with status ${response.status}: ${bodyText.slice(0, 200)}`
          }

        // The Upload endpoint returns `model` = the list of paths it actually
        // wrote. A file that already existed and was skipped (overwrite off)
        // is simply absent from `model`, so we diff the batch against it to
        // report skips honestly instead of reporting every 200 as success.
        let writtenBasenames: Set<string>
        try {
          const parsed = JSON.parse(bodyText) as { model?: unknown }
          if (Array.isArray(parsed.model)) {
            writtenBasenames = new Set(
              parsed.model
                .filter((m): m is string => typeof m === 'string')
                .map((m) => basename(m))
            )
          } else {
            // Unexpected shape — assume everything was written rather than
            // falsely reporting skips.
            writtenBasenames = new Set(batch.map((f) => basename(f.remoteRelativePath)))
          }
        } catch {
          writtenBasenames = new Set(batch.map((f) => basename(f.remoteRelativePath)))
        }
        for (const file of batch) {
          if (writtenBasenames.has(basename(file.remoteRelativePath))) uploadedCount += 1
          else skippedNames.push(file.remoteRelativePath)
        }
      }
    }

    return { ok: true, data: { uploaded: uploadedCount, skipped: skippedNames.length, skippedNames } }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function downloadFile(
  env: StoredEnv,
  remotePath: string,
  localPath: string
): Promise<IPCResult> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const apiPath = toApiPath(remotePath)
    // A path is a file if it has an extension (matches CLI's isFilePath logic)
    const isFile = remotePath.includes('.') && !remotePath.endsWith('.')
    const endpoint = isFile ? 'FileDownload' : 'DirectoryDownload'

    let body: Record<string, unknown>
    if (isFile) {
      // FileDownload: DirectoryPath = parent dir, Ids = full paths (e.g. ["/Files/Templates/logo.png"])
      const parentPath = apiPath.substring(0, apiPath.lastIndexOf('/')) || '/Files'
      body = { DirectoryPath: parentPath, ExcludeDirectories: [''], Ids: [apiPath] }
    } else {
      body = { DirectoryPath: apiPath, ExcludeDirectories: ['system/log'] }
    }

    const url = `${baseUrl(env)}/Admin/Api/${endpoint}`
    const dbEntry = debugRequest('POST', url, JSON.stringify(body, null, 2))
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errText = await response.text()
      debugResponse(dbEntry, response.status, errText)
      return {
        ok: false,
        error: `Transfer failed with status ${response.status}: ${errText.slice(0, 200)}`
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') ?? ''
    const contentLengthHeader = response.headers.get('content-length') ?? '(none)'
    const isZip =
      contentType.includes('zip') ||
      (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b)

    await mkdir(localPath, { recursive: true })

    if (!isZip) {
      const fileName = isFile ? basename(remotePath) : basename(remotePath) + '.bin'
      const outPath = join(localPath, fileName)
      await writeFile(outPath, buffer)
      debugResponse(
        dbEntry,
        response.status,
        [
          `content-type: ${contentType}`,
          `content-length header: ${contentLengthHeader}`,
          `bytes received: ${buffer.length}`,
          `format: raw (not ZIP)`,
          `wrote: ${outPath}`
        ].join('\n')
      )
      return { ok: true }
    }

    const archive = new AdmZip(buffer)
    const zipEntries = archive.getEntries()
    const fileCount = zipEntries.filter((e) => !e.isDirectory).length
    const dirCount = zipEntries.filter((e) => e.isDirectory).length
    const totalUncompressed = zipEntries.reduce((sum, e) => sum + (e.header?.size ?? 0), 0)
    const sampleEntries = zipEntries
      .slice(0, 20)
      .map(
        (e) => `  ${e.isDirectory ? '[d]' : '[f]'} ${e.entryName} (${e.header?.size ?? 0} bytes)`
      )
    const truncatedNote = zipEntries.length > 20 ? `  ... and ${zipEntries.length - 20} more` : ''

    // For directory downloads, ensure the chosen folder name becomes the wrapping dir locally.
    // If the server's ZIP already prefixes every entry with that folder name, extract as-is.
    // Otherwise, extract into a subfolder named after the remote folder so the contents don't
    // spill into the destination root.
    let extractTarget = localPath
    if (!isFile) {
      const folderName = basename(remotePath.replace(/[/\\]+$/, '')) || 'download'
      const topSegments = new Set(
        zipEntries
          .map((e) => e.entryName.replace(/\\/g, '/').split('/')[0])
          .filter((s) => s.length > 0)
      )
      const alreadyWrapped = topSegments.size === 1 && topSegments.has(folderName)
      if (!alreadyWrapped) {
        extractTarget = join(localPath, folderName)
        await mkdir(extractTarget, { recursive: true })
      }
    }

    archive.extractAllTo(extractTarget, true)

    debugResponse(
      dbEntry,
      response.status,
      [
        `content-type: ${contentType}`,
        `content-length header: ${contentLengthHeader}`,
        `bytes received (zip): ${buffer.length}`,
        `zip entries: ${zipEntries.length} (${fileCount} files, ${dirCount} dirs)`,
        `total uncompressed bytes: ${totalUncompressed}`,
        `extracted to: ${extractTarget}`,
        'entries:',
        ...sampleEntries,
        truncatedNote
      ]
        .filter(Boolean)
        .join('\n')
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteRemote(env: StoredEnv, virtualPath: string): Promise<IPCResult> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const apiPath = toApiPath(virtualPath)

    // Detect file vs directory: files have an extension, directories don't
    // (mirrors the CLI's isFilePath heuristic)
    const name = apiPath.split('/').pop() ?? ''
    const isFile = name.includes('.')

    let endpoint: string
    let body: unknown

    if (isFile) {
      const parentDir = apiPath.substring(0, apiPath.lastIndexOf('/')) || '/Files'
      endpoint = 'FileDelete'
      body = { DirectoryPath: parentDir, Ids: [apiPath] }
    } else {
      endpoint = 'DirectoryDelete'
      body = { Path: apiPath }
    }

    const response = await fetch(`${baseUrl(env)}/Admin/Api/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) return { ok: false, error: `Delete failed with status ${response.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function copyRemote(
  env: StoredEnv,
  source: string,
  destination: string
): Promise<IPCResult> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const response = await fetch(`${baseUrl(env)}/Admin/Api/Management/Files/Copy`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: toApiPath(source), destination: toApiPath(destination) })
    })
    if (!response.ok) return { ok: false, error: `Copy failed with status ${response.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function renameRemote(
  env: StoredEnv,
  filePath: string,
  newName: string
): Promise<IPCResult> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const apiPath = toApiPath(filePath)
    const dirPath = apiPath.substring(0, apiPath.lastIndexOf('/')) || '/Files'
    const currentName = apiPath.split('/').pop() ?? ''
    const url = `${baseUrl(env)}/Admin/Api/FileCreateRename?Query.Type=FileByName`
    const body = {
      QueryData: { Name: currentName, DirectoryPath: dirPath },
      Name: newName
    }
    const dbEntry = debugRequest('POST', url, JSON.stringify(body))
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const errText = response.ok ? undefined : await response.text()
    debugResponse(dbEntry, response.status, errText)
    if (!response.ok) {
      return {
        ok: false,
        error: `Rename failed with status ${response.status}: ${(errText ?? '').slice(0, 200)}`
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
