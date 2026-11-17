# TODOS — For Review

Feature gaps identified by comparing DW Desktop against established file-transfer
tools (Transmit, Cyberduck, FileZilla, WinSCP, Mountain Duck, Beyond Compare) and
against the DynamicWeb CLI v2, which shares the File Transfer API. Re-evaluated
against v1 in October 2026. Sorted by priority based on day-to-day friction for
the target audience: DW partners deploying to and maintaining DW10 solutions.

This list deliberately excludes items already tracked in TODOS.md (virtual
scrolling for the file list).

All remote operations go through the DW10 File Transfer API
(`/Admin/Api/FileTransfer`); its endpoints are referenced below where they make an
item easier. Finished items are at the bottom under **Done**.

---

## High priority — daily friction

### Keyboard shortcuts

**What:** Add shortcuts for common actions: upload (Cmd/Ctrl+U), download
(Cmd/Ctrl+D), navigate up (Backspace / Cmd+↑), refresh (F5 / Cmd+R), delete (Del),
rename (F2), focus path bar (Cmd/Ctrl+L), focus filter (Cmd/Ctrl+F), new folder
(Cmd/Ctrl+Shift+N).

**Why:** Mouse-driven workflows are slow when moving many files. Absence of
shortcuts makes the app feel unfinished to professional users.

**Pros:** Order-of-magnitude speedup for repetitive tasks.

**Cons:** Discoverability — needs a help overlay (Cmd/Ctrl+?) or a section in
Settings listing them.

**Context:** Today the only keybindings are Escape in dialogs and menus,
Ctrl/Cmd-click and Shift-click selection in the file list, and mouse back/forward
navigation.

**Value:** High — daily productivity gain; professional users expect this; absence
is one of the first things power users notice.

**Difficulty:** Medium — registering keybindings is straightforward; the real work
is tracking focus between the two panes so the right pane receives the action.

---

### Open and edit server files

**What:** Double-click a server file to open it: download to a temp folder, open
it in the default (or a chosen) app, watch it, and upload it back on save. Images
and text get a quick read-only preview in the app.

**Why:** Hotfixing a template or a config file on a site is a daily task. Today it
takes a download into some local folder, an edit, and an upload — and
double-clicking a server file does nothing.

**Pros:** Standard in Transmit, Cyberduck, WinSCP and FileZilla. The upload back
can use `If-Match` with the eTag from the download, so a file someone else changed
in the meantime is not overwritten.

**Cons:** Temp files need cleanup, and a stale temp copy must never be uploaded
over a newer server file. Production needs the same warning as a deploy.

**Context:** `openRemote` in `DualPaneBrowser.tsx` returns early for anything that
is not a directory. Different from *Auto-upload on local file change* below,
which watches a whole local folder paired with a server folder.

**Value:** High — the most common one-file workflow, with no good path today.

**Difficulty:** Medium — temp-file lifecycle, a file watcher, and the eTag guard;
the download and upload code is reused.

---

## Medium priority — clear workflow value

### Deploy with backup and rollback

**What:** A deploy mode that uploads the local folder to a staging copy on the
server, switches it in with two renames, and keeps the previous version as a
backup — plus a **Roll back last deploy** action.

**Why:** Sync replaces files one by one in place. A deploy that fails or is
cancelled halfway leaves the site with a mix of old and new files, and there is
no undo once it finished.

**Pros:** The CLI v2 already does this (`dw files deploy --keep-backup`,
`dw files rollback`, in `bin/transfer/sync.js`), and Sync itself was ported from
the same file. The CLI records the last deploy's backup in its transfer state;
`transferState.ts` would get the same field.

**Cons:** Replaces the whole folder, so it only fits folders the local copy fully
owns (a design, a templates folder), not `/Files` as a whole. Needs server space
for a second copy.

**Context:** Would sit next to *Deploy to server* in the Sync view, with the same
preview and production warning.

**Value:** Medium-High — the safe way to deploy to production.

**Difficulty:** Medium — the logic exists in the CLI; the work is UI and
explaining when to use it instead of a sync.

---

### Transfer between environments

