import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ConnectionStatus,
  CredentialHints,
  FileEntry,
  IPCResult,
  PaneState,
  RemoteListing,
  StoredEnv,
  ThemeMode
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
  uploaded?: number
  skipped?: number
  skippedNames?: string[]
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
    list: (envName: string, path: string, loadAll = false): Promise<IPCResult<RemoteListing>> =>
      ipcRenderer.invoke('files:list', { envName, path, loadAll }),
    upload: (
      envName: string,
      localPaths: string[],
      remotePath: string,
      overwrite: boolean,
      jobId: string
    ): void => {
      ipcRenderer.send('files:upload', { envName, localPaths, remotePath, overwrite, jobId })
    },
    download: (envName: string, remotePath: string, localPath: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:download', { envName, remotePath, localPath }),
    delete: (envName: string, path: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:delete', { envName, path }),
    copy: (envName: string, source: string, destination: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:copy', { envName, source, destination }),
    rename: (envName: string, filePath: string, newName: string): Promise<IPCResult> =>
      ipcRenderer.invoke('files:rename', { envName, filePath, newName })
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
      ipcRenderer.invoke('settings:setPaneState', { envName, patch })
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
