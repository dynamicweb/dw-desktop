# TODOS

## Phase 2 backlog

### Streaming multipart upload

**What:** Replace the current in-memory FormData approach with a streaming multipart encoder
that pipes file chunks directly into the HTTP POST body.

**Why:** Currently all upload files are read entirely into memory before posting. 300 x 200MB =
catastrophic. The batch count cap approved for Phase 1 helps with request count but not with
memory per batch. Streaming eliminates the memory ceiling entirely.

**Pros:** No memory limit on uploads. Enables real per-byte progress bars (not per-read fakes).

**Cons:** Requires replacing built-in FormData with a streaming library (e.g., `form-data` npm
package). Moderate refactor of uploadFiles() in dw-api.ts.

**Context:** Phase 1 uploads use 300-file count batching + a 100MB byte cap per batch as a
guard rail. This is sufficient for typical partner use (small template files). Streaming is
needed if partners upload video or large asset directories.

**Depends on:** Phase 1 upload completion and stabilization.

---

### Virtual scrolling for RemoteFileTree

**What:** Replace the current flat rendering of directory entries with a virtual scroller
(e.g., @tanstack/virtual) that renders only visible rows.

**Why:** Phase 1 truncates directory listings at 500 entries + "Load more". That's a workaround,
not a solution. DW solutions with large archives (thousands of files in a single directory)
degrade the tree UI.

**Pros:** No entry limits. Handles 100k+ entries smoothly. Consistent with VS Code/Transmit behavior.
Standard UX expectation for a file manager.

**Cons:** New dependency. Requires refactoring LocalTreeRows and EntryChildren to use virtualized
row containers instead of direct div/button rendering.

**Context:** Phase 1 RemoteFileTree renders all entries synchronously. The 500-entry limit in
Phase 1 prevents the crash but truncates. Most DW partner solutions have < 500 files per
directory today — but this will matter as usage grows.

**Depends on:** Phase 1 RemoteFileTree stability.

---

### Deep recursive conflict detection

**What:** Extend the ConflictBanner to detect filename conflicts in subdirectories, not just
the current top-level remote directory.

**Why:** Phase 1 conflict detection is shallow: it compares local filenames against the entries
in the current remote directory. For directory uploads, files in nested subdirectories may
conflict without being detected. User thinks they're uploading safely; overwrites happen silently.

**Pros:** Complete conflict detection matches user expectations for directory uploads.

**Cons:** Requires pre-fetching the full remote subtree before upload (expensive for deep trees).
Introduces a preflight window where the remote state can change between check and POST (TOCTOU).

**Context:** Phase 1 limitation noted: ConflictBanner shows "N files already exist" based on
shallow comparison only. The Skip/Replace options apply only to detected conflicts. Deep conflict
detection needs a recursive list walk before upload begins.

**Depends on:** Phase 1 ConflictBanner implementation and upload flow stabilization.
