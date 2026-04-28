# TODOS — For Review

Feature gaps identified by comparing DW Desktop against established file-transfer
tools (Transmit, Cyberduck, FileZilla, WinSCP, Mountain Duck, Beyond Compare).
Sorted by priority based on day-to-day friction for the target audience: DW
partners deploying to and maintaining DW10 solutions.

This list deliberately excludes items already tracked in TODOS.md (streaming
multipart upload, virtual scrolling for RemoteFileTree, deep recursive conflict
detection).

---

## High priority — daily friction

### Create new folder (remote)

**What:** Add a "New folder" action to the remote pane (toolbar button + context-menu
entry) that creates an empty directory at the current remote path.

**Why:** Today, the only way to create a remote folder is to upload a local folder
that already contains files. Partners frequently need to scaffold target
directories on a fresh solution before the first deployment, or split an existing
flat structure into subfolders.

**Pros:** Removes a workflow blocker that every other file manager solves by default.

**Cons:** The DW Management API has no dedicated create-folder endpoint. The only
confirmed path is a workaround: upload a placeholder file with
`createMissingDirectories=true` to force directory creation, then immediately
delete it. This is fragile if the delete fails. The `FileCreateRename` endpoint
(used for rename today) may accept a directory-creation variant — needs a quick
API investigation before committing to either approach.

**Context:** All comparable tools put this on a visible toolbar button. Its absence
is the most-reported-feeling gap.

**Value:** High — every partner hits this immediately; blocks basic reorganization
workflows with no clean workaround.

**Difficulty:** Medium — no direct API endpoint confirmed; needs investigation first.
If `FileCreateRename` supports directories the implementation becomes trivial; if not,
the placeholder-upload-then-delete workaround works but requires careful error
handling.

---

### Folder compare view

**What:** A side-by-side diff view that highlights which files differ between the
local and remote pane (by name, size, modified date). Color-code: only-on-left,
only-on-right, both-but-different, identical.

**Why:** This is the single most common question a partner asks during deployment:
"is my remote actually up to date with my local build?" Today there is no answer
without manually downloading and diffing.

**Pros:** Pure client-side feature on already-listed entries. Acts as a direct
precursor to folder sync — once you can compare, sync is the obvious follow-up.

**Cons:** No content hashing in the API — comparison is limited to name,
`sizeInBytes`, and `updatedAt` (all confirmed returned by `AssetsByDirectory`).
This is sufficient for typical deployment validation but won't catch a file
modified and then reverted to the exact same byte size.

**Context:** The existing dual-pane layout is structurally perfect for this — the
comparison is a styling overlay on existing FileList rows. All required metadata
(`sizeInBytes`, `updatedAt`) is already fetched and stored in `FileEntry`.

**Value:** Very High — directly answers the primary deployment question; transforms
the app from "file browser" to "deployment tool".

**Difficulty:** Low-Medium — all the data already exists in loaded `FileEntry`
arrays; no new API calls needed. The work is purely visual (diff overlay on
FileList rows) plus straightforward name+size+mtime comparison logic.

---

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

**Cons:** Interacts awkwardly with the 500-entry truncation — a match could exist
in the un-fetched tail. Best paired with the virtual-scrolling work in TODOS.md.

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

**Pros:** No backend changes — `AssetsByDirectory` already returns `sizeInBytes`
and `updatedAt` for every entry, so all four sort keys (name, size, type, date)
are available without extra API calls.

**Cons:** Need a clear convention for directories-first vs. fully mixed sort order.
Local entries also have size and mtime via Node.js `fs.stat`.

**Context:** All required data is already in the loaded `FileEntry` objects. Sort
order today is whatever `AssetsByDirectory` returns, which appears effectively
arbitrary.

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

**Cons:** Real complexity — recursive remote walk, diff preview UI, conflict
handling, deletions on the target side.

**Context:** Builds on Folder compare view (above) as a hard prerequisite.

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

**What:** Make the transfer log actionable: pause/resume the queue as a whole,
cancel an individual in-flight transfer, retry a failed transfer without
re-initiating from scratch. (True partial-upload resume is a stretch goal
dependent on streaming-upload backend support.)

**Why:** Long uploads on flaky networks currently fail with no recourse but to
start over. Cancel is basic queue control.

**Pros:** Standard in every comparable tool; pause and cancel are low-cost to
implement.

**Cons:** True resume after partial failure requires backend HTTP Range support —
likely a Phase 3 item alongside the streaming-upload work in TODOS.md.

**Context:** The transfer log is record-only today.

**Value:** Medium-High — cancel and retry deliver most of the value and matter
most when large batches or slow connections are involved.

**Difficulty:** Medium — cancel: abort the current fetch (easy); pause: stop
dispatching next queued jobs (easy); retry: re-queue same parameters (easy);
true partial resume requires backend investigation.

---

### Cross-path move

**What:** Drag a remote file/folder into a different remote directory to move it
server-side. Currently only in-place rename works; moving requires a manual
download + reupload.

**Why:** Reorganizing remote solution structure (moving images to a different
category folder, restructuring Templates) is a real operation that partners do.

**Pros:** A server-side Copy endpoint already exists (`/Admin/Api/Management/Files/Copy`)
and Delete is already implemented. Move = Copy + Delete, entirely server-side with
no download or reupload needed.

**Cons:** Two API calls instead of one, so a failure between Copy and Delete leaves
a duplicate. Needs a clean rollback or at minimum a clear error message.

**Context:** In-place rename works today; the Copy endpoint is already wired into
`dw-api.ts` (used internally). Cross-path move is a small step on top.

**Value:** Medium — useful for reorganization tasks but not a daily operation.

**Difficulty:** Low — Copy and Delete are both already implemented; the main work
is wiring drag-to-folder (a different folder, not the current one) in FileList and
handling the Copy-succeeded-but-Delete-failed edge case.

---

### Configurable transfer concurrency

**What:** Replace the current serial `for` loop in `handleUpload` /
`handleDownload` with a promise pool (e.g., `p-limit`) with a configurable max
(default 4). Expose the setting in preferences.

**Why:** Uploading 300 small template files one-at-a-time is significantly slower
than running 4 in parallel. Partners deploying full template sets feel this directly.

**Pros:** Often a 4–10× real-world speedup for many-small-file batches with no
backend changes.

**Cons:** The HTTP agent in the codebase caps at `maxSockets: 8`, which sets the
practical ceiling. Auth-token contention (especially OAuth token refresh) may
also limit safe parallelism. Default of 4 is a reasonable starting point.

**Context:** The upload loop in `dw-api.ts` is currently a serial `for` loop over
300-file batches. The HTTP agent already supports 8 concurrent sockets — the
client just doesn't use them for batches.

**Value:** High — measurable, immediately noticeable speedup for the most common
deployment pattern (deploying a Templates folder with many small files).

**Difficulty:** Low-Medium — replacing the serial loop with a promise pool is
~50 lines; the preference UI adds a little more. No API or protocol changes needed.

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
auto-rename) in the upload conflict banner, instead of the current all-or-nothing
"Skip existing / Replace all".

**Why:** Real uploads often have a mix — most files should overwrite, one or two
should be preserved. Today the user must manually exclude files before uploading.

**Pros:** Matches the standard OS file-copy dialog. No new transfer-protocol work.

**Cons:** UI for many conflicts gets long; needs an "apply to remaining" affordance
to stay usable. Full correctness depends on the deep-recursive-conflict-detection
item in TODOS.md.

**Context:** Builds on the existing ConflictBanner in DualPaneBrowser.

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


