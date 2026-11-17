---
name: run-dw-desktop
description: Build, run, launch, drive and screenshot the DW Desktop Electron app (dw-desktop) — click through Browse / Sync / Activity / Settings, open menus, check light/dark, read console errors. Use when asked to run, start, test in the real app, take a screenshot, or verify a UI change in dw-desktop.
---

# Run DW Desktop

DW Desktop is an Electron + React app (electron-vite) for moving files between a
local folder and a Dynamicweb 10 site through the File Transfer API. Agents drive
the **built** app with `driver.mjs`, a stdin REPL on top of Playwright's
`_electron`: pipe commands in, get screenshots and text out.

All paths below are relative to `dw-desktop/`. Verified on Windows 11 (arm64) with
a real desktop; the driver has Linux/macOS binary paths but they were not run.

## Prerequisites

- Node 24 (`node -v` → v24.13.0 was used) and the app's own deps: `npm install`.
- The driver's one dependency (kept out of the app's `package.json`):

```bash
cd .claude/skills/run-dw-desktop && npm install && cd ../../..
```

## Build

The driver launches `out/`, so build after every source change:

```bash
npx electron-vite build
```

(`npm run build` does the same plus a typecheck — slower, fine before a commit.)

## Run (agent path)

```bash
printf 'launch\nss browse\nnav Settings\nss settings\nclick Add environment\nss add-env\ntheme dark\nss add-env-dark\nerrors\nquit\n' \
  | node .claude/skills/run-dw-desktop/driver.mjs
```

Screenshots land in `.claude/skills/run-dw-desktop/shots/` (git-ignored; override
with `SCREENSHOT_DIR`). **Open the PNGs and look at them.**

`launch` uses a **throwaway profile** (`--user-data-dir` in the temp dir): no
environments, no credentials, nothing on any real site can change. To see real
server listings and sync previews, launch with your normal profile:

```bash
printf 'launch --real\nmenu remote 1\nss menu\nkey Escape\nnav Sync\nclick Preview changes\nwait 4000\nss sync-preview\ntext\nquit\n' \
  | node .claude/skills/run-dw-desktop/driver.mjs
```

`--real` talks to the user's actual sites. Only *read* there (browse, preview,
screenshots); never click Deploy / Get / Delete / Upload unless asked.

Commands (`help` prints them):

| Command | Does |
|---|---|
| `launch [--real\|--profile=<dir>] [W H]` | start the app (default 1400×880); `--profile=<dir>` reuses a profile across launches, e.g. to check what survives a relaunch (`<dir>/activity.json` is the Activity history — write seed data with `node`, not a shell heredoc, or `\` in Windows paths breaks the JSON) |
| `ss [name]` | screenshot → `shots/<name>.png` |
| `nav Browse\|Sync\|Activity\|Settings` | click a sidebar item |
| `theme light\|dark\|auto` | switch theme for this window only (not saved) |
| `click <name>` | click a button / link / radio by accessible name (exact) |
| `menu local\|remote <n>` | hover row *n* (0-based) and open its "···" menu |
| `key <Key>` / `type <text>` | keyboard input |
| `text` | print the visible text of the main area |
| `eval <js>` | evaluate JS in the page, print JSON |
| `errors` | console + page errors collected so far |
| `wait <ms>` / `quit` | |

Commands run strictly in order even when piped at once; a failing command prints
`ERROR in <cmd>: …` and the session continues. Closing stdin quits the app.

## Run (human path)

```bash
npm run dev
```

Opens a window with hot reload. Not useful for agents (no handle on the window).

## Test

```bash
npm run typecheck
npx vitest run
```

Direct invocation without the app: main-process logic (`src/main/dw-api.ts`,
`src/main/sync.ts`) is covered by vitest with `fetch` / `./dw-api` mocked — copy the
pattern in `src/main/sync.test.ts` (real temp folder for the local side, an
in-memory `TransferState`) to exercise a function directly.

For transfers against a real server (deploy, get, delete, upload, cancel/retry)
use the **demo-e2e** skill (`../demo-e2e/SKILL.md`): scripted scenarios on a test
site, writes confined to a sandbox folder.

## Reused by demo-e2e

`driver.mjs` exports `createDriver({ shotDir, onLaunch })` (the same commands,
plus the Playwright `app` and `page`) and `runRepl()`; it only starts the REPL
when run directly. demo-e2e imports it and uses `launch` (with `onLaunch` to
install its guard before the window loads), `nav`, `click`, `ss`, `quit`, and
resolves `playwright-core` from this folder's `node_modules`. After changing the
driver, run `node .claude/skills/demo-e2e/runner.mjs sandbox-guard` as a smoke test.

## Gotchas

- **`ELECTRON_RUN_AS_NODE=1` is set in VS Code terminals** (and in Claude Code
  running inside VS Code). With it, `electron.exe` starts as plain Node and
  Playwright fails with `Process failed to launch!`. The driver strips it from the
  child env; do the same in any ad-hoc script.
- **Playwright 1.49 can't launch Electron 39** (same `Process failed to launch!`).
  The driver pins `playwright-core@1.56.1`, which works.
- **`theme` is page-only on purpose.** Clicking the theme buttons in Settings saves
  the choice to the user's config; use `theme` to screenshot both modes without
  changing their setting.
- **`launch --real` writes pane state** (last local/remote folder per environment)
  to `%APPDATA%\dw-desktop\config.json`, exactly as normal use does.
- **Row "···" buttons only exist while a row is hovered or selected** — use
  `menu`, not `click More actions…`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Process failed to launch!` | `ELECTRON_RUN_AS_NODE` leaked into the env, or playwright-core is older than 1.56 |
| Console errors `Loading the font 'data:font/woff2…' violates the following Content Security Policy directive` | `font-src 'self' data:` missing from the CSP in `src/renderer/index.html` (Vite inlines small font files as data URIs); rebuild |
| Screenshot shows old UI | you didn't rebuild — `npx electron-vite build` |
| `ERROR in launch: page.waitForTimeout: Target page, context or browser has been closed` | seen once when a session started right after the previous one closed; not reproducible — run it again |
| `ERROR in click: locator.click: Timeout 5000ms exceeded.` | no button/link/radio with exactly that name; check the names with `text` |
