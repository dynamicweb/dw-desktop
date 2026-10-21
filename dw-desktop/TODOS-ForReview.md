# TODOS — For Review

Feature gaps identified by comparing DW Desktop against established file-transfer
tools (Transmit, Cyberduck, FileZilla, WinSCP, Mountain Duck, Beyond Compare).
Sorted by priority based on day-to-day friction for the target audience: DW
partners deploying to and maintaining DW10 solutions.

This list deliberately excludes items already tracked in TODOS.md (virtual
scrolling for RemoteFileTree).

All remote operations go through the DW10 File Transfer API
(`/Admin/Api/FileTransfer`); its endpoints are referenced below where they make an
item easier. Finished items are at the bottom under **Done**.

---

## High priority — daily friction

### Keyboard shortcuts

**What:** Add shortcuts for common actions: upload (Cmd/Ctrl+U), download
(Cmd/Ctrl+D), navigate up (Backspace / Cmd+↑), refresh (F5 / Cmd+R), delete (Del),
rename (F2), focus path bar (Cmd/Ctrl+L), select all (Cmd/Ctrl+A), new folder
(Cmd/Ctrl+Shift+N).

**Why:** Mouse-driven workflows are slow when moving many files. Absence of
shortcuts makes the app feel unfinished to professional users.

**Pros:** Order-of-magnitude speedup for repetitive tasks.

**Cons:** Discoverability — needs a help overlay (Cmd/Ctrl+?) or a settings page
listing them.

**Context:** Today the only keybindings are OS-level mouse-back/forward navigation
shipped recently.

**Value:** High — daily productivity gain; professional users expect this; absence
is one of the first things power users notice.

**Difficulty:** Medium — registering keybindings is straightforward; the real work
is tracking focus between the two panes so the right pane receives the action.

---

### Directory search / filter

**What:** An inline filter input (Cmd/Ctrl+F when pane is focused) that filters
visible entries by substring match against name. Optionally support simple glob
patterns (`*.tpl`).

**Why:** Solutions accumulate hundreds of files per directory. Scrolling and
visually scanning is slow and error-prone.

**Pros:** Pure client-side feature on already-fetched entries. Instant feedback.

**Cons:** None structural — remote listings are complete (no truncation), so a
filter over the loaded entries never misses a match. Pairs well with the
virtual-scrolling work in TODOS.md for very large folders.

**Context:** Pairs naturally with the existing "Virtual scrolling for
RemoteFileTree" backlog item.

**Value:** High — immediately useful for Templates and Images directories that
routinely contain hundreds of files.

**Difficulty:** Low — filter state on the already-loaded entries array; ~30 lines
of logic; the main decision is where to render the input.

---

### Column sorting in file list

**What:** Clickable header columns to sort by name, size, type, or modified date —
ascending or descending. Persisted per-pane.

**Why:** "Find the most recently changed file" or "find the largest file" is the
most common scanning operation in any file manager.

**Pros:** No backend changes — `GET entries` already returns `size` and
`modifiedUtc` for every entry, so all four sort keys (name, size, type, date)
are available without extra API calls.

**Cons:** Need a clear convention for directories-first vs. fully mixed sort order.
Local entries also have size and mtime via Node.js `fs.stat`.

**Context:** All required data is already in the loaded `FileEntry` objects. Remote
entries arrive sorted by path (ordinal, case-sensitive); local entries are sorted in
`ipc/files.ts`. Neither order is user-selectable.

**Value:** High — universal file manager expectation; immediately useful for
deployment debugging ("which file changed last?").

**Difficulty:** Low — add a sortable header row to FileList and a sort state; the
logic is identical to what was just added to the env sidebar.

---

### Bookmarks / favorites for remote paths

**What:** Let the user pin frequently-used remote paths per environment. Shown as a
dropdown next to the path bar, or as quick-jump rows under each environment in the
sidebar.

**Why:** Partners typically work in 2–4 specific subtrees of a solution.
Re-navigating from `/Files/` every session is repetitive friction.

**Pros:** High value for low data-model effort. Stored in the existing `paneState`
config — no new IPC needed.

**Cons:** UI placement needs care: path bar is already dense; sidebar adds vertical
clutter.

**Context:** `paneState` currently remembers only the single last-visited path per
environment. Multi-bookmark is a natural extension.

**Value:** Medium-High — high frequency usage; workaround exists (navigate manually)
but the saving compounds across a full workday.

**Difficulty:** Medium — data model extension is trivial; the design challenge is
surfacing bookmarks without cluttering the already-tight PaneHeader.

---

## Medium priority — clear workflow value

### Folder sync (one-way mirror)

