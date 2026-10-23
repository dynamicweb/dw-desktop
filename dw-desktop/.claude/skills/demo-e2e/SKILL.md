---
name: demo-e2e
description: End-to-end tests of DW Desktop against a real Dynamicweb test site (a Development environment on the demo site, a *.dev01.dynamicweb.dk site or a solution on localhost) - deploy, get, delete, upload, cancel/retry, conflicts - driven through the built app, with every write confined to a per-run sandbox folder. Run it on your own, without asking, after changing code that affects what reaches the server (dw-api.ts, sync.ts, exclude.ts, transfers, upload/download, Activity retry or cancel). Not for purely visual changes - use run-dw-desktop for those.
---

# Demo end-to-end tests

Scenarios that run the **built** app against a real test site and check what
actually ends up on the server and on this computer.

**Depends on run-dw-desktop** for two things only: `driver.mjs`
(`createDriver()` - launch, nav, click, ss, quit, and the `onLaunch` hook the
guard is installed through) and the `playwright-core` installed in its folder
(`cd .claude/skills/run-dw-desktop && npm install` once). Everything else here
is self-contained.

All paths below are relative to `dw-desktop/`.

## When to run it

**On your own, without asking**, after a change to anything that decides what
reaches the server: `src/main/dw-api.ts`, `sync.ts`, `exclude.ts`,
`transferState.ts`, the upload/download/delete paths, Activity retry or cancel.
Report the result (PASS/FAIL lines, screenshots worth looking at) afterwards.

**Not needed** for visual-only changes: `run-dw-desktop` with a throwaway
profile is enough there.

**Ask first** for anything that has to write *outside* the run folder - for
example a sync at the `/Files` root with delete, the only way to exercise the
`System/Log` / `Cache.net` protection for real. Write a short plan (what it
touches, what result proves the point, how the site gets back to normal), wait
for the operator's yes, then run with `--allow-outside`. Never on production,
never on a Staging or Production environment, never on a site that isn't a test host
(all refused anyway).

**No test site?** When this machine has no usable test environment (none
configured, several and none chosen, credentials refused, site down) the runner
prints one `SKIPPED: …` line and exits 0. Mention the note in your report and
carry on; don't stop to ask.

## Run

```bash
npx electron-vite build                                  # the runner uses out/
node .claude/skills/demo-e2e/runner.mjs all              # every scenario
node .claude/skills/demo-e2e/runner.mjs deploy-excludes conflict-race
node .claude/skills/demo-e2e/runner.mjs list
```

| Option | Does |
|---|---|
| `--env <name>` | DW Desktop environment to test on (default: `demo.local.json`, else the only Development one on a test host) |
| `--keep` | leave the run folder on the server, to look into a failure |
| `--allow-outside` | lift the run-folder check for this run - only after an approved plan |

Output is one line per scenario, then the screenshot folder
(`shots/<runId>/`, git-ignored). Exit code 0 = all passed (or skipped, see
above); 1 = a scenario failed; 2 = the run couldn't start.

```
demo-e2e run 20261023-092533-lgyk on abi.dwdemo (abi.dwdemo.dynamicweb.cloud)
server folder /Files/DWDesktopQA/20261023-092533-lgyk
PASS  cancel-retry  (21s, 19 requests)
FAIL  deploy-excludes  (8s, 15 requests)
      - server: stale.txt should not exist
```

A full run takes about a minute and well under 100 requests.

## Which site

The test environment is one **already configured in DW Desktop**, so its
credentials are in the OS keychain under that environment's name. The runner
copies only that environment entry into a throwaway profile; the app signs in
with the stored credentials and no test code ever handles a key.

- Only **test hosts** qualify: `*.dwdemo.dynamicweb.cloud`,
  `*.dev01.dynamicweb.dk`, `localhost` / `127.0.0.1` / `::1` / `*.localhost`
  (any port), and only environments of kind **Development** (the default when
  none is set). Staging and Production are refused, even when named.
- Pick one with `--env <name>`, or set a default in `demo.local.json`
  (git-ignored, not secret): `{ "env": "abi.dwdemo" }`. With neither, the only
  configured test environment is used.
- "refused the credentials" means the stored key or secret no longer works (a
  demo restore resets them, for one). Update the environment in DW Desktop
  (Settings > Environments > edit) and run again.

