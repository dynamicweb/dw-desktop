export interface StoredEnv {
  name: string
  host: string
  protocol: 'http' | 'https'
  authType: 'apiKey' | 'oauth' | 'password'
}

export type ThemeMode = 'light' | 'dark' | 'auto'

export interface AppConfig {
  version: 1
  environments: StoredEnv[]
  activeEnv: string | null
  theme: ThemeMode
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
}

export interface TransferJob {
  id: string
  direction: 'upload' | 'download'
  label: string
  remotePath: string
  localPath: string
  status: 'queued' | 'active' | 'done' | 'error'
  transferred: number
  total: number
  error?: string
}

export interface IPCResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export interface ConnectionStatus {
  connected: boolean
  version?: string
  error?: string
}
