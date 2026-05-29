# DW Desktop

Desktop GUI for DynamicWeb 10 management — file transfers, environments, authentication.

Electron + electron-vite + React 19 + TypeScript + Tailwind v4. Main / preload / renderer live under `src/`, shared types under `src/shared/`.

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
