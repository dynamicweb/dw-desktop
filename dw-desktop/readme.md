# DW Desktop

Desktop GUI for moving files between a local folder and a DynamicWeb 10 solution — browse, deploy and sync, across several environments.

Electron + electron-vite + React 19 + TypeScript + Tailwind v4 + zustand. Main / preload / renderer live under `src/`, shared types under `src/shared/`.

All remote file handling goes through the DW10 **File Transfer API** (`/Admin/Api/FileTransfer`, documented in `FILE-TRANSFER-API.md` in the Dynamicweb10 repo). The sync logic is a port of the CLI v2 branch (`bin/transfer/filetransfer.js`, `sync.js`).

## Code map

| Where | What |
| --- | --- |
| `src/main/dw-api.ts` | File Transfer API client: listing (`entries`, `manifest`), chunked uploads (`uploads` → `chunks` → `finalize`), resumable downloads, move/copy/delete/directory. Idempotency keys, retries, `FileTransferApiError`. |
| `src/main/sync.ts` | Sync engine: `buildSyncPlan` (preview) and `runSyncPlan` (folders → files in parallel → deletes, `If-Match` guarded). |
| `src/main/transferState.ts` | Sync baseline per host, `userData/transfer-state.json`. Drives conflict detection. |
| `src/main/activity.ts` | Activity history, `userData/activity.json` (30 days / 500 jobs; running jobs come back as *Interrupted*). |
| `src/main/cancellation.ts` | AbortController per job id; `files:cancel` aborts them. |
| `src/main/auth.ts`, `ipc/auth.ts` | OAuth client credentials, API key, username/password; connection test (a 404 on `FileTransfer/entries/exists` means the API is missing). Credentials in the OS keychain via keytar. |
| `src/main/config.ts` | `userData/config.json`: environments, active env, theme, pane state (last folders, pinned, recent), saved syncs. |
| `src/main/ipc/*` | IPC handlers: `env:*`, `auth:*`, `files:*`, `sync:*`, `settings:*`, `activity:*`. |
| `src/preload/` | `window.dw` bridge (`index.d.ts` is the typed contract). |
| `src/renderer/src/components/` | `Sidebar` (env switcher, nav, pinned/recent/saved syncs), `DualPaneBrowser` (Browse), `SyncView`, `ActivityView`, `SettingsView`, `TransferPill`, dialogs. |
| `src/renderer/src/stores/` | zustand: `envStore`, `fileStore` (panes), `transferStore` (jobs + IPC listeners + history persistence), `uiStore` (view, dialogs), `workspaceStore` (pinned/recent/saved syncs). |
| `src/renderer/src/assets/main.css` | Design tokens (light/dark) and shared classes (`btn`, `pill`, `menu-item`, …). |

Transfers are fire-and-forget over IPC: the renderer creates jobs with ids, the main process reports `files:progress` / `files:done` per job id, and sync runs report each item the same way, so Activity treats every batch alike.

## Develop

Prerequisites: Node 22+, npm.

```
npm install        # installs deps + rebuilds native modules (keytar) for Electron
npm run dev        # launch the app with hot reload
```

Other useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check node + web projects |
| `npm run lint` | ESLint (cached) |
| `npm run format` | Prettier write |
| `npm test` | Vitest (node env) |
| `npm run build` | Typecheck + electron-vite build into `out/` |
| `npm run build:unpack` | Build an unpacked app in `dist/` for local smoke-testing |

If `keytar` fails to load after a dep change, re-run `npm install` (the `postinstall` hook runs `electron-builder install-app-deps`).

Main-process logic is unit-tested with vitest (`src/main/*.test.ts`, `fetch` and `./dw-api` mocked). For UI changes, `.claude/skills/run-dw-desktop/` has a Playwright driver that launches the built app (`npx electron-vite build` first), clicks through views and takes screenshots — see its `SKILL.md`. By default it uses a throwaway profile, so it never touches your environments.

## Publish a new version

Releases are distributed as GitHub Releases via `electron-builder` (config in [electron-builder.yml](electron-builder.yml), `publish.provider: github`, `owner: dynamicweb`, `repo: dw-desktop`). `electron-updater` consumes those releases for auto-updates.

1. Bump the version and tag:
   ```
   npm version patch    # or minor / major
   ```
2. Build + publish the platform installers. You need a `GH_TOKEN` env var with `repo` scope on `dynamicweb/dw-desktop`:
   ```
   $env:GH_TOKEN = "ghp_..."
   npx electron-builder --win --publish always
   ```
   Use `--mac` / `--linux` on the respective OS. `--publish always` uploads artifacts (installer + `latest*.yml` update manifest) to a draft GitHub Release named after the new version.
3. Open the draft release on GitHub, write release notes, and publish it. Auto-update clients pick it up from `latest.yml`.
4. Push the version commit and tag:
   ```
   git push && git push --tags
   ```

### Local build without publishing

```
npm run build:win    # or build:mac / build:linux
```
Artifacts land in `dist/` — useful for verifying the installer before a real release.
