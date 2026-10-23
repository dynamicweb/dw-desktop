import { dialog, ipcMain, shell } from 'electron'
import { homedir } from 'os'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { getEnvs } from '../config'
import {
  listFiles,
  uploadFiles,
  downloadFile,
  deleteRemote,
  copyRemote,
  renameRemote,
  moveRemote,
  createRemoteDirectory,
  checkUploadConflicts
} from '../dw-api'
import { cancelJobs, releaseJobs, trackJobs } from '../cancellation'
import type { FileEntry, IPCResult, StoredEnv } from '../../shared/types'

export function getEnvOrError(envName: string): { env: StoredEnv } | IPCResult {
  const all = getEnvs()
  const env = all.find((e) => e.name === envName)
  if (!env) return { ok: false, error: `Environment "${envName}" is not configured` }
  return { env }
}

async function listLocalEntries(dirPath: string): Promise<FileEntry[]> {
  const children = await readdir(dirPath, { withFileTypes: true })
  const entries = await Promise.all(
    children.map(async (child) => {
      const childPath = join(dirPath, child.name)
      const type: 'file' | 'directory' = child.isDirectory() ? 'directory' : 'file'
      // stat() can fail on protected entries at the drive root (System Volume
      // Information, $Recycle.Bin, pagefile.sys, etc). Fall back to dirent info
      // so a single inaccessible entry doesn't break the whole listing.
      try {
        const childStat = await stat(childPath)
        return {
          name: child.name,
          path: childPath,
          type,
          size: childStat.isFile() ? childStat.size : undefined,
          modified: childStat.mtime.toISOString()
        }
      } catch {
        return { name: child.name, path: childPath, type }
      }
    })
  )
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Enumerates available drives on Windows (A:\ through Z:\). Detects each by
 * attempting `stat()` on its root in parallel. Empty array on non-Windows.
 */
async function listWindowsDrives(): Promise<FileEntry[]> {
  if (process.platform !== 'win32') return []
  const checks: Promise<FileEntry | null>[] = []
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const letter = String.fromCharCode(code)
    const root = `${letter}:\\`
    checks.push(
      stat(root)
        .then(() => ({ name: `${letter}:`, path: root, type: 'directory' as const }))
        .catch(() => null)
    )
  }
  const results = await Promise.all(checks)
  return results.filter((d): d is FileEntry => d !== null)
}

export function registerFileHandlers(): void {
  ipcMain.handle(
    'files:list',
    async (_event, { envName, path }: { envName: string; path: string }) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return listFiles(result.env, path)
    }
  )

  ipcMain.handle(
    'files:delete',
    async (
      _event,
      { envName, path, ifMatch }: { envName: string; path: string; ifMatch?: string | null }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return deleteRemote(result.env, path, ifMatch)
    }
  )

  ipcMain.handle(
    'files:copy',
    async (
      _event,
      { envName, source, destination }: { envName: string; source: string; destination: string }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return copyRemote(result.env, source, destination)
    }
  )

  ipcMain.handle(
    'files:rename',
    async (
      _event,
      { envName, filePath, newName }: { envName: string; filePath: string; newName: string }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return renameRemote(result.env, filePath, newName)
    }
  )

  ipcMain.handle(
    'files:move',
    async (
      _event,
      { envName, sourcePath, targetDir }: { envName: string; sourcePath: string; targetDir: string }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return moveRemote(result.env, sourcePath, targetDir)
    }
  )

  ipcMain.handle(
    'files:createDirectory',
    async (
      _event,
      { envName, parentPath, name }: { envName: string; parentPath: string; name: string }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return createRemoteDirectory(result.env, parentPath, name)
    }
  )

  ipcMain.handle(
    'files:checkConflicts',
    async (
      _event,
      {
        envName,
        localPaths,
        remotePath
      }: { envName: string; localPaths: string[]; remotePath: string }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return checkUploadConflicts(result.env, localPaths, remotePath)
    }
  )

  ipcMain.handle(
    'files:download',
    async (
      _event,
      {
        envName,
        remotePath,
        localPath,
        jobId
      }: { envName: string; remotePath: string; localPath: string; jobId?: string }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      const jobs = jobId ? [jobId] : []
      const controller = trackJobs(jobs)
      try {
        return await downloadFile(result.env, remotePath, localPath, controller.signal)
      } finally {
        releaseJobs(jobs)
      }
    }
  )

  ipcMain.on('files:cancel', (_event, { jobIds }: { jobIds: string[] }) => {
    cancelJobs(jobIds)
  })

  // Upload uses ipcMain.on (fire-and-forget with progress events)
  ipcMain.on(
    'files:upload',
    (
      event,
      {
        envName,
        localPaths,
        remotePath,
        overwrite,
        jobId,
        ifMatch
      }: {
        envName: string
        localPaths: string[]
        remotePath: string
        overwrite: boolean
        jobId: string
        ifMatch?: string | null
      }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) {
        event.sender.send('files:done', { jobId, ok: false, error: result.error })
        return
      }

      const controller = trackJobs([jobId])
      void uploadFiles(
        result.env,
        localPaths,
        remotePath,
        overwrite,
        (transferred, total, currentFile) => {
          event.sender.send('files:progress', { jobId, transferred, total, currentFile })
        },
        controller.signal,
        ifMatch
      )
        .then((uploadResult) => {
          event.sender.send('files:done', {
            jobId,
            ok: uploadResult.ok,
            error: uploadResult.error,
            cancelled: controller.signal.aborted,
            uploaded: uploadResult.data?.uploaded,
            skipped: uploadResult.data?.skipped,
            skippedNames: uploadResult.data?.skippedNames,
            excludedNames: uploadResult.data?.excludedNames
          })
        })
        .catch((err: Error) => {
          event.sender.send('files:done', { jobId, ok: false, error: err.message })
        })
        .finally(() => releaseJobs([jobId]))
    }
  )

  ipcMain.handle(
    'fs:list',
    async (_event, { dirPath }: { dirPath: string }): Promise<IPCResult<FileEntry[]>> => {
      try {
        // Empty path = "above the drive root" view (Windows drives or Unix /).
        if (!dirPath) {
          if (process.platform === 'win32') {
            return { ok: true, data: await listWindowsDrives() }
          }
          return { ok: true, data: await listLocalEntries('/') }
        }
        return { ok: true, data: await listLocalEntries(dirPath) }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('fs:homedir', (): string => {
    return homedir()
  })

  ipcMain.handle(
    'fs:showOpenDialog',
    async (
      _event,
      { properties }: { properties: string[] }
    ): Promise<IPCResult<{ paths: string[] }>> => {
      const result = await dialog.showOpenDialog({
        properties: properties as Electron.OpenDialogOptions['properties']
      })
      return { ok: true, data: { paths: result.canceled ? [] : result.filePaths } }
    }
  )

  ipcMain.handle('fs:reveal', (_event, { path }: { path: string }): IPCResult => {
    try {
      shell.showItemInFolder(path)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
