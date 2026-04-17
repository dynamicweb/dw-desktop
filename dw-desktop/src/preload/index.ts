import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ConnectionStatus,
  FileEntry,
  IPCResult,
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
    test: (
      env: StoredEnv,
      credentials: unknown
    ): Promise<IPCResult<ConnectionStatus>> =>
      ipcRenderer.invoke('auth:test', { env, credentials }),
    saveCredentials: (envName: string, credentials: unknown): Promise<IPCResult> =>
      ipcRenderer.invoke('auth:saveCredentials', { envName, credentials }),
    loginPassword: (env: StoredEnv, username: string, password: string): Promise<IPCResult> =>
      ipcRenderer.invoke('auth:loginPassword', { env, username, password })
  },
  files: {
    list: (envName: string, path: string): Promise<IPCResult<FileEntry[]>> =>
      ipcRenderer.invoke('files:list', { envName, path }),
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
    move: (
      envName: string,
      source: string,
      destination: string,
      overwrite: boolean
    ): Promise<IPCResult> =>
      ipcRenderer.invoke('files:move', { envName, source, destination, overwrite })
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
    }
  },
  debug: {
    getAll: (): Promise<unknown[]> => ipcRenderer.invoke('debug:getAll')
  },
  settings: {
    getTheme: (): Promise<IPCResult<ThemeMode>> => ipcRenderer.invoke('settings:getTheme'),
    setTheme: (theme: ThemeMode): Promise<IPCResult> => ipcRenderer.invoke('settings:setTheme', theme)
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
