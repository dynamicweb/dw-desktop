# Phase 1 implementation prompt

Implement the complete Phase 1 of the DW File Manager desktop app: config/credential storage, authentication, IPC layer, and the full UI. Work through the sections in order. Do not skip ahead.

---

## Section 1 — Shared types

Create `src/shared/types.ts`. This file is imported by both main and renderer. No Electron imports, no Node imports.

```ts
export interface StoredEnv {
  name: string;
  host: string;
  protocol: 'http' | 'https';
  authType: 'apiKey' | 'oauth' | 'password';
}

export interface AppConfig {
  version: 1;
  environments: StoredEnv[];
  activeEnv: string | null;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

export interface TransferJob {
  id: string;
  direction: 'upload' | 'download';
  label: string;
  remotePath: string;
  localPath: string;
  status: 'queued' | 'active' | 'done' | 'error';
  transferred: number;
  total: number;
  error?: string;
}

export interface IPCResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  version?: string;
  error?: string;
}
```

---

## Section 2 — Config

Create `src/main/config.ts`.

- Import `app` from `electron` to call `app.getPath('userData')`. Config file is `{userData}/config.json`.
- On first run the file does not exist — return a default config, do not throw.
- Write atomically: write to `config.json.tmp`, then `fs.renameSync` to `config.json`.
- Never store secrets in this file.

Export these functions:

```ts
function loadConfig(): AppConfig
function saveConfig(config: AppConfig): void
function getEnvs(): StoredEnv[]
function getActiveEnv(): StoredEnv | null
function addEnv(env: StoredEnv): void        // appends, saves
function removeEnv(name: string): void       // removes, saves; caller must also call deleteAllCredentials
function setActiveEnv(name: string): void    // saves
function updateEnv(env: StoredEnv): void     // replaces by name, saves
```

Call `loadConfig()` once on import and keep the result in module-level state. All getters read from that state. All writers mutate state then call `saveConfig`.

---

## Section 3 — Credentials

Create `src/main/credentials.ts`. Uses `keytar`. Service name is always `'dw-desktop'`. Account key format: `'{envName}:{type}'` where type is `apiKey`, `oauthClientId`, or `oauthClientSecret`.

```ts
async function saveApiKey(envName: string, apiKey: string): Promise<void>
async function getApiKey(envName: string): Promise<string | null>

async function saveOAuthCredentials(envName: string, clientId: string, clientSecret: string): Promise<void>
async function getOAuthCredentials(envName: string): Promise<{ clientId: string; clientSecret: string } | null>

async function deleteAllCredentials(envName: string): Promise<void>
// deletes apiKey, oauthClientId, oauthClientSecret for this env — call on removeEnv
```

---

## Section 4 — Auth

Create `src/main/auth.ts`.

Export one function:

```ts
async function resolveAuthHeader(env: StoredEnv): Promise<string>
```

Behaviour by `env.authType`:

- `'apiKey'`: get key from keytar → return `'Bearer {key}'`. Throw a descriptive error if not found.
- `'oauth'`: check in-memory cache (`Map<string, { token: string; expiresAt: number }>`). If cached and more than 60 seconds from expiry, return `'Bearer {token}'`. Otherwise fetch a new token: `POST {protocol}://{host}/Admin/OAuth/token` with JSON body `{ grant_type: 'client_credentials', client_id, client_secret }`. Parse `token` (or `Token`) and `expires` (or `Expires`) from the response. Cache the result. Return `'Bearer {token}'`. Tokens are never written to disk.
- `'password'`: same as `'apiKey'` — the API key was stored in keytar after login.

Also export:

```ts
async function testConnection(env: StoredEnv, credentials: TestCredentials): Promise<ConnectionStatus>
```

Where:

```ts
type TestCredentials =
  | { authType: 'apiKey'; apiKey: string }
  | { authType: 'oauth'; clientId: string; clientSecret: string }
  | { authType: 'password'; username: string; password: string }
```

