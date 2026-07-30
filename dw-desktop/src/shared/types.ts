export interface StoredEnv {
  /** Stable identifier. Used as the key for credentials, paneState, and IPC lookups. Immutable once created. */
  name: string
  /** User-editable label shown in the UI. Falls back to `name` when empty. */
  displayName?: string
  host: string
  protocol: 'http' | 'https'
  authType: 'apiKey' | 'oauth' | 'password'
  localStartPath?: string
  /**
   * How many entries to fetch per page when listing a remote folder. Folders
   * larger than this show a "load all" prompt instead of loading eagerly.
   * Optional; defaults to 500 when unset.
   */
  listPageSize?: number
}

export function envLabel(env: StoredEnv): string {
  return env.displayName?.trim() || env.name
}

/** Short label for an environment's authentication type, shown as a badge in the UI. */
export function authTypeLabel(authType: StoredEnv['authType']): string {
  switch (authType) {
    case 'apiKey':
      return 'API key'
    case 'oauth':
      return 'OAuth'
    case 'password':
      return 'Username'
  }
}

export type ThemeMode = 'light' | 'dark' | 'auto'

export interface PaneState {
  remotePath?: string
  localPath?: string
}

export interface AppConfig {
  version: 1
  environments: StoredEnv[]
  activeEnv: string | null
  theme: ThemeMode
  paneState: Record<string, PaneState>
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
}

/**
 * A remote directory listing. The server pages results, so `entries` may hold
 * only the first page: `totalCount` is the true number of items in the folder
 * and `hasMore` indicates that more entries exist beyond what was loaded.
 */
export interface RemoteListing {
  entries: FileEntry[]
  /** Total number of items in the remote folder (reported by the server). */
  totalCount: number
  /** True when `entries` is a partial page and more items remain unloaded. */
  hasMore: boolean
}

/** Result of an upload: how many files were written vs. skipped as duplicates. */
export interface UploadOutcome {
  uploaded: number
  skipped: number
  /** Base names of files that already existed and were left untouched. */
  skippedNames: string[]
}

export type DiffStatus = 'local-only' | 'remote-only' | 'different' | 'identical'

export type CompareMode = 'off' | 'auto' | 'on'

export interface TransferJob {
  id: string
  batchId: string
  direction: 'upload' | 'download'
  label: string
  remotePath: string
  localPath: string
  status: 'queued' | 'active' | 'done' | 'error' | 'skipped'
  transferred: number
  total: number
  error?: string
  /** For uploads: base names the server skipped because they already existed. */
  skippedNames?: string[]
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

/** Non-secret, safe-to-display parts of an environment's stored credentials. */
export interface CredentialHints {
  /** OAuth client id (not a secret). */
  clientId: string | null
  /** Saved username for password auth. */
  username: string | null
  /** Obfuscated preview of the API key (e.g. "abcd…wxyz") — never the full key. */
  apiKeyHint: string | null
}
