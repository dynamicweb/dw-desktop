// REPL driver for DW Desktop (Electron). Reads one command per line from stdin,
// so it works interactively or with piped commands:
//
//   printf 'launch\nnav Sync\nss sync\nquit\n' | node .claude/skills/run-dw-desktop/driver.mjs
//
// Launches the BUILT app (out/), so run `npx electron-vite build` first.
// Commands: see help() below. Screenshots land in $SCREENSHOT_DIR (default: ./shots
// next to this file).
//
// Other skills reuse it: createDriver() returns the same commands plus the
// Playwright app and page, and runRepl() is the stdin loop (see ../demo-e2e).
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = import.meta.dirname
export const APP_DIR = path.resolve(SKILL_DIR, '../../..')

export const electronBin = {
  win32: 'node_modules/electron/dist/electron.exe',
  darwin: 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
}[process.platform] ?? 'node_modules/electron/dist/electron'

const help = (shotDir) => `commands:
  launch [--real|--profile=<dir>] [W H]
                          start the app (default 1400x880). By default it uses a
                          throwaway profile (no environments, no credentials);
                          --profile=<dir> reuses that profile dir across launches;
                          --real uses your normal profile and talks to your real sites.
  ss [name]               screenshot the window -> ${shotDir}/<name>.png
  shot <name> <pad> <css> cropped screenshot of the first element matching <css>, padded
  clip <name> <x> <y> <w> <h>  cropped screenshot of a window region (CSS px)
  nav <View>              click a sidebar item: Browse | Sync | Activity | Settings
  theme <light|dark|auto> switch theme for this window only (not saved)
  click <name>            click a button/link by its accessible name (exact text or aria-label)
  menu <local|remote> <n> hover row n (0-based) of a pane and open its "···" menu
  move <x> <y>            move the mouse (e.g. away from a row so no hover shows)
  key <Key>               press a key, e.g. Escape, Enter
  type <text>             type into the focused element
  text                    print the visible text of the main area
  eval <js>               evaluate JS in the page and print the JSON result
  errors                  print console errors / page errors collected so far
  wait <ms>               sleep
  quit                    close the app and exit`

export function cleanEnv() {
  // VS Code (and Claude Code inside it) export ELECTRON_RUN_AS_NODE=1; with it set,
  // electron.exe runs as plain Node and Playwright reports "Process failed to launch!".
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'))
}

