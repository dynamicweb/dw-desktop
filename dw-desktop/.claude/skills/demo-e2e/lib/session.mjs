// One scenario's session: a throwaway profile holding only the demo environment,
// the app launched on it with the sandbox guard installed, and helpers to seed and
// check the scenario's folders on both sides.
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createDriver } from '../../run-dw-desktop/driver.mjs'
import { captureEvents, installGuard } from './inject.mjs'

export class Session {
  /**
   * @param {object} o
   * @param {object} o.env          the test environment (from the app's config)
   * @param {string} o.runRoot      run folder as an API path, e.g. DWDesktopQA/20261023-141200-ab12
   * @param {string} o.scenario     scenario name; its folders are <runRoot>/<scenario> and <localRoot>/<scenario>
   * @param {string} o.localRoot    this run's temp folder on this computer
   * @param {string} o.shotDir      where screenshots go
   * @param {boolean} o.allowOutside  lift the path check (host check stays)
   * @param {number} o.budget       request cap for this session
   */
  constructor(o) {
    Object.assign(this, o)
    this.remoteApi = `${o.runRoot}/${o.scenario}`
    this.remote = `/${this.remoteApi}` // virtual path, as the app shows it (rooted at /Files)
    this.local = path.join(o.localRoot, o.scenario)
    fs.mkdirSync(this.local, { recursive: true })
    this.failures = []
    this.events = []
    this.driver = null
  }