**What:** Sync or copy a server folder directly from one environment to another
(for example live → staging), without picking a local folder in between.

**Why:** The "copy a live site to staging" scenario in the user guide downloads
the whole `Files` folder to disk and then deploys it again. That doubles the time
and needs local space for every file.

**Pros:** Both sides report SHA-256 (`entries/checksum`), so an exact comparison
needs no local hashing. Transmit and Cyberduck support server-to-server copies.

**Cons:** Data still flows through the user's machine (download → upload per
file), so it is not faster per byte; it removes the double handling and the disk
use. A cancelled run must not leave half-written files.

**Context:** `buildSyncPlan` compares a local walk with a remote manifest; a
second remote manifest in place of the local walk is the core change. The
database part of the scenario (backup and restore) stays manual.

**Value:** Medium — the documented clone scenario becomes one step.

**Difficulty:** Medium-High — streaming a download into a chunked upload, and a
two-environment picker in Sync.

---

### Search the server

**What:** Find files by name in a server folder and all its subfolders, with
results you can open, reveal, download or delete.

**Why:** **Filter this folder** only matches the current folder. Finding a
template somewhere under `/Files/Templates` means clicking through folders.

**Pros:** The recursive `manifest` already returns every path under a folder, page
by page. Transmit, Cyberduck and WinSCP all have a find command.

**Cons:** Large trees take time to walk; the search needs progress and cancel.

**Context:** `collectManifest` in `dw-api.ts` already follows the manifest cursor
for Sync.

**Value:** Medium — saves a lot of clicking on large solutions.

**Difficulty:** Low-Medium — a search field, the manifest walk, and a results
list that reuses the file list rows.

---

### Compare file contents

**What:** Show a side-by-side text diff of a local and a server file — from a
*Changed* file in Browse, and from a conflict in the Sync preview.

**Why:** Compare and the Sync preview say a file differs but not how. A conflict
asks the user to choose *Keep mine* or *Keep server's* without seeing either
version.

**Pros:** Beyond Compare and WinSCP open a diff from the compare view. A cheap
first step is opening VS Code (`code --diff`) or a configured diff tool on the two
files.

**Cons:** Text files only, with a size limit; binary files need a clear "can't
compare" state.

**Context:** The server file can be downloaded to a temp file with the existing
download code.

**Value:** Medium — makes conflict resolution an informed choice.

**Difficulty:** Medium for a built-in viewer; Low for handing off to an external
diff tool.

---

### Two-way sync

**What:** A third sync direction that pushes local changes and pulls server changes
in one run, using the existing baseline to tell which side changed.

**Why:** Teams where some edits happen on the server (content editors, hotfixes)
and some locally need both directions; today that is two runs.

**Pros:** The baseline in `transfer-state.json` already records the last synced
eTag and SHA-256 per file, so "changed on the server" and "changed here" are both
known. Conflicts are already detected and resolved per file in the preview.

**Cons:** Deletes are ambiguous without a baseline ("deleted here" vs "new there");
the first two-way run on an untracked folder must not delete anything.

**Context:** Deferred on purpose for v1 — push and pull cover deploy and "get what
is missing". `buildSyncPlan` in `sync.ts` is where the third direction goes.

**Value:** Medium — valuable for mixed-editing teams; one-way covers deployment.

**Difficulty:** Medium-High — plan classification for both sides plus delete
semantics; the run and preview UI are reusable.

---

### Drag remote files out to the OS file explorer

**What:** Allow dragging a remote file/folder from the server pane directly to the
desktop, Finder, VS Code, etc. Electron supports this via `startDrag` with a
real temp-file path.

**Why:** The natural inverse of the existing OS→app drag-to-upload. Users
intuitively try it and are surprised when it fails.

**Pros:** Removes the "navigate local pane, then download" detour for one-off
extractions.

**Cons:** Must download to a temp path first to produce a real file handle; temp
cleanup needs care. Electron's drag-out API has platform inconsistencies.

**Context:** The current FileList drag uses a custom MIME type
(`application/x-dw-paths`) for in-app drags — extending to OS targets is a
separate code path.