**What:** "Sync local → remote" / "Sync remote → local" actions that transfer only
the delta. Show a preview of planned operations (add / replace / delete) before
executing. One-way only initially.

**Why:** Deployment is exactly this: make remote match the local build output.
Manual drag-and-drop misses files and leaves stale ones behind.

**Pros:** Directly solves the primary use case in the README.

**Cons:** Real complexity — diff preview UI, conflict handling, deletions on the
target side.

**Context:** The building blocks now exist: the File Transfer API's cursor-paginated
`manifest` gives the full remote tree with `size`, `modifiedUtc` and `eTag`;
`entries/checksum` gives SHA-256 when content-level comparison is needed; and
`If-Match` on finalize/delete prevents overwriting a remote version the plan didn't
see. The CLI v2 branch implements exactly this (`bin/transfer/sync.js`: plan, diff,
`--delete`, eTag baseline in `~/.dwc`) and is the reference to port. The existing
single-folder compare view covers the preview UI's starting point.

**Value:** Very High — the single feature that would make DW Desktop a proper
deployment tool rather than a manual file-transfer aid.

**Difficulty:** High — Folder compare is the prerequisite; sync adds the execution
layer (apply deltas, show progress per-file, handle errors mid-sync, deletions).

---

### Drag remote files out to the OS file explorer

**What:** Allow dragging a remote file/folder from the remote pane directly to the
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

**Difficulty:** Medium-High — Electron's `startDrag` API is straightforward but
requires a real file on disk before the drag begins, meaning a synchronous
pre-download; temp file lifecycle management adds complexity.

---

### Pause / resume / retry / cancel transfers

**What:** Make the transfer queue actionable: pause/resume the queue as a whole,
cancel an individual in-flight transfer, retry a failed transfer without
re-initiating from scratch, and resume a partly uploaded file across app restarts.

**Why:** Cancel is basic queue control, and a failed job today can only be redone by
dragging the files again.

**Pros:** Standard in every comparable tool; the backend already supports all of it.

**Cons:** Upload resume across restarts means persisting session ids (per file,
keyed by local path + size + mtime) and pruning them when the server expires them
(24 h default).

**Context:** Already done automatically, without UI: transient errors are retried
(network failures, 5xx, `retryable` errors), mutations carry an `Idempotency-Key` so
retries can't double-apply, and interrupted downloads resume from an eTag-named
`.dwpart` file via `Range`/`If-Range`. The server supports upload resume
(`GET uploads/{id}` returns `receivedChunks`; chunks can be re-sent freely), but the
app doesn't keep session ids yet. The queue UI itself is still record-only.

**Value:** Medium-High — cancel and retry deliver most of the value and matter
most when large batches or slow connections are involved.

**Difficulty:** Medium — cancel: abort the fetch and `DELETE uploads/{id}`; pause:
stop dispatching next queued jobs; retry: re-queue same parameters; upload resume:
persist session ids and skip `receivedChunks`. No backend work needed.

---

### Cross-path move

**What:** Drag a remote file/folder into a different remote directory to move it
server-side. Currently only in-place rename works; moving requires a manual
download + reupload.

**Why:** Reorganizing remote solution structure (moving images to a different
category folder, restructuring Templates) is a real operation that partners do.

**Pros:** `POST entries/move` moves a file or directory to any destination path in
one atomic same-volume rename — no copy + delete, so no half-done duplicate state.
It's already used for rename (`renameRemote` in `dw-api.ts`).

**Cons:** Needs a decision for an existing destination (`overwrite` flag, or ask the
user like the upload conflict modal does).

**Context:** In-place rename works today and is the same call with a different
destination. Cross-path move is a small step on top.

**Value:** Medium — useful for reorganization tasks but not a daily operation.

**Difficulty:** Low — the API call is one line; the main work is wiring
drag-to-folder (a different folder, not the current one) in FileList.

---

### Configurable transfer concurrency

**What:** Expose the transfer concurrency as a preference (default 4).

**Why:** Fast connections and many-small-file deployments benefit from more
parallelism; slow or metered connections from less.

**Pros:** Parallel transfers are already implemented; this is only a setting.

**Cons:** Peak upload memory is `FILE_CONCURRENCY × CHUNK_PARALLELISM × chunkSize`
(today 4 × 2 × 8 MB), so the setting needs a sane upper bound. OAuth token refresh
under concurrency should be checked.

**Context:** Done in code: `dw-api.ts` runs uploads and directory downloads through a
promise pool (`mapPool`, `FILE_CONCURRENCY = 4`), with 2 chunk PUTs in flight per
file. The constant just isn't user-configurable.

**Value:** Low-Medium now that the default is already parallel.

**Difficulty:** Low — pass the value from settings into `uploadFiles` /
`downloadFile` and add a preference field.

