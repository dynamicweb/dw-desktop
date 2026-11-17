import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ConnectionStatus,
  CredentialHints,
  FileEntry,
  IPCResult,
  PaneState,
  SavedSync,
  StoredEnv,
  SyncPlan,
  SyncPlanProgress,
  SyncRequest,
  SyncRunItem,
  SyncRunResult,
  ThemeMode,
  TransferJob,
  UploadConflictInfo
} from '../shared/types'

interface ProgressPayload {
  jobId: string
  transferred: number
  total: number
  currentFile: string
}

interface DonePayload {
  jobId: string
  ok: boolean
  error?: string
  errorKind?: 'permission'
  uploaded?: number
  skipped?: number
  skippedNames?: string[]
  excludedNames?: string[]
  cancelled?: boolean
}

interface SyncFinishedPayload extends SyncRunResult {
  planId: string
}

const dw = {
  env: {
    list: (): Promise<IPCResult<StoredEnv[]>> => ipcRenderer.invoke('env:list'),
    add: (env: StoredEnv): Promise<IPCResult> => ipcRenderer.invoke('env:add', env),
    remove: (name: string): Promise<IPCResult> => ipcRenderer.invoke('env:remove', name),
    update: (env: StoredEnv): Promise<IPCResult> => ipcRenderer.invoke('env:update', env),
    setActive: (name: string): Promise<IPCResult> => ipcRenderer.invoke('env:setActive', name),
    getActive: (): Promise<IPCResult<StoredEnv>> => ipcRenderer.invoke('env:getActive')
  },
  auth: {
    test: (env: StoredEnv, credentials: unknown): Promise<IPCResult<ConnectionStatus>> =>
      ipcRenderer.invoke('auth:test', { env, credentials }),
    saveCredentials: (envName: string, credentials: unknown): Promise<IPCResult> =>
      ipcRenderer.invoke('auth:saveCredentials', { envName, credentials }),
    loginPassword: (env: StoredEnv, username: string, password: string): Promise<IPCResult> =>
      ipcRenderer.invoke('auth:loginPassword', { env, username, password }),
    getHints: (envName: string): Promise<IPCResult<CredentialHints>> =>
      ipcRenderer.invoke('auth:getHints', { envName })
  },
  files: {
    list: (envName: string, path: string): Promise<IPCResult<FileEntry[]>> =>
      ipcRenderer.invoke('files:list', { envName, path }),
    upload: (
      envName: string,
      localPaths: string[],
      remotePath: string,
      overwrite: boolean,
      jobId: string,
      ifMatch?: string | null
    ): void => {
      ipcRenderer.send('files:upload', {
        envName,
        localPaths,
        remotePath,
        overwrite,
        jobId,
        ifMatch
      })
    },
    checkConflicts: (
      envName: string,
      localPaths: string[],
      remotePath: string
    ): Promise<IPCResult<UploadConflictInfo>> =>
      ipcRenderer.invoke('files:checkConflicts', { envName, localPaths, remotePath }),
    download: (
      envName: string,
      remotePath: string,
      localPath: string,
      jobId?: string
    ): Promise<IPCResult> =>
      ipcRenderer.invoke('files:download', { envName, remotePath, localPath, jobId }),
    cancel: (jobIds: string[]): void => ipcRenderer.send('files:cancel', { jobIds }),
    delete: (envName: string, path: string, ifMatch?: string | null): Promise<IPCResult> =>
      ipcRenderer.invoke('files:delete', { envName, path, ifMatch }),
    copy: (envName: string, source: string, destination: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:copy', { envName, source, destination }),
    rename: (envName: string, filePath: string, newName: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:rename', { envName, filePath, newName }),
    move: (envName: string, sourcePath: string, targetDir: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:move', { envName, sourcePath, targetDir }),
    createDirectory: (envName: string, parentPath: string, name: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:createDirectory', { envName, parentPath, name })
  },
  sync: {
    plan: (request: SyncRequest, previewId: string): Promise<IPCResult<SyncPlan>> =>
      ipcRenderer.invoke('sync:plan', { request, previewId }),
    cancelPlan: (previewId: string): void => ipcRenderer.send('sync:cancelPlan', previewId),
    run: (planId: string, items: SyncRunItem[]): void =>
      ipcRenderer.send('sync:run', { planId, items }),
    inspectLocal: (localPath: string): Promise<IPCResult<{ gitignore: boolean }>> =>
      ipcRenderer.invoke('sync:inspectLocal', localPath),
    makeDirectory: (
      envName: string,
      target: { remotePath?: string; localPath?: string }
    ): Promise<IPCResult> => ipcRenderer.invoke('sync:makeDirectory', { envName, ...target })
  },
  activity: {
    load: (): Promise<TransferJob[]> => ipcRenderer.invoke('activity:load'),
    save: (jobs: TransferJob[]): void => ipcRenderer.send('activity:save', jobs)
  },
  fs: {
    list: (dirPath: string): Promise<IPCResult<FileEntry[]>> =>
      ipcRenderer.invoke('fs:list', { dirPath }),
    homedir: (): Promise<string> => ipcRenderer.invoke('fs:homedir'),
    openDialog: (props: string[]): Promise<IPCResult<{ paths: string[] }>> =>
      ipcRenderer.invoke('fs:showOpenDialog', { properties: props }),
    reveal: (path: string): Promise<IPCResult> => ipcRenderer.invoke('fs:reveal', { path }),
    getPathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  platform: process.platform as NodeJS.Platform,
  on: {
    filesProgress: (cb: (payload: ProgressPayload) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: ProgressPayload): void => cb(payload)
      ipcRenderer.on('files:progress', listener)
      return () => ipcRenderer.removeListener('files:progress', listener)
    },
    filesDone: (cb: (payload: DonePayload) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: DonePayload): void => cb(payload)
      ipcRenderer.on('files:done', listener)
      return () => ipcRenderer.removeListener('files:done', listener)
    },
    syncFinished: (cb: (payload: SyncFinishedPayload) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: SyncFinishedPayload): void =>
        cb(payload)
      ipcRenderer.on('sync:finished', listener)
      return () => ipcRenderer.removeListener('sync:finished', listener)
    },
    syncPlanProgress: (cb: (payload: SyncPlanProgress) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: SyncPlanProgress): void =>
        cb(payload)
      ipcRenderer.on('sync:planProgress', listener)
      return () => ipcRenderer.removeListener('sync:planProgress', listener)
    },
    debugEntry: (cb: (entry: unknown) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, entry: unknown): void => cb(entry)
      ipcRenderer.on('debug:entry', listener)
      return () => ipcRenderer.removeListener('debug:entry', listener)
    },
    updaterAvailable: (cb: (info: { version: string }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, info: { version: string }): void => cb(info)
      ipcRenderer.on('updater:available', listener)
      return () => ipcRenderer.removeListener('updater:available', listener)
    },
    updaterDownloaded: (cb: (info: { version: string }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, info: { version: string }): void => cb(info)
      ipcRenderer.on('updater:downloaded', listener)
      return () => ipcRenderer.removeListener('updater:downloaded', listener)
    }
  },
  updater: {
    installNow: (): void => ipcRenderer.send('updater:installNow')
  },
  debug: {
    getAll: (): Promise<unknown[]> => ipcRenderer.invoke('debug:getAll'),
    clear: (): Promise<void> => ipcRenderer.invoke('debug:clear')
  },
  settings: {
    getTheme: (): Promise<IPCResult<ThemeMode>> => ipcRenderer.invoke('settings:getTheme'),
    setTheme: (theme: ThemeMode): Promise<IPCResult> =>
      ipcRenderer.invoke('settings:setTheme', theme),
    getPaneState: (envName: string): Promise<IPCResult<PaneState>> =>
      ipcRenderer.invoke('settings:getPaneState', envName),
    setPaneState: (envName: string, patch: PaneState): Promise<IPCResult> =>
      ipcRenderer.invoke('settings:setPaneState', { envName, patch }),
    getSyncs: (envName: string): Promise<IPCResult<SavedSync[]>> =>
      ipcRenderer.invoke('settings:getSyncs', envName),
    saveSync: (envName: string, sync: SavedSync): Promise<IPCResult> =>
      ipcRenderer.invoke('settings:saveSync', { envName, sync }),
    deleteSync: (envName: string, id: string): Promise<IPCResult> =>
      ipcRenderer.invoke('settings:deleteSync', { envName, id })
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('dw', dw)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.dw = dw
}