## Safety, enforced in code

- **One site.** The throwaway profile holds only the test environment; your real
  profile (environments, saved syncs, Activity) is never touched.
- **One folder.** Every run writes under `/Files/DWDesktopQA/<runId>/`, one
  subfolder per scenario, plus a temp folder on this computer.
- **The guard** (`lib/inject.mjs`) wraps `fetch` in the app's main process before
  the window loads, so it sees every request the app makes, whichever screen
  caused it. It refuses requests to any other host, File Transfer writes whose
  paths are outside the run folder, chunks for upload sessions it didn't see
  open, and anything past a per-scenario request cap. A refusal fails the
  scenario. The `sandbox-guard` scenario proves the guard still refuses.
- **The fixture** (seeding, changing and reading the server) runs in the same
  process with the `Authorization` header the app itself sent, and has the same
  run-folder check.
- **Cleanup.** Each scenario deletes its folder; the last one deletes the run
  folder; run folders older than a day are swept at the start. `--keep` skips it.
- Local deletes in `get-delete` go to the real recycle bin (temp fixture files only).

## Scenarios

| Name | Proves |
|---|---|
| `deploy-excludes` | Deploy + delete with the junk list, `.gitignore`, `.dwignore` and a pattern: only real files reach the server, excluded server files survive, a folder holding an excluded file is emptied but kept |
| `get-delete` | Get + delete: downloads, trashes local-only files, keeps a folder holding an excluded `.git` |
| `conflict-race` | A server file edited between preview and run is not overwritten (If-Match), the item says why, Retry failed keeps that guard, the next preview lists a conflict |
| `resync-is-clean` | Right after a deploy, previewing again (by content, by date, and a Get by content) finds nothing to do |
| `odd-names` | Names with spaces, %, #, +, &, quotes, brackets and non-ASCII deploy under the same name, read back and stay in sync |
| `folder-download` | A Browse folder download keeps nested folders, an empty file and an empty folder |
| `upload-folder-junk` | A Browse folder upload leaves junk out and Activity says what |
| `cancel-retry` | Cancelling a 48 MB upload leaves nothing on the server; Retry failed completes it and the checksum matches |
| `sandbox-guard` | Writes outside the run folder, other hosts and foreign upload sessions are refused before anything is sent |

## Writing a scenario

One file in `scenarios/`, default-exporting `{ name, description, launch?, run(t) }`.
`launch.syncs` become saved syncs (folders default to the scenario's own);
`launch.pane` sets where Browse opens. `t` is a `Session` (`lib/session.mjs`):

| Helper | Does |
|---|---|
| `t.writeLocal({ 'a/b.txt': 'text' })`, `t.localExists`, `t.readLocal`, `t.sha256Local` | the scenario's local folder |
| `t.seedRemote({...})`, `t.putRemote`, `t.readRemote`, `t.checksumRemote`, `t.listRemote()` | the scenario's server folder (listing keys are lower-cased relative paths) |
| `t.openSavedSync(name)`, `t.preview()`, `t.runSync()` | Sync: preview returns the run button label; runSync waits for the run and returns `{ done, skipped, failed, cancelled }` |
| `t.rowMenu('local'\|'remote', rowName, item)`, `t.refreshPanes()`, `t.click(name)` | Browse and buttons |
| `t.waitForEvent('files:done'\|'files:progress'\|'sync:finished', test)` | what the main process told the window |
| `t.check(ok, msg)`, `t.checkListing(listing, { path: present })`, `t.checkLocal({...})` | record failures (the scenario keeps going) |
| `t.ss(name)`, `t.text()`, `t.page`, `t.app` | screenshots, visible text, raw Playwright |

The app lists the scenario's server folder at launch, before anything is seeded,
so seed and *then* refresh or open what you need. Expect exact item counts in
preview labels: a wrong count is usually a real change in planning.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `refused the credentials stored for …` | update the environment's credentials in DW Desktop |
| `… test environments configured` | pass `--env <name>` or write `demo.local.json` |
| `The app is not built` / old behaviour | `npx electron-vite build` |
| `Process failed to launch!` | see run-dw-desktop's troubleshooting (ELECTRON_RUN_AS_NODE, playwright-core version) |
| a scenario fails with `sandbox refused: …` | the app (or the scenario) wrote outside the run folder - a real finding unless the scenario was meant to |