---

### Auto-upload on local file change (live edit)

**What:** A "watch this folder" mode that automatically uploads a local file to its
matching remote path whenever it's saved locally. Scoped to a single local↔remote
pair; clearly indicated as active.

**Why:** Template development loop: edit `.tpl` locally in VS Code, see the change
on staging within a second. Today this requires a manual upload after every save.

**Pros:** Game-changer for developers actively working on templates or scripts.
Node.js `fs.watch` is reliable in Electron.

**Cons:** Easy to footgun (accidentally watching a folder pointed at production).
Safety UX — unmissable indicator, per-env opt-in, production guard — is the hard
part, not the file watching itself.

**Context:** Most valuable for developer partners; lower value for non-technical
users who deploy infrequently.

**Value:** High for developer-users — removes the single most repetitive action in
the active-development workflow.

**Difficulty:** Medium — file watching is easy; the design work is the safety
model (preventing accidental prod syncs) and the clear UI indicator that watching
is active.

---

### Recent folders dropdown

**What:** A dropdown on the path bar showing the last N remote folders visited per
environment, persisted across sessions.

**Why:** Quick re-access to recently-visited folders without re-navigating the tree.

**Pros:** Low cost, moderate frequency-of-use. Browser-style affordance that users
already understand.

**Cons:** PaneHeader is already dense; dropdown needs care not to clutter it.

**Context:** Today only the single most-recent path per env is persisted.

**Value:** Medium — saves a few clicks; less critical now that the breadcrumb
already supports click-to-navigate up the path.

**Difficulty:** Low — extend `paneState` to store a history array; add a small
dropdown toggle to PaneHeader.

---

### Environment management improvements

**What:** Three related additions:
- **Duplicate environment** — clone an existing env with a new name.
- **Environment groups** — collapsible Dev / Staging / Prod sections in the sidebar.
- **Import / export** — share environment config (credentials excluded) as a JSON file.

**Why:** Partners managing many client solutions accumulate a long flat list. The
new sort dropdown helps but doesn't address organization or team sharing.

**Pros:** Each sub-feature is independently small. Together they handle the "I have
30 environments" case well.

**Cons:** Export needs a hard guarantee that credentials never leak; import needs
validation and a merge strategy for conflicts.

**Context:** Builds on the new sortable env list shipped in this branch.

**Value:** Medium — high value once you have 10+ environments; low for new or
single-project users. Duplicate and export are the most broadly useful of the
three.

**Difficulty:** Low-Medium per sub-feature — duplicate is trivial; groups need
collapsible sidebar UI; import/export needs careful credential handling.

---

### Smarter conflict resolution UX

**What:** Per-file conflict resolution (Skip / Replace / Keep both with
auto-rename) in the upload conflict modal, instead of the current all-or-nothing
"Upload missing only / Replace existing".

**Why:** Real uploads often have a mix — most files should overwrite, one or two
should be preserved. Today the user must manually exclude files before uploading.

**Pros:** Matches the standard OS file-copy dialog. No new transfer-protocol work.

**Cons:** UI for many conflicts gets long; needs an "apply to remaining" affordance
to stay usable.

**Context:** Builds on `UploadConflictModal`. The pre-upload check
(`checkUploadConflicts`) already returns the full list of conflicting paths,
including nested subfolders, so the per-file data is available; `uploadFiles` would
need to accept a per-file overwrite set instead of one flag.

**Value:** Medium — the existing all-or-nothing mostly covers common cases; per-file
resolution matters most for mixed-state deployments.

**Difficulty:** Medium — needs pre-upload conflict list, per-file state, and
"apply to remaining" logic; the visual component is the most time-consuming part.

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

**Value:** Low — niche scenario; most partners have adequate connections; a system-
level tool (e.g., Little Snitch, NetLimiter) handles this better.

**Difficulty:** Medium — possible via chunked dispatch with artificial delays, but
the result is imprecise and the implementation is non-trivial.

---

## Done

### Create new folder (remote)

A **New folder** button (folder-with-plus icon) in the remote pane header opens a
name dialog (`NewFolderModal`) and creates the folder in the current remote path via
`POST entries/directory` (`createRemoteDirectory` in `dw-api.ts`, IPC
`files:createDirectory`). Names with `\ / : * ? " < > |` or `.`/`..` are rejected
before sending; an existing folder or file with that name is reported in the dialog
(the endpoint is idempotent and returns `created: false` for an existing folder). The
pane refreshes on success. The placeholder-upload workaround is not needed — the File
Transfer API has a real create-directory endpoint.

Not done: a context-menu entry. The remote context menu only opens on an entry, so
"New folder" there needs a background (empty-space) menu first.


