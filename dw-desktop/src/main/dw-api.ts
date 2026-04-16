import { createReadStream } from 'fs'
import { mkdir, readdir, stat, writeFile } from 'fs/promises'
import { basename, join, relative } from 'path'
import AdmZip from 'adm-zip'
import { resolveAuthHeader } from './auth'
import type { FileEntry, IPCResult, StoredEnv } from '../shared/types'

import { debugLog } from './debug'

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
      files.push(...(await collectDirectoryFiles(localPath, localPath)))
    } else {
      files.push({ localPath, remoteRelativePath: basename(localPath), size: fileStat.size })
    }
  }
  return files
}

async function collectDirectoryFiles(rootPath: string, currentPath: string): Promise<UploadableFile[]> {
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

export async function listFiles(env: StoredEnv, path: string): Promise<IPCResult<FileEntry[]>> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const apiPath = toApiPath(path)
    const virtualBase = normalizeRemotePath(path)
    const url = `${baseUrl(env)}/Admin/Api/AssetsByDirectory?DirectoryPath=${encodeURIComponent(apiPath)}&IncludeFolders=true&RecursiveSearch=false&pageSize=500`
    debugLog('GET', url)
    const response = await fetch(url, { headers: { Authorization: authHeader } })
    const bodyText = await response.text()
    debugLog('GET', url, response.status, bodyText.slice(0, 2000))
    if (!response.ok) return { ok: false, error: `Server returned ${response.status}: ${bodyText.slice(0, 200)}` }

    const payload = JSON.parse(bodyText) as {
      model?: {
        data?: Record<string, unknown>[]
      }
    }
    const items = payload.model?.data ?? []

    const entries: FileEntry[] = items.map((item) => {
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
    })

    return { ok: true, data: entries }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function uploadFiles(
  env: StoredEnv,
  localPaths: string[],
  remotePath: string,
  overwrite: boolean,
  onProgress: (transferred: number, total: number, currentFile: string) => void
): Promise<IPCResult> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const allFiles = await collectLocalFiles(localPaths)
    const totalBytes = allFiles.reduce((sum, f) => sum + f.size, 0)
    let transferred = 0

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE)
      const formData = new FormData()
      formData.append('path', normalizeRemotePath(remotePath).replace(/^\//, ''))
      formData.append('skipExistingFiles', String(!overwrite))
      formData.append('allowOverwrite', String(overwrite))

      for (const file of batch) {
        const chunks: Buffer[] = []
        for await (const chunk of createReadStream(file.localPath, { highWaterMark: 256 * 1024 })) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
          chunks.push(buf)
          transferred += buf.byteLength
          onProgress(transferred, totalBytes, file.remoteRelativePath)
        }
        formData.append('files', new Blob([Buffer.concat(chunks)]), file.remoteRelativePath)
      }

      const fileNames = batch.map((f) => f.remoteRelativePath).join(', ')
      const uploadUrl = `${baseUrl(env)}/Admin/Api/Upload?createMissingDirectories=true&createEmptyFiles=false`
      const response = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: authHeader }, body: formData })
      const bodyText = await response.text()
      debugLog('POST', uploadUrl, response.status, `path=${normalizeRemotePath(remotePath).replace(/^\//, '')} files=[${fileNames}] response=${bodyText.slice(0, 500)}`)
      if (!response.ok) return { ok: false, error: `Upload failed with status ${response.status}: ${bodyText.slice(0, 200)}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function downloadFile(env: StoredEnv, remotePath: string, localPath: string): Promise<IPCResult> {
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
    debugLog('POST', url, JSON.stringify(body))
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    debugLog('POST', url, response.status)
    if (!response.ok) {
      const errText = await response.text()
      return { ok: false, error: `Transfer failed with status ${response.status}: ${errText.slice(0, 200)}` }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') ?? ''

    await mkdir(localPath, { recursive: true })

    // Single file: server returns raw bytes (application/octet-stream), not a ZIP
    if (!contentType.includes('zip') && (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)) {
      const fileName = isFile ? basename(remotePath) : basename(remotePath) + '.bin'
      await writeFile(join(localPath, fileName), buffer)
      return { ok: true }
    }

    const archive = new AdmZip(buffer)
    archive.extractAllTo(localPath, true)
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

export async function copyRemote(env: StoredEnv, source: string, destination: string): Promise<IPCResult> {
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

export async function moveRemote(
  env: StoredEnv,
  source: string,
  destination: string,
  overwrite: boolean
): Promise<IPCResult> {
  try {
    const authHeader = await resolveAuthHeader(env)
    const response = await fetch(`${baseUrl(env)}/Admin/Api/Management/Files/Move`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: toApiPath(source),
        destination: toApiPath(destination),
        overwrite
      })
    })
    if (!response.ok) return { ok: false, error: `Move failed with status ${response.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