**Value:** Medium — convenient shortcut; the existing "navigate local pane first,
then download" path works but requires more steps.

**Difficulty:** Medium-High — `startDrag` requires a real file on disk before the
drag begins, meaning a pre-download; temp file lifecycle management adds complexity.

---

### Pause / resume transfers, and resume uploads across restarts

**What:** Pause and resume the transfer queue as a whole, and resume a partly
uploaded file after the app was closed instead of starting it again.

**Why:** Large deployments over slow connections are the case where closing the
laptop mid-transfer hurts most.

**Pros:** The server supports upload resume (`GET uploads/{id}` returns
`receivedChunks`; chunks can be re-sent freely).

**Cons:** Upload resume across restarts means persisting session ids (per file,
keyed by local path + size + mtime) and pruning them when the server expires them
(24 h default).

**Context:** Cancel and retry are done (see Done). Interrupted transfers already
come back after a relaunch as *Interrupted* and can be retried, but a retry starts
the file from scratch. Downloads already resume from an eTag-named `.dwpart` file via
`Range`/`If-Range`.

**Value:** Medium — matters for very large files and unreliable connections.

**Difficulty:** Medium — pause: stop dispatching queued jobs; upload resume:
persist session ids and skip `receivedChunks`. No backend work needed.

---

### Configurable transfer concurrency

**What:** Expose the transfer concurrency as a preference (default 4).

**Why:** Fast connections and many-small-file deployments benefit from more
parallelism; slow or metered connections from less.

**Pros:** Parallel transfers are already implemented; this is only a setting.

**Cons:** Peak upload memory is `FILE_CONCURRENCY × CHUNK_PARALLELISM × chunkSize`
(today 4 × 2 × 8 MB), so the setting needs a sane upper bound. OAuth token refresh
under concurrency should be checked.

**Context:** `dw-api.ts` and `sync.ts` run transfers through a promise pool
(`mapPool`, `FILE_CONCURRENCY = 4`), with 2 chunk PUTs in flight per file. The
constant just isn't user-configurable.

**Value:** Low-Medium now that the default is already parallel.

**Difficulty:** Low — pass the value from settings into `uploadFiles` /
`downloadFile` / `runSyncPlan` and add a field in Settings.

---

### Auto-upload on local file change (live edit)

**What:** A "watch this folder" mode that automatically uploads a local file to its
matching remote path whenever it's saved locally. Scoped to a single local↔remote
pair; clearly indicated as active.

**Why:** Template development loop: edit a template locally in VS Code, see the
change on staging within a second. Today this requires a manual upload or sync after
every save.

**Pros:** Game-changer for developers actively working on templates or scripts.
Node.js `fs.watch` is reliable in Electron. A saved sync already defines the folder
pair and options.

**Cons:** Easy to footgun (accidentally watching a folder pointed at production).
Safety UX — unmissable indicator, per-env opt-in, production guard — is the hard
part, not the file watching itself.

**Context:** Most valuable for developer partners; lower value for non-technical
users who deploy infrequently. Environment types (Production / Staging /
Development) give the production guard something to key on.

**Value:** High for developer-users — removes the single most repetitive action in
the active-development workflow.

**Difficulty:** Medium — file watching is easy; the design work is the safety
model and the clear indicator that watching is active.

---

### Environment management improvements

**What:**
- **Duplicate environment** — clone an existing env with a new name.
- **Import / export** — share environment config (credentials excluded) as a JSON file.

**Why:** Partners managing many client solutions set up the same kind of
environment repeatedly, and teams want to share the list.

**Pros:** Each sub-feature is independently small.

**Cons:** Export needs a hard guarantee that credentials never leak; import needs
validation and a merge strategy for conflicts.

**Context:** Environments are switched from the top of the sidebar and managed in
Settings; each has a fixed type (Production / Staging / Development). The switcher
already groups environments by type and has a search field.

**Value:** Medium — duplicate and export are the most broadly useful.

**Difficulty:** Low-Medium — duplicate is trivial; import/export needs careful
credential handling.

---

