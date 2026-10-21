# TODOS — For Review

Feature gaps identified by comparing DW Desktop against established file-transfer
tools (Transmit, Cyberduck, FileZilla, WinSCP, Mountain Duck, Beyond Compare).
Sorted by priority based on day-to-day friction for the target audience: DW
partners deploying to and maintaining DW10 solutions.

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

## Medium priority — clear workflow value

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
Settings; each has a fixed type (Production / Staging / Development). Grouping by
type was considered and dropped — users have about 10 environments and rarely
switch within a session.

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

### Smaller follow-ups

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
