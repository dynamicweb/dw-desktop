# TODOS

All remote file handling goes through the DW10 File Transfer API
(`/Admin/Api/FileTransfer`, see `FILE-TRANSFER-API.md` in the Dynamicweb10 repo).
The old `AssetsByDirectory` / `Upload` / zip-download endpoints are no longer used.

## Phase 2 backlog

### Virtual scrolling for RemoteFileTree

**What:** Replace the current flat rendering of directory entries with a virtual scroller
(e.g., @tanstack/virtual) that renders only visible rows.

**Why:** `GET entries` returns a whole folder in one response and the file list renders
every entry synchronously. There is no truncation any more (the old 96/500-entry limits
are gone), so a folder with thousands of files is fully loaded and fully rendered —
which is correct, but slow to render and scroll.

**Pros:** Handles 100k+ entries smoothly. Consistent with VS Code/Transmit behavior.
Standard UX expectation for a file manager.

**Cons:** New dependency. Requires refactoring LocalTreeRows and EntryChildren to use virtualized
row containers instead of direct div/button rendering.

**Context:** Most DW partner solutions have < 500 files per directory today, but large
image/archive folders exist. Without truncation, rendering cost is the only limit left.
If response size itself becomes a problem, that needs server-side paging on `entries`.

**Depends on:** Nothing — the listing side is done.

---

## Done

### Streaming / chunked upload

Uploads use the File Transfer API's resumable session protocol (`POST uploads` →
`PUT uploads/{id}/chunks/{i}` → `POST uploads/{id}/finalize`). Files are read one chunk
at a time (default 8 MB), so memory no longer scales with file size: peak is about
`FILE_CONCURRENCY × CHUNK_PARALLELISM × chunkSize` (4 × 2 × 8 MB). Progress is reported
per uploaded chunk, chunks carry an `X-Content-Sha256`, and finalize verifies the
full-file SHA-256.

### Deep recursive conflict detection

Before an upload, `checkUploadConflicts` asks the server which target paths already
exist, including files in nested subfolders: per-file `entries/exists` for ≤ 8 files, one
recursive `manifest` walk for larger uploads. The result drives `UploadConflictModal`
(Replace existing / Upload missing only / Cancel). The TOCTOU window is covered too: a
file that appears between the check and finalize comes back as `ALREADY_EXISTS` and is
reported as skipped, not failed.
