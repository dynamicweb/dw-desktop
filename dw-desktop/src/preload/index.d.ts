import type { ConnectionStatus, FileEntry, IPCResult, PaneState, StoredEnv, ThemeMode } from '../shared/types'

export interface ProgressPayload {
  jobId: string
  transferred: number
  total: number
  currentFile: string
}

export interface DonePayload {
  jobId: string
  ok: boolean
  error?: string
}

export interface DWDesktopAPI {
  env: {
    list(): Promise<IPCResult<StoredEnv[]>>
    add(env: StoredEnv): Promise<IPCResult>
    remove(name: string): Promise<IPCResult>
    update(env: StoredEnv): Promise<IPCResult>
    setActive(name: string): Promise<IPCResult>
    getActive(): Promise<IPCResult<StoredEnv>>
  }
  auth: {
    test(env: StoredEnv, credentials: unknown): Promise<IPCResult<ConnectionStatus>>
    saveCredentials(envName: string, credentials: unknown): Promise<IPCResult>
    loginPassword(env: StoredEnv, username: string, password: string): Promise<IPCResult>
  }
  files: {
    list(envName: string, path: string): Promise<IPCResult<FileEntry[]>>
    upload(
      envName: string,
      localPaths: string[],
      remotePath: string,
      overwrite: boolean,
      jobId: string
    ): void
    download(envName: string, remotePath: string, localPath: string): Promise<IPCResult>
    delete(envName: string, path: string): Promise<IPCResult>
    copy(envName: string, source: string, destination: string): Promise<IPCResult>
    rename(envName: string, filePath: string, newName: string): Promise<IPCResult>
  }
  fs: {
    list(dirPath: string): Promise<IPCResult<FileEntry[]>>
    homedir(): Promise<string>
    openDialog(props: string[]): Promise<IPCResult<{ paths: string[] }>>
    reveal(path: string): Promise<IPCResult>
    getPathForFile(file: File): string
  }
  platform: NodeJS.Platform
  on: {
    filesProgress(cb: (payload: ProgressPayload) => void): () => void
    filesDone(cb: (payload: DonePayload) => void): () => void
    debugEntry(cb: (entry: DebugEntry) => void): () => void
  }
  debug: {
    getAll(): Promise<DebugEntry[]>
  }
  settings: {
    getTheme(): Promise<IPCResult<ThemeMode>>
    setTheme(theme: ThemeMode): Promise<IPCResult>
    getPaneState(envName: string): Promise<IPCResult<PaneState>>
    setPaneState(envName: string, patch: PaneState): Promise<IPCResult>
  }
}

export interface DebugEntry {
  ts: string
  method: string
  url: string
  status?: number | string
  requestBody?: string
  responseBody?: string
}

declare global {
  interface Window {
    dw: DWDesktopAPI
  }
}
