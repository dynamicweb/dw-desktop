export interface StoredEnv {
  /** Stable identifier. Used as the key for credentials, paneState, and IPC lookups. Immutable once created. */
  name: string
  /** User-editable label shown in the UI. Falls back to `name` when empty. */
  displayName?: string
  host: string
  protocol: 'http' | 'https'
  authType: 'apiKey' | 'oauth' | 'password'
  localStartPath?: string
  /** What the site is used for. Production gets a visible warning on writes. Unset = development. */
  kind?: EnvKind
}

export type EnvKind = 'production' | 'staging' | 'development'

export const ENV_KINDS: EnvKind[] = ['production', 'staging', 'development']

export function envKind(env: Pick<StoredEnv, 'kind'>): EnvKind {
  return env.kind ?? 'development'
}

export function envKindLabel(kind: EnvKind): string {
  switch (kind) {
    case 'production':
      return 'Production'
    case 'staging':
      return 'Staging'
    case 'development':
      return 'Development'
  }
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
  /** Remote folders pinned in the sidebar (virtual paths, rooted at '/'). */
  pinned?: string[]
  /** Most recently visited remote folders, newest first. */
  recent?: string[]
}

export type SyncDirection = 'push' | 'pull'

/** A folder pair + direction the user saved to re-run from the sidebar. */
export interface SavedSync {
  id: string
  name: string
  localPath: string
  /** Remote folder (virtual path, rooted at '/'). */
  remotePath: string
  direction: SyncDirection
  compareContent: boolean
  deleteExtra: boolean
  /** Skip the built-in junk list (.git, node_modules, .DS_Store…). Unset = on. */
  useDefaultExcludes?: boolean
  /** Skip what .gitignore files leave out. Unset = off. */
  useGitignore?: boolean
  /** Extra exclude patterns, gitignore syntax. */
  exclude?: string[]
  lastRunAt?: string
}

export interface AppConfig {
  version: 1
  environments: StoredEnv[]
  activeEnv: string | null
  theme: ThemeMode
  paneState: Record<string, PaneState>
  /** Saved syncs per environment name. */
  syncs?: Record<string, SavedSync[]>
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
}

export type DiffStatus = 'local-only' | 'remote-only' | 'different' | 'identical'

export type CompareMode = 'off' | 'auto' | 'on'

export interface TransferJob {
  id: string
  batchId: string
  /** Environment the job runs against. */
  envName: string
  /** Shown as the batch title in Activity, e.g. "Deploy Swift-v2". Defaults to a generated one. */
  batchTitle?: string
  /** Set for jobs created by a sync run. */
  fromSync?: boolean
  /** A sync folder item: it creates that folder and nothing below it. */
  directoryOnly?: boolean
  direction: 'upload' | 'download' | 'delete'
  label: string
  /**
   * Upload: remote target folder. Download: remote file or folder. Delete: remote path.
   * Together with localPath and overwrite this is enough to retry the job.
   */
  remotePath: string
  /** Upload: local file or folder. Download: local target folder. */
  localPath: string
  overwrite?: boolean
  /**
   * Sync items: the server version (eTag) the preview saw. A retry replaces or deletes
   * the server file only while it is still that version.
   */
  ifMatch?: string | null
  status: 'queued' | 'active' | 'done' | 'error' | 'skipped' | 'cancelled'
  transferred: number
  total: number
  error?: string
  errorKind?: ErrorKind
  /** For uploads: base names the server skipped because they already existed. */
  skippedNames?: string[]
  /** For uploads: junk files and folders left out of an uploaded folder. */
  excludedNames?: string[]
  startedAt: number
}

/** What a sync would do with one path. */
export type SyncAction = 'upload' | 'download' | 'replace' | 'delete' | 'conflict' | 'skip'

export interface SyncItem {
  /** Path relative to the synced folders, '/' separated. */
  path: string
  type: 'file' | 'directory'
  action: SyncAction
  /** Plain-language reason shown in the preview. */
  reason: string
  /** Bytes that would be transferred (the source side's size). */
  size?: number
  /** Whether the item is included by default. Conflicts are never included until resolved. */
  include: boolean
  /** Remote eTag seen when planning; guards replaces and deletes (If-Match). */
  remoteETag?: string | null
}

export interface SyncRequest {
  envName: string
  localPath: string
  /** Remote folder (virtual path, rooted at '/'). */
  remotePath: string
  direction: SyncDirection
  compareContent: boolean
  deleteExtra: boolean
  /** Unset = on. */
  useDefaultExcludes?: boolean
  /** Unset = off. */
  useGitignore?: boolean
  exclude?: string[]
}

/** A path an exclude rule kept out of a sync. A folder stands for everything in it. */
export interface ExcludedEntry {
  path: string
  type: 'file' | 'directory'
  side: 'local' | 'remote' | 'both'
  /** Where the rule came from and the rule, e.g. ".gitignore: dist/". */
  rule: string
}

export interface SyncPlan {
  /** Handle for running this plan; the main process keeps the details (local paths, hashes). */
  id: string
  request: SyncRequest
  items: SyncItem[]
  unchanged: number
  /** True when this folder pair was synced before, so conflicts can be detected. */
  syncedBefore: boolean
  /** Paths left out by exclude rules, top-level only. Neither transferred nor deleted. */
  excluded: ExcludedEntry[]
  /** Whether a .dwignore in the local folder was used. */
  dwignore: boolean
  /** How many .gitignore files were used. */
  gitignores: number
}

/** One planned item to execute, with how a conflict was resolved. */
export interface SyncRunItem {
  jobId: string
  /** SyncItem.path of the planned item. */
  path: string
  /** For conflicts: 'local' = keep this computer's version, 'remote' = keep the server's. */
  resolution?: 'local' | 'remote'
}

export interface SyncRunResult {
  done: number
  skipped: number
  failed: number
  cancelled: boolean
}

/** Why something failed, where the UI words it differently: 'permission' = 403 FORBIDDEN. */
export type ErrorKind = 'permission'

export interface IPCResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  errorKind?: ErrorKind
}

/** Outcome counts for an upload batch (one files:upload invocation). */
export interface UploadSummary {
  uploaded: number
  /** Files not sent because they already exist remotely (overwrite off). */
  skipped: number
  /** Target-relative paths of the skipped files. */
  skippedNames: string[]
  /** Target-relative paths left out by the built-in junk list (a folder stands for its contents). */
  excludedNames: string[]
  failed: number
  /** Message of the first failure, when failed > 0. */
  firstError?: string
}

/** Result of a pre-upload conflict check against the remote target folder. */
export interface UploadConflictInfo {
  /** Total number of local files that would be uploaded. */
  totalFiles: number
  /** Target-relative paths of files that already exist on the remote. */
  conflicts: string[]
}

export interface ConnectionStatus {
  connected: boolean
  version?: string
  error?: string
  /** Signed in, but with something the user should know (e.g. no access to the root). */
  notice?: string
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