  // ── App ──────────────────────────────────────────────────────────────────
  /**
   * Launches the app on a fresh profile. `syncs` become saved syncs (folders
   * default to this scenario's); `pane` sets where Browse opens.
   */
  async launch({ syncs = [], pane = {} } = {}) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-e2e-profile-'))
    const name = this.env.name
    const config = {
      version: 1,
      environments: [this.env],
      activeEnv: name,
      theme: 'light',
      paneState: { [name]: { localPath: this.local, remotePath: this.remote, ...pane } },
      syncs: {
        [name]: syncs.map((s, i) => ({
          id: `e2e-${i}`,
          localPath: this.local,
          remotePath: this.remote,
          direction: 'push',
          compareContent: true,
          deleteExtra: false,
          ...s
        }))
      }
    }
    fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify(config, null, 2))
    this.profile = profile

    const cfg = {
      host: this.env.host,
      protocol: this.env.protocol ?? 'https',
      runRoot: this.runRoot,
      allowOutside: !!this.allowOutside,
      budget: this.budget
    }
    this.driver = createDriver({
      shotDir: this.shotDir,
      onLaunch: (app) => app.evaluate(installGuard, cfg)
    })
    await this.quiet(() => this.driver.commands.launch(`--profile=${profile}`))
    await this.app.evaluate(captureEvents)
    await this.ensureAuth()
    // Browse opened this scenario's server folder before it existed: create it,
    // reload, and drop the "doesn't exist" toast so it isn't in the screenshots.
    await this.fixture('mkdir', this.remoteApi)
    await this.refreshPanes()
    for (const button of await this.page.getByRole('button', { name: 'Dismiss', exact: true }).all())
      await button.click().catch(() => {})
  }

  get app() {
    return this.driver.app
  }

  get page() {
    return this.driver.page
  }

  /** Runs a driver command without its console chatter. */
  async quiet(fn) {
    const log = console.log
    console.log = () => {}
    try {
      return await fn()
    } finally {
      console.log = log
    }
  }

  // The fixture borrows the app's Authorization header, so the app must have
  // talked to the server once. Its first listing usually does; Refresh otherwise.
  async ensureAuth() {
    for (let i = 0; i < 40; i++) {
      const auth = await this.app.evaluate(() => globalThis.__e2e.fixture.authState())
      if (auth === 'ok') return
      if (auth === 'refused')
        throw new Error(
          `${this.env.host} refused the credentials stored for "${this.env.name}". ` +
            'Update them in DW Desktop (Settings > Environments > edit), then run again.'
        )
      if (i === 10) {
        for (const button of await this.page.getByRole('button', { name: 'Refresh', exact: true }).all())
          await button.click().catch(() => {})
      }
      await this.page.waitForTimeout(250)
    }
    throw new Error(`The app never reached ${this.env.host}. Is the site running?`)
  }

  async close({ keep = false, removeRunRoot = false } = {}) {
    if (!this.driver?.app) return
    try {
      if (!keep) await this.fixture('remove', removeRunRoot ? this.runRoot : this.remoteApi)
    } finally {
      this.blocked = await this.app.evaluate(() => globalThis.__e2e.state.blocked.slice()).catch(() => [])
      this.requests = await this.app.evaluate(() => globalThis.__e2e.state.requests).catch(() => 0)
      await this.quiet(() => this.driver.commands.quit())
      fs.rmSync(this.profile, { recursive: true, force: true })
    }
  }

  // ── Server side ──────────────────────────────────────────────────────────
  fixture(op, ...args) {
    return this.app.evaluate((_e, [op, args]) => globalThis.__e2e.fixture[op](...args), [op, args])
  }

  /** Creates files in this scenario's server folder: { 'a/b.txt': 'content' }. */
  async seedRemote(files = {}) {
    await this.fixture('mkdir', this.remoteApi)
    for (const [rel, text] of Object.entries(files)) await this.fixture('put', `${this.remoteApi}/${rel}`, text)
  }

  putRemote(rel, text) {
    return this.fixture('put', `${this.remoteApi}/${rel}`, text)
  }

  readRemote(rel) {
    return this.fixture('read', `${this.remoteApi}/${rel}`)
  }

  checksumRemote(rel) {
    return this.fixture('checksum', `${this.remoteApi}/${rel}`)
  }

  /** The server folder as { 'relative/path': { isDirectory, size } }, keys lower-cased. */
  async listRemote() {
    const entries = (await this.fixture('list', this.remoteApi)) ?? []
    return Object.fromEntries(entries.map((e) => [e.path.toLowerCase(), e]))
  }

  // ── Local side ───────────────────────────────────────────────────────────
  writeLocal(files = {}) {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(this.local, ...rel.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
  }

  localExists(rel) {
    return fs.existsSync(path.join(this.local, ...rel.split('/')))
  }

  readLocal(rel) {
    return fs.readFileSync(path.join(this.local, ...rel.split('/')), 'utf8')
  }

  sha256Local(rel) {
    return createHash('sha256').update(fs.readFileSync(path.join(this.local, ...rel.split('/')))).digest('hex')
  }

  // ── Events from the main process ─────────────────────────────────────────
  async drainEvents() {
    const fresh = await this.app.evaluate(() => globalThis.__e2e.state.events.splice(0))
    this.events.push(...fresh)
    return this.events
  }

  /** Waits for a files:* / sync:* event matching `test`; returns its payload. */
  async waitForEvent(channel, test = () => true, { timeout = 120_000, label = channel } = {}) {
    const end = Date.now() + timeout
    for (;;) {
      const events = await this.drainEvents()
      const i = events.findIndex((e) => e.channel === channel && test(e.payload))
      if (i >= 0) return events.splice(i, 1)[0].payload
      if (Date.now() > end) throw new Error(`Timed out after ${timeout / 1000}s waiting for ${label}`)
      await this.page.waitForTimeout(250)
    }
  }

  // ── UI steps ─────────────────────────────────────────────────────────────
  click(name) {
    return this.quiet(() => this.driver.commands.click(...name.split(' ')))
  }

  ss(name) {
    return this.quiet(() => this.driver.commands.ss(`${this.scenario}-${name}`))
  }

  text() {
    return this.page.locator('main').innerText()
  }

  // Saved syncs are listed in the sidebar while Sync is open.
  async openSavedSync(name) {
    await this.quiet(() => this.driver.commands.nav('Sync'))
    await this.page.locator('aside button.nav-item', { hasText: name }).first().click({ timeout: 10_000 })
    await this.page.waitForTimeout(500)
  }

  /** Previews the sync on screen; returns the run button's label (null when nothing to do). */
  async preview() {
    await this.click('Preview changes')
    const run = this.page.getByRole('button', { name: /^(Deploy|Get) \d+ items?$/ })
    const inSync = this.page.getByText('The folders are already in sync.')
    await run.or(inSync).first().waitFor({ timeout: 60_000 })
    return (await run.count()) ? (await run.first().innerText()).trim() : null
  }

  /** Runs the previewed sync and waits for it to finish. Returns { done, skipped, failed, cancelled }. */
  async runSync() {
    await this.drainEvents()
    this.events.length = 0
    await this.page.getByRole('button', { name: /^(Deploy|Get) \d+ items?$/ }).first().click()
    const finished = await this.waitForEvent('sync:finished', () => true, { label: 'the sync to finish' })
    if (!finished.ok) throw new Error(`The sync didn't run: ${finished.error}`)
    return finished.data
  }

  /** Opens a row's ··· menu in a Browse pane and picks an item. */
  async rowMenu(pane, rowName, item) {
    const grid = pane === 'local' ? 'Files on this computer' : 'Files on the server'
    const row = this.page.locator(`[aria-label="${grid}"] [role="row"]`, { hasText: rowName }).first()
    await row.hover()
    await row.getByRole('button', { name: `More actions for ${rowName}` }).click()
    await this.page.getByText(item, { exact: true }).first().click()
  }

  async refreshPanes() {
    for (const button of await this.page.getByRole('button', { name: 'Refresh', exact: true }).all())
      await button.click().catch(() => {})
    await this.page.waitForTimeout(800)
  }

  // ── Checks ───────────────────────────────────────────────────────────────
  check(ok, message) {
    if (!ok) this.failures.push(message)
    return ok
  }

  /** Each path present (or absent) in a listing: { 'a.txt': true, 'b.txt': false }. */
  checkListing(listing, expected, where) {
    for (const [rel, present] of Object.entries(expected)) {
      const has = !!listing[rel.toLowerCase()]
      this.check(has === present, `${where}: ${rel} should ${present ? 'exist' : 'not exist'}`)
    }
  }

  checkLocal(expected) {
    for (const [rel, present] of Object.entries(expected)) {
      this.check(this.localExists(rel) === present, `this computer: ${rel} should ${present ? 'exist' : 'not exist'}`)
    }
  }
}