### Per-file choices in the upload conflict dialog

**What:** Per-file conflict resolution (Skip / Replace / Keep both with
auto-rename) in the upload conflict dialog, instead of the current all-or-nothing
"Upload missing only / Replace existing".

**Why:** Real uploads often have a mix — most files should overwrite, one or two
should be preserved.

**Pros:** Matches the standard OS file-copy dialog. No new transfer-protocol work.

**Cons:** UI for many conflicts gets long; needs an "apply to remaining" affordance
to stay usable.

**Context:** Sync already resolves conflicts per file in its preview, so the
workaround is to use Sync folder instead of a drag upload. `checkUploadConflicts`
already returns the full list of conflicting paths; `uploadFiles` would need to accept
a per-file overwrite set instead of one flag.

**Value:** Low-Medium — Sync covers the mixed case.

**Difficulty:** Medium — mostly UI.

---

### Hand a sync over to the CLI

**What:** **Copy as CLI command** on a saved sync: the equivalent
`dw files sync <local> <remote> [--delete]` (or `dw files diff` for a dry run) with
the environment's host and auth type, ready for a CI pipeline.

**Why:** The user guide sends automation to the CLI. A partner who set up and
tested a deploy in the app should not have to work out the same command by hand.

**Pros:** The CLI v2 sync uses the same API and the same plan logic. No transfer
work in the app.

**Cons:** Only *Deploy to server* maps to a CLI command — the CLI sync is push
only. Secrets must never be put in the copied text; the command refers to
environment variables or a `dw env` setup instead.

**Context:** Saved syncs store folders, direction and options; the CLI flags are
documented in the CLI README (*File Transfer*).

**Value:** Low-Medium — small, but connects the two tools.

**Difficulty:** Low.

---

### Install add-ins

**What:** Upload and install a `.dll` or `.nupkg` add-in on the current
environment, with the same production warning as a deploy.

**Why:** Partners who build custom code deploy it alongside templates. Today that
needs the CLI (`dw install`) or the DW backend.

**Pros:** The CLI already does it and uploads through the File Transfer API.

**Cons:** Installing code is riskier than copying files; the result (success,
queued, failed) must be shown clearly.

**Context:** `dw install [filePath] [--queue]` in the CLI (`bin/commands/install.js`).

**Value:** Low-Medium — useful for developer partners; not a file-transfer feature.

**Difficulty:** Low-Medium — one upload plus the install call and its result.

---

### Smaller follow-ups

- **Copy on the server.** `copyRemote` (`entries/copy`) and IPC `files:copy` exist
  but nothing in the UI calls them. Add **Duplicate** and **Copy to folder…** to the
  server row menu — useful for keeping a copy of a template before editing it.
- **File info and folder size.** An info panel for a server entry: size, modified,
  version (eTag) and SHA-256 from `entries/metadata` / `entries/checksum`, and for a
  folder its total size and file count from `entries/usage` (CLI `stat` / `usage`).
- **Notify when a long transfer finishes.** An OS notification when a batch or sync
  ends while the window is in the background, and taskbar/dock progress
  (`BrowserWindow.setProgressBar`).
- **Dismiss failed batches in Activity.** *Clear finished* keeps failed batches, and
  the history is now kept for 30 days, so an old failure stays at the top until it is
  retried. Add a dismiss action, or let *Clear finished* remove them.
- **Cancel from the transfer pill.** The floating progress pill only opens Activity.
- **New folder in the context menu.** The remote context menu only opens on an entry,
  so "New folder" there needs a background (empty-space) menu first.

---

## Low priority — niche or limited by platform

### Transfer speed throttling

**What:** Cap upload/download bandwidth (e.g., 1 MB/s) via an app-level setting.

**Why:** Useful on limited connections (mobile tether, shared office Wi-Fi).

**Pros:** Real scenario, especially for field workers.

**Cons:** App-layer throttling is awkward — the OS and network hardware do it
better. The implementation (timed chunk dispatch or custom ReadableStream) is
messy and doesn't truly cap bandwidth, only burst rate.

**Context:** Realistically a "we'll add it if partners ask for it" item.

