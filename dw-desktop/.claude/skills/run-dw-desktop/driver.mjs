// REPL driver for DW Desktop (Electron). Reads one command per line from stdin,
// so it works interactively or with piped commands:
//
//   printf 'launch\nnav Sync\nss sync\nquit\n' | node .claude/skills/run-dw-desktop/driver.mjs
//
// Launches the BUILT app (out/), so run `npx electron-vite build` first.
// Commands: see HELP below. Screenshots land in $SCREENSHOT_DIR (default: ./shots
// next to this file).
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'

const SKILL_DIR = import.meta.dirname
const APP_DIR = path.resolve(SKILL_DIR, '../../..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(SKILL_DIR, 'shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = {
  win32: 'node_modules/electron/dist/electron.exe',
  darwin: 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
}[process.platform] ?? 'node_modules/electron/dist/electron'

const HELP = `commands:
  launch [--real|--profile=<dir>] [W H]
                          start the app (default 1400x880). By default it uses a
                          throwaway profile (no environments, no credentials);
                          --profile=<dir> reuses that profile dir across launches;
                          --real uses your normal profile and talks to your real sites.
  ss [name]               screenshot the window -> ${SHOT_DIR}/<name>.png
  nav <View>              click a sidebar item: Browse | Sync | Activity | Settings
  theme <light|dark|auto> switch theme for this window only (not saved)
  click <name>            click a button/link by its accessible name (exact text or aria-label)
  menu <local|remote> <n> hover row n (0-based) of a pane and open its "···" menu
  key <Key>               press a key, e.g. Escape, Enter
  type <text>             type into the focused element
  text                    print the visible text of the main area
  eval <js>               evaluate JS in the page and print the JSON result
  errors                  print console errors / page errors collected so far
  wait <ms>               sleep
  quit                    close the app and exit`

let app = null
let page = null
const errors = []

function cleanEnv() {
  // VS Code (and Claude Code inside it) export ELECTRON_RUN_AS_NODE=1; with it set,
  // electron.exe runs as plain Node and Playwright reports "Process failed to launch!".
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'))
}

const COMMANDS = {
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
    const f = path.join(SHOT_DIR, `${name || `ss-${Date.now()}`}.png`)
    await page.screenshot({ path: f })
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

  async quit() {
    if (app) await app.close()
    process.exit(0)
  },

  help() {
    console.log(HELP)
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })
console.log('dw-desktop driver ready. "help" lists commands.')
// Commands run strictly one after another, even when piped in all at once.
let chain = Promise.resolve()
rl.on('line', (line) => {
  const [cmd, ...args] = line.trim().split(/\s+/)
  if (!cmd) return
  chain = chain.then(async () => {
    const fn = COMMANDS[cmd]
    if (!fn) return console.log(`unknown command: ${cmd} ("help" lists commands)`)
    if (cmd !== 'launch' && cmd !== 'help' && cmd !== 'quit' && !page) return console.log('ERROR: launch first')
    try {
      await fn(...args)
    } catch (e) {
      console.log(`ERROR in ${cmd}:`, e.message.split('\n')[0])
    }
  })
})
rl.on('close', () => chain.then(() => COMMANDS.quit()))