// onLaunch(app) runs as soon as the process is up, before the window loads anything.
export function createDriver({
  shotDir = process.env.SCREENSHOT_DIR || path.join(SKILL_DIR, 'shots'),
  onLaunch
} = {}) {
  fs.mkdirSync(shotDir, { recursive: true })
  let app = null
  let page = null
  const errors = []

  const commands = {
    async launch(...args) {
      if (app) return console.log('already launched')
      const real = args.includes('--real')
      const given = args.find((a) => a.startsWith('--profile='))?.slice('--profile='.length)
      const [w, h] = args.filter((a) => !a.startsWith('--')).map(Number)
      const launchArgs = [APP_DIR]
      if (!real) {
        // --profile=<dir> reuses a profile, e.g. to check what survives a relaunch.
        const profile = given
          ? (fs.mkdirSync(given, { recursive: true }), path.resolve(given))
          : fs.mkdtempSync(path.join(os.tmpdir(), 'dw-desktop-driver-'))
        launchArgs.push(`--user-data-dir=${profile}`)
        console.log('profile:', profile)
      }
      app = await electron.launch({
        executablePath: path.join(APP_DIR, electronBin),
        args: launchArgs,
        env: cleanEnv(),
        timeout: 30_000
      })
      if (onLaunch) await onLaunch(app)
      page = await app.firstWindow()
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 400)))
      page.on('pageerror', (e) => errors.push(String(e)))
      await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setSize(w, h), [w || 1400, h || 880])
      // Ready = the sidebar's nav is rendered.
      await page.locator('aside button.nav-item').first().waitFor({ timeout: 20_000 })
      await page.waitForTimeout(1500) // let the first listings load
      console.log('launched:', page.url())
    },

    async ss(name) {
      const f = path.join(shotDir, `${name || `ss-${Date.now()}`}.png`)
      await page.screenshot({ path: f })
      console.log('screenshot:', f)
    },

    // Cropped screenshot of the first element matching a CSS selector, plus padding.
    async shot(name, pad, ...selector) {
      const box = await page.locator(selector.join(' ')).first().boundingBox()
      if (!box) throw new Error(`no visible element for ${selector.join(' ')}`)
      const p = Number(pad) || 0
      // viewportSize() is null for Electron windows; ask the page instead.
      const view = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      const x = Math.max(0, box.x - p)
      const y = Math.max(0, box.y - p)
      const clip = {
        x,
        y,
        width: Math.min(view.width - x, box.width + 2 * p),
        height: Math.min(view.height - y, box.height + 2 * p)
      }
      const f = path.join(shotDir, `${name}.png`)
      await page.screenshot({ path: f, clip })
      console.log('screenshot:', f)
    },

    // Cropped screenshot of a window region in CSS pixels.
    async clip(name, x, y, w, h) {
      const f = path.join(shotDir, `${name}.png`)
      await page.screenshot({ path: f, clip: { x: +x, y: +y, width: +w, height: +h } })
      console.log('screenshot:', f)
    },

    async nav(label) {
      await page.locator('aside button.nav-item', { hasText: label }).first().click()
      await page.waitForTimeout(800)
      console.log('view:', label)
    },

    async theme(t) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), t)
      console.log('theme:', t)
    },

    async click(...words) {
      const name = words.join(' ')
      const target = page.getByRole('button', { name, exact: true })
        .or(page.getByRole('link', { name, exact: true }))
        .or(page.getByRole('radio', { name, exact: true }))
      await target.first().click({ timeout: 5000 })
      await page.waitForTimeout(400)
      console.log('clicked:', name)
    },

    async menu(pane, n) {
      const grid = pane === 'local' ? 'Files on this computer' : 'Files on the server'
      const row = page.locator(`[aria-label="${grid}"] [role="row"]`).nth(Number(n) || 0)
      await row.hover()
      await row.getByRole('button', { name: /More actions/ }).click()
      await page.waitForTimeout(300)
      console.log('menu open on', pane, 'row', n)
    },

    async move(x, y) {
      await page.mouse.move(Number(x) || 0, Number(y) || 0)
      console.log('mouse at', x, y)
    },

    async key(k) {
      await page.keyboard.press(k)
      console.log('pressed:', k)
    },

    async type(...words) {
      await page.keyboard.type(words.join(' '))
      console.log('typed')
    },

    async text() {
      console.log((await page.locator('main').innerText()).slice(0, 4000))
    },

    async eval(...js) {
      console.log(JSON.stringify(await page.evaluate(js.join(' ')), null, 1))
    },

    async errors() {
      console.log(errors.length ? errors.join('\n---\n') : 'no errors')
    },

    async wait(ms) {
      await page.waitForTimeout(Number(ms) || 1000)
    },

    // Closes the app; the REPL exits after it.
    async quit() {
      if (app) await app.close()
      app = null
      page = null
    },

    help() {
      console.log(help(shotDir))
    }
  }

  return {
    commands,
    shotDir,
    errors,
    get app() {
      return app
    },
    get page() {
      return page
    }
  }
}

/** Reads one command per line from stdin and runs them strictly in order. */
export function runRepl(driver, { banner = 'dw-desktop driver ready. "help" lists commands.', commands = driver.commands } = {}) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false })
  console.log(banner)
  // Commands run strictly one after another, even when piped in all at once.
  let chain = Promise.resolve()
  const quit = () => Promise.resolve(commands.quit()).then(() => process.exit(0))
  rl.on('line', (line) => {
    const [cmd, ...args] = line.trim().split(/\s+/)
    if (!cmd) return
    chain = chain.then(async () => {
      const fn = commands[cmd]
      if (!fn) return console.log(`unknown command: ${cmd} ("help" lists commands)`)
      if (cmd === 'quit') return quit()
      if (cmd !== 'launch' && cmd !== 'help' && !driver.page) return console.log('ERROR: launch first')
      try {
        await fn(...args)
      } catch (e) {
        console.log(`ERROR in ${cmd}:`, e.message.split('\n')[0])
      }
    })
  })
  rl.on('close', () => chain.then(quit))
}

const isMain =
  !!process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()
if (isMain) runRepl(createDriver())