This function does NOT read from keytar — it uses the credentials passed directly so the user can test before saving. For password auth, POST to `/Admin/Authentication/Login` with URL-encoded body `Username={u}&Password={p}`, follow the redirect, extract the session cookie, then call `/Admin/Api/Management/HealthCheck` to confirm access. On success return `{ connected: true, version: string }`. On failure return `{ connected: false, error: string }`.

---

## Section 5 — Management API client

Create `src/main/dw-api.ts`.

All methods accept `env: StoredEnv` as first argument. They call `resolveAuthHeader(env)` internally to get the auth header. All return `Promise<IPCResult<T>>`. Never throw — catch errors and return `{ ok: false, error: message }`.

Base URL helper: `function baseUrl(env: StoredEnv): string` → `{protocol}://{host}`

```ts
async function listFiles(env: StoredEnv, path: string): Promise<IPCResult<FileEntry[]>>
// GET /Admin/Api/Management/Files/List?path={path}
// Map response to FileEntry[]

async function uploadFiles(
  env: StoredEnv,
  localPaths: string[],
  remotePath: string,
  overwrite: boolean,
  onProgress: (transferred: number, total: number, currentFile: string) => void
): Promise<IPCResult>
// POST /Admin/Api/Upload?createMissingDirectories=true&createEmptyFiles=false
// multipart/form-data with fields: path={remotePath}, skipExistingFiles={!overwrite}, allowOverwrite={overwrite}, files[]=...
// Chunk localPaths into batches of 300 (matches CLI behaviour). Call onProgress after each file.

async function downloadFile(env: StoredEnv, remotePath: string, localPath: string): Promise<IPCResult>
// GET /Admin/Api/Management/Files/Export?path={remotePath}&recursive=true
// Response is a .zip stream. Extract to localPath using adm-zip.

async function deleteRemote(env: StoredEnv, path: string): Promise<IPCResult>
// DELETE /Admin/Api/Management/Files/Delete?path={path}

async function copyRemote(env: StoredEnv, source: string, destination: string): Promise<IPCResult>
// POST /Admin/Api/Management/Files/Copy  body: { source, destination }

async function moveRemote(env: StoredEnv, source: string, destination: string, overwrite: boolean): Promise<IPCResult>
// POST /Admin/Api/Management/Files/Move  body: { source, destination, overwrite }
```

---

## Section 6 — IPC handlers

Create `src/main/ipc/env.ts`, `src/main/ipc/auth.ts`, and `src/main/ipc/files.ts`. Register all handlers in `src/main/index.ts` by importing and calling a `registerHandlers()` from each file.

### env.ts

```
ipcMain.handle('env:list')              → getEnvs()
ipcMain.handle('env:add', env)          → addEnv(env)
ipcMain.handle('env:remove', name)      → removeEnv(name) + deleteAllCredentials(name)
ipcMain.handle('env:update', env)       → updateEnv(env)
ipcMain.handle('env:setActive', name)   → setActiveEnv(name)
ipcMain.handle('env:getActive')         → getActiveEnv()
```

All return `IPCResult`.

### auth.ts

```
ipcMain.handle('auth:test', { env, credentials })
→ testConnection(env, credentials) → IPCResult<ConnectionStatus>

ipcMain.handle('auth:saveCredentials', { envName, credentials })
→ save to keytar based on authType; return IPCResult

ipcMain.handle('auth:loginPassword', { env, username, password })
→ POST to DW login, obtain API key, save via saveApiKey(envName, key); return IPCResult
```

### files.ts

```
ipcMain.handle('files:list', { envName, path })
ipcMain.handle('files:delete', { envName, path })
ipcMain.handle('files:copy', { envName, source, destination })
ipcMain.handle('files:move', { envName, source, destination, overwrite })
ipcMain.handle('files:download', { envName, remotePath, localPath })
```

For upload, do NOT use ipcMain.handle. Instead use `ipcMain.on('files:upload', ...)` and fire progress events back with `event.sender.send('files:progress', { jobId, transferred, total, currentFile })` and `event.sender.send('files:done', { jobId, ok, error? })`.

For local filesystem browsing:

```
ipcMain.handle('fs:list', { dirPath })
→ read directory with fs/promises, return IPCResult<FileEntry[]> with type, size, modified

ipcMain.handle('fs:homedir')
→ return os.homedir()

ipcMain.handle('fs:showOpenDialog', { properties })
→ dialog.showOpenDialog(...) → IPCResult<{ paths: string[] }>
```

---

## Section 7 — Preload

Replace `src/preload/index.ts` with a full contextBridge implementation.

Expose `window.dw` with this shape:

```ts
window.dw = {
  env: {
    list():              Promise<IPCResult<StoredEnv[]>>
    add(env):            Promise<IPCResult>
    remove(name):        Promise<IPCResult>
    update(env):         Promise<IPCResult>
    setActive(name):     Promise<IPCResult>
    getActive():         Promise<IPCResult<StoredEnv>>
  },
  auth: {
    test(env, credentials):           Promise<IPCResult<ConnectionStatus>>
    saveCredentials(envName, creds):  Promise<IPCResult>
    loginPassword(env, user, pass):   Promise<IPCResult>
  },
  files: {
    list(envName, path):                              Promise<IPCResult<FileEntry[]>>
    upload(envName, localPaths, remotePath, overwrite, jobId): void  // fire-and-forget, progress via events
    download(envName, remotePath, localPath):         Promise<IPCResult>
    delete(envName, path):                            Promise<IPCResult>
    copy(envName, source, destination):               Promise<IPCResult>
    move(envName, source, destination, overwrite):    Promise<IPCResult>
  },
  fs: {
    list(dirPath):       Promise<IPCResult<FileEntry[]>>
    homedir():           Promise<string>
    openDialog(props):   Promise<IPCResult<{ paths: string[] }>>
  },
  on: {
    filesProgress(cb: (payload: ProgressPayload) => void): () => void
    // returns an unsubscribe function
    filesDone(cb: (payload: DonePayload) => void): () => void
  }
}
```

Add the full TypeScript interface for `window.dw` in `src/renderer/src/env.d.ts`.

---

## Section 8 — Renderer

### Zustand stores

`src/renderer/src/stores/envStore.ts`
- `envs: StoredEnv[]`
- `activeEnv: StoredEnv | null`
- Actions: `loadEnvs`, `addEnv`, `removeEnv`, `setActiveEnv`
- Call `window.dw.env.list()` and `window.dw.env.getActive()` in `loadEnvs` on app mount

`src/renderer/src/stores/fileStore.ts`
- `remoteEntries: FileEntry[]`
- `remotePath: string` (default `/`)
- `localEntries: FileEntry[]`
- `localPath: string` (default: homedir)
- `selected: { pane: 'local' | 'remote'; paths: string[] }`
- Actions: `loadRemote(envName, path)`, `loadLocal(path)`, `setSelected`

`src/renderer/src/stores/transferStore.ts`
- `jobs: TransferJob[]`
- Actions: `addJob`, `updateJob`, `clearDone`
- Subscribe to `window.dw.on.filesProgress` and `window.dw.on.filesDone` in a single `initTransferListeners()` call at app mount

### Components

Build in this order. Use Tailwind for styling. All text, borders, and backgrounds must use Tailwind's `dark:` variants — the app is dark-mode first with `class="dark"` on `<html>`.

**Color palette for the app:**
- Background primary: `bg-zinc-900`
- Background secondary (sidebar, headers): `bg-zinc-800`
- Background tertiary (remote pane when disconnected): `bg-zinc-950`
- Border: `border-zinc-700`
- Text primary: `text-zinc-100`
- Text secondary: `text-zinc-400`
- Text tertiary: `text-zinc-500`
- Accent (DW green): `#1D9E75` — use as `bg-[#1D9E75]` / `text-[#1D9E75]` / `border-[#1D9E75]`
- Status online: `bg-green-400`
- Status offline: `bg-zinc-600`

---

#### `<EnvSidebar>`

Left rail, 180px wide. Sections:

1. Header label "ENVIRONMENTS" in 10px uppercase zinc-500
2. List of `StoredEnv` rows from `envStore`. Each row:
   - Status dot (green if connected, zinc if not)
   - Env name (12px, zinc-100, truncated)
   - Host (10px, zinc-500, truncated)
   - Active env has left border `border-l-2 border-[#1D9E75]` and slightly lighter background
   - Click to call `setActiveEnv`
3. "+ Add environment" dashed button at bottom of list
4. Footer strip showing active env name and connection status

When no environments exist, show a short helpful message in the list area: "No environments yet. Add your first DynamicWeb solution to get started."

---

#### `<AddEnvModal>`

Full-screen overlay (not a native dialog). 3-step wizard rendered in the remote pane area itself (not as a floating modal, but as the pane's content). Steps:

**Step 1 — Details**
- Name field (e.g. `production`)
- Host field with placeholder `https://yoursite.dynamicweb.dk` — strip trailing slash on save
- Protocol auto-detected from URL; show as a read-only pill next to the field
- "Next →" button

**Step 2 — Authentication**
- Three tabs: `OAuth (recommended)` / `API key` / `Username & password`
- OAuth tab: Client ID field, Client secret field. Below fields: "Create an OAuth client in your DW backend under Settings → OAuth Clients. Set grant type to Client credentials." with a link.
- API key tab: single API key field. "Generate a key in your DW backend under Settings → API Keys."
- Username tab: username + password fields. Note: "We'll exchange your credentials for an API key and store that instead."
- "← Back" and "Test connection →" buttons

**Step 3 — Test & save**
- Show a spinner while calling `window.dw.auth.test()`
- On success: green checkmark, "Connected to DynamicWeb {version}", "Save & open →" button
- On failure: red message with the error text, "← Back" and "Retry" buttons
- "Save & open →" calls `window.dw.env.add()`, `window.dw.auth.saveCredentials()`, then `setActiveEnv` and dismisses the wizard

Progress dots at the top of the card showing current step (1 / 2 / 3).

---

#### `<PaneHeader>`

Reusable header bar used by both local and remote panes. Props: `label`, `breadcrumbs: string[]`, `onNavigateUp`, `onRefresh`, `actions?: ReactNode`.

Breadcrumbs are clickable — each segment navigates to that path. Current segment is zinc-100, parent segments are zinc-400.

---

#### `<FileList>`

Reusable file listing used by both panes. Props: `entries: FileEntry[]`, `loading: boolean`, `selected: string[]`, `onSelect`, `onDoubleClick` (navigate into directory), `onContextMenu`, `dropTarget?: boolean`.

Each row:
- File type icon — folder emoji for directories, 2–3 letter extension badge (`JS`, `CSS`, `HTM`, `SVG`, `IMG`, `ZIP`) in zinc-700 background for files
- File name (truncated)
- Size / item count (right-aligned, zinc-500)
- When `dropTarget` is true and the user is dragging over a directory row, highlight that row with a green dashed border

Multi-select: Cmd/Ctrl+click to add to selection, Shift+click for range. Show selection count in the pane header when more than one item selected.

---

#### `<ContextMenu>`

A positioned `<ul>` that appears on right-click anywhere in a `<FileList>`. Rendered into a portal at `document.body`. Items vary by pane and selection:

Local pane:
- Upload to remote (only when an active remote env exists)
- Reveal in Finder / Explorer

Remote pane:
- Download to local
- Delete (with "Are you sure?" inline confirmation replacing the menu)
- Copy (prompts for destination path inline)
- Move (prompts for destination path inline)
- Copy path to clipboard

Close on outside click or Escape.

---

#### `<TransferQueue>`

Bottom drawer, always visible, minimum height 36px (collapsed), expands to show job rows.

Header strip: "TRANSFERS" label, active badge (green, shows count), done badge (zinc, shows count), "Clear done" button on the right. Click anywhere on header to collapse/expand.

Job rows (when expanded):
- Direction arrow (↑ green for upload, ↓ blue for download)
- Job label (filename or "FolderName/ (N files)")
- Destination path (truncated, zinc-500)
- Progress bar (70px wide, 3px tall, green fill)
- Percentage or "✓" when done
- Error message in red if status is error

---

#### `<DualPaneBrowser>` (main view)

Composes the two panes side by side, 50/50 split with a 1px divider.

Left pane (local):
- `<PaneHeader>` with local path breadcrumbs
- `<FileList>` showing local entries
- Drop zone strip at the bottom: "Drop files here or click to browse" — clicking calls `window.dw.fs.openDialog`

Right pane (remote):
- If no active env: show the `<AddEnvModal>` wizard embedded as pane content
- If active env but not yet loaded: show a subtle spinner
- If loaded: `<PaneHeader>` with remote path breadcrumbs, env name in DW green
- `<FileList>` showing remote entries
- If an upload would cause conflicts (detected by comparing local filenames against remote entries): show a `<ConflictBanner>` between the header and the file list — "N files already exist. Skip existing / Replace all" — no blocking modal

**Drag and drop:**
- Drag files or folders from the local pane onto any directory row in the remote pane to trigger an upload
- Drag files from the remote pane to the local drop zone to trigger a download
- While dragging over a valid drop target, highlight with green dashed border
- On drop, generate a `jobId` (nanoid), call `window.dw.files.upload(...)`, add a job to `transferStore`

---

#### `<App>`

Top level. Renders:

```
<div class="flex flex-col h-screen bg-zinc-900 text-zinc-100">
  <TitleBar />        // 38px, shows app name + macOS traffic lights handled by Electron
  <TabBar />          // "Files" tab + "Transfer log" tab with done count badge
  <div class="flex flex-1 overflow-hidden">
    <EnvSidebar />
    <DualPaneBrowser />   // or <TransferLog /> depending on active tab
  </div>
  <TransferQueue />
</div>
```

On mount: call `envStore.loadEnvs()`, `transferStore.initTransferListeners()`, and `fileStore.loadLocal(homedir)`. If there is an active env, call `fileStore.loadRemote(activeEnv.name, '/')`.

---

#### `<TransferLog>` (second tab)

A flat list of all completed transfers in the current session. Columns: direction, filename, remote path, local path, timestamp, status. No pagination needed — just a scrollable list. "Clear history" button at the top right.

---

## Section 9 — Electron main window config

In `src/main/index.ts`, configure `BrowserWindow` with:

```ts
{
  width: 1100,
  minWidth: 800,
  height: 700,
  minHeight: 500,
  titleBarStyle: 'hiddenInset',   // macOS: native traffic lights, custom titlebar
  trafficLightPosition: { x: 14, y: 12 },
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false   // required for preload to use Node APIs
  }
}
```

---

## Section 10 — Tests

Write Vitest tests for the three main-process modules. Use `vi.mock` for external dependencies. Do not test Electron IPC or any renderer code in this phase.

**`config.test.ts`:**
- Mock `electron` module: `vi.mock('electron', () => ({ app: { getPath: () => tmpDir } }))`
- Test: default config returned when file missing
- Test: add env → save → reload → env present
- Test: remove env → save → reload → env absent
- Test: atomic write (tmp file does not persist after save)

**`credentials.test.ts`:**
- Mock `keytar` with `vi.mock('keytar')`
- Test: saveApiKey stores with correct account key format `'{envName}:apiKey'`
- Test: getOAuthCredentials returns null when not set
- Test: deleteAllCredentials calls delete for all three key types

**`auth.test.ts`:**
- Mock `fetch` with `vi.stubGlobal('fetch', ...)`
- Mock `keytar`
- Test: resolveAuthHeader for apiKey reads from keytar and returns correct header
- Test: OAuth token is cached after first call, fetch is not called again on second call
- Test: OAuth token is refreshed when within 60s of expiry

---

## Do not

- Do not read or write `~/.dwc` anywhere in this project
- Do not store secrets in `config.json`
- Do not call `fetch` or any API from the renderer process
- Do not use `nodeIntegration: true`
- Do not use `any` — all types come from `src/shared/types.ts`
- Do not block the main process with synchronous I/O — use `fs/promises` everywhere except the atomic rename in `saveConfig` (which may use `fs.renameSync`)
