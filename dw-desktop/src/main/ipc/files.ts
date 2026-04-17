import { dialog, ipcMain } from 'electron'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { getActiveEnv, getEnvs } from '../config'
import { listFiles, uploadFiles, downloadFile, deleteRemote, copyRemote, moveRemote } from '../dw-api'
import type { FileEntry, IPCResult, StoredEnv } from '../../shared/types'

function getEnvOrError(envName: string): { env: StoredEnv } | IPCResult {
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
      const childStat = await stat(childPath)
      return {
        name: child.name,
        path: childPath,
        type: (child.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
        size: childStat.isFile() ? childStat.size : undefined,
        modified: childStat.mtime.toISOString()
      }
    })
  )
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function registerFileHandlers(): void {
  ipcMain.handle('files:list', async (_event, { envName, path }: { envName: string; path: string }) => {
    const result = getEnvOrError(envName)
    if ('ok' in result) return result
    return listFiles(result.env, path)
  })

  ipcMain.handle('files:delete', async (_event, { envName, path }: { envName: string; path: string }) => {
    const result = getEnvOrError(envName)
    if ('ok' in result) return result
    return deleteRemote(result.env, path)
  })

  ipcMain.handle(
    'files:copy',
    async (_event, { envName, source, destination }: { envName: string; source: string; destination: string }) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return copyRemote(result.env, source, destination)
    }
  )

  ipcMain.handle(
    'files:move',
    async (
      _event,
      { envName, source, destination, overwrite }: { envName: string; source: string; destination: string; overwrite: boolean }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return moveRemote(result.env, source, destination, overwrite)
    }
  )

  ipcMain.handle(
    'files:download',
    async (_event, { envName, remotePath, localPath }: { envName: string; remotePath: string; localPath: string }) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) return result
      return downloadFile(result.env, remotePath, localPath)
    }
  )

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
        jobId
      }: { envName: string; localPaths: string[]; remotePath: string; overwrite: boolean; jobId: string }
    ) => {
      const result = getEnvOrError(envName)
      if ('ok' in result) {
        event.sender.send('files:done', { jobId, ok: false, error: result.error })
        return
      }

      void uploadFiles(result.env, localPaths, remotePath, overwrite, (transferred, total, currentFile) => {
        event.sender.send('files:progress', { jobId, transferred, total, currentFile })
      })
        .then((uploadResult) => {
          event.sender.send('files:done', { jobId, ok: uploadResult.ok, error: uploadResult.error })
        })
        .catch((err: Error) => {
          event.sender.send('files:done', { jobId, ok: false, error: err.message })
        })
    }
  )

  ipcMain.handle('fs:list', async (_event, { dirPath }: { dirPath: string }): Promise<IPCResult<FileEntry[]>> => {
    try {
      return { ok: true, data: await listLocalEntries(dirPath) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:homedir', (): string => {
    return homedir()
  })

  ipcMain.handle(
    'fs:showOpenDialog',
    async (_event, { properties }: { properties: string[] }): Promise<IPCResult<{ paths: string[] }>> => {
      const result = await dialog.showOpenDialog({
        properties: properties as Electron.OpenDialogOptions['properties']
      })
      return { ok: true, data: { paths: result.canceled ? [] : result.filePaths } }
    }
  )

  // Keep unused references to avoid lint errors
  void randomUUID
  void getActiveEnv
}