**Value:** Low — niche scenario; a system-level tool (e.g., Little Snitch,
NetLimiter) handles this better.

**Difficulty:** Medium — possible via chunked dispatch with artificial delays, but
the result is imprecise and the implementation is non-trivial.

---

### Tabs or a second window

**What:** Work with two environments at once — browser-style tabs, or **New
window** opening a second Browse view on another environment.

**Why:** Partners checking staging against production, or moving work between two
clients' solutions, switch environments back and forth.

**Pros:** Transmit, Cyberduck and WinSCP all offer tabs or multiple windows.

**Cons:** State is per window today (active environment, pane state, the transfer
pill); tabs touch most stores. *Transfer between environments* covers the main
reason to want it.

**Context:** Users have about 10 environments and rarely switch within a session,
so this is a convenience, not a gap.

**Value:** Low.

**Difficulty:** Medium-High — store refactoring for per-tab state.

---

## Done

### Folder sync (one-way)

**Sync** view (`SyncView`, `sync.ts`, IPC `sync:plan` / `sync:run`): pick a local and
a server folder and a direction (**Deploy to server** / **Get from server**),
**Preview changes**, then run. Ported from the CLI v2 `bin/transfer/sync.js`:

- The plan uses the cursor-paginated `manifest` and, with *Compare content*,
  `entries/checksum` (SHA-256); otherwise size and date.
- A baseline per host in `userData/transfer-state.json` records what each sync wrote
  or verified, so a file changed on both sides since the last sync is a conflict that
  the user resolves per file in the preview.
- Replaces and deletes are guarded with `If-Match`, so a server change made after the
  preview is not overwritten.
- *Delete files that aren't on the other side* is optional; pull-direction deletes go
  to the OS trash (`shell.trashItem`).
- Syncs can be saved (sidebar) and re-run; **Sync folder** in Browse prefills the two
  current folders.

### Cancel and retry transfers

Every job has an AbortController in the main process (`cancellation.ts`). Activity
cancels a whole batch (**Cancel all**) or a single file; sync items are cancellable
one by one without stopping the run. **Retry failed** re-runs failed and cancelled
jobs with their recorded parameters. Transient errors are retried automatically, and
mutations carry an `Idempotency-Key`.

### Activity history across restarts

Activity (`ActivityView`, `transferStore`) is saved to `userData/activity.json`
(`activity.ts`) whenever a job is added, removed or changes status, pruned to 30 days
and 500 jobs (whole batches). Jobs still running when the app closed come back as
*Interrupted* and can be retried.

### Directory filter

**Filter this folder** in the Browse header filters both panes by name.

### Column sorting

Sortable Name / Size / Modified headers in the file list, persisted
(`dw.sort` in localStorage).

### Pinned and recent remote folders

Per environment, stored in `paneState` (`workspaceStore`): pin a server folder from
its "···" menu; the last visited folders are listed under **Recent** in the sidebar.

### Cross-path move

Drag a remote entry onto a remote folder to move it (`POST entries/move`,
`moveRemote`).

### Create new folder (remote)

A **New folder** button in the server pane header opens a name dialog and creates the
folder via `POST entries/directory` (`createRemoteDirectory`, IPC
`files:createDirectory`). Invalid names are rejected before sending; an existing
folder or file with that name is reported in the dialog.

### Environment types and production warning

Each environment is Production, Staging or Development (fixed set). Production is
marked in the sidebar and pane label, and a deploy to production shows a warning in
the Sync view and in the upload conflict dialog.

### Exclude rules for sync and upload

Sync skips paths by gitignore-style rules on both sides (`exclude.ts`, built on the
`ignore` package): a built-in junk list (on by default), `.gitignore` files from the
repository root down (opt-in, since they often list build output that must be
deployed), a `.dwignore` in the local folder, and per-sync patterns stored on saved
syncs. `System/Log` and `Cache.net` are never synced, as in the CLI. A folder holding
an excluded path is never deleted whole. The preview lists excluded paths with side
and rule. Folder uploads from Browse apply the junk list and report what they left out.
