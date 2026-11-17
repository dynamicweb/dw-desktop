// Code that runs INSIDE the app's main process (Playwright's electronApp.evaluate).
// Each function is serialized on its own, so it must not use anything from this
// module's scope: everything it needs comes in through `cfg`.

/**
 * The sandbox guard and the fixture client. Installed right after launch, before
 * the window loads anything.
 *
 * Guard: every request the app makes goes through globalThis.fetch (dw-api.ts).
 * A request to any host but the demo site is refused, and so is any write to the
 * File Transfer API whose paths aren't inside the run folder, unless the run was
 * started with --allow-outside. A refused request throws inside the app, so the
 * app reports it as an error, and it is listed in the run's result.
 *
 * Fixture: seeds, changes and reads the run folder on the server with the same
 * Authorization header the app sends. The header never leaves this process.
 */
export function installGuard(_electron, cfg) {
  if (globalThis.__e2e) return
  const crypto = process.getBuiltinModule('node:crypto')
  const FT = '/Admin/Api/FileTransfer'
  const base = `${cfg.protocol}://${cfg.host}${FT}`
  const root = cfg.runRoot.toLowerCase()
  const original = globalThis.fetch
  const state = { events: [], blocked: [], requests: 0, writes: 0, auth: null, authStatus: null, sessions: new Set() }

  const inside = (p) => {
    const lower = String(p).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
    return lower === root || lower.startsWith(`${root}/`)
  }

  globalThis.fetch = async function guardedFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : (input.href ?? input.url))
    const method = String(init.method || 'GET').toUpperCase()
    const deny = (why) => {
      state.blocked.push(`${method} ${url.pathname}: ${why}`)
      throw new Error(`Blocked by the demo-e2e sandbox: ${why}`)
    }
    if (url.host.toLowerCase() !== cfg.host.toLowerCase()) deny(`${url.host} is not the demo site`)
    if (++state.requests > cfg.budget) deny(`more than ${cfg.budget} requests in this run`)
    const headers = init.headers ?? {}
    const auth = typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization
    // The fixture borrows the header only once the server has accepted it.
    const noteAuth = (response) => {
      if (!auth || !url.pathname.startsWith(FT)) return response
      state.authStatus = response.status
      if (response.status !== 401 && response.status !== 403) state.auth = auth
      return response
    }

    if (method === 'GET' || method === 'HEAD' || !url.pathname.startsWith(`${FT}/`)) {
      return noteAuth(await original(input, init))
    }
    const route = url.pathname.slice(FT.length + 1)
    const session = /^uploads\/([^/]+)/.exec(route)
    if (!cfg.allowOutside) {
      if (session) {
        if (!state.sessions.has(session[1])) deny(`upload session ${session[1]} wasn't opened in the run folder`)
      } else {
        let body = {}
        try {
          body = JSON.parse(typeof init.body === 'string' ? init.body : '{}')
        } catch {
          // Not JSON: no paths to check, refused below.
        }
        const paths = Object.entries(body)
          .filter(([key, value]) => /path$/i.test(key) && typeof value === 'string')
          .map(([, value]) => value)
        if (paths.length === 0) deny(`no path to check in a ${route} request`)
        const outside = paths.find((p) => !inside(p))
        if (outside !== undefined) deny(`"${outside}" is outside ${cfg.runRoot}`)
      }
    }
    state.writes++
    const response = noteAuth(await original(input, init))
    if (route === 'uploads' && response.ok) {
      try {
        const created = await response.clone().json()
        if (created?.id) state.sessions.add(String(created.id))
      } catch {
        // No id: its chunks will be refused.
      }
    }
    return response
  }

  async function api(method, route, { query, json, body, headers = {}, ok = [] } = {}) {
    if (!state.auth) throw new Error('No credentials seen yet: the app has not talked to the server.')
    const all = { Authorization: state.auth, ...headers }
    let payload = body
    if (json !== undefined) {
      all['Content-Type'] = 'application/json'
      all['Idempotency-Key'] = crypto.randomUUID()
      payload = JSON.stringify(json)
    }
    const qs = query ? `?${new URLSearchParams(query)}` : ''
    const response = await original(`${base}/${route}${qs}`, { method, headers: all, body: payload })
    if (!response.ok && !ok.includes(response.status))
      throw new Error(`${method} ${route} -> ${response.status} ${(await response.text()).slice(0, 300)}`)
    return response
  }
  const guardPath = (p) => {
    if (!inside(p)) throw new Error(`fixture: "${p}" is outside ${cfg.runRoot}`)
    return p
  }
  const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex')

  const fixture = {
    /** 'ok', 'refused' (the server answered 401/403) or 'pending' (nothing sent yet). */
    authState: () => (state.auth ? 'ok' : state.authStatus ? 'refused' : 'pending'),

    async mkdir(path) {
      guardPath(path)
      const parts = path.split('/')
      for (let i = 1; i <= parts.length; i++) {
        await api('POST', 'entries/directory', { json: { path: parts.slice(0, i).join('/') }, ok: [409] })
      }
    },

    /** Writes a text file, replacing what is there. Returns the new eTag. */
    async put(path, text) {
      guardPath(path)
      const data = Buffer.from(text, 'utf8')
      const session = await (
        await api('POST', 'uploads', { json: { targetPath: path, fileSize: data.length } })
      ).json()
      for (let i = 0; i < session.totalChunks; i++) {
        const chunk = data.subarray(i * session.chunkSize, (i + 1) * session.chunkSize)
        await api('PUT', `uploads/${session.id}/chunks/${i}`, {
          body: chunk,
          headers: { 'Content-Type': 'application/octet-stream', 'X-Content-Sha256': sha256(chunk) }
        })
      }
      const done = await (
        await api('POST', `uploads/${session.id}/finalize`, { json: { sha256: sha256(data), overwrite: true } })
      ).json()
      return done?.eTag ?? null
    },

    /** Every entry below a folder (paths relative to it), or null when it doesn't exist. */
    async list(path) {
      const entries = []
      let cursor = null
      do {
        const query = { path, pageSize: '1000' }
        if (cursor) query.cursor = cursor
        const response = await api('GET', 'manifest', { query, ok: [404] })
        if (response.status === 404) return null
        const page = await response.json()
        entries.push(...page.entries.map((e) => ({ path: e.path, isDirectory: e.isDirectory, size: e.size })))
        cursor = page.nextCursor
      } while (cursor)
      return entries
    },

    async read(path) {
      return (await api('GET', 'entries/download', { query: { path } })).text()
    },

    async checksum(path) {
      return (await (await api('GET', 'entries/checksum', { query: { path } })).json()).value
    },

    async remove(path) {
      guardPath(path)
      await api('POST', 'entries/delete', { json: { path, recursive: true }, ok: [404] })
    },

    /** Deletes run folders of earlier runs under `parent` that are older than `maxAgeMs`. */
    async sweep(parent, maxAgeMs) {
      const response = await api('GET', 'entries', { query: { path: parent }, ok: [404] })
      if (response.status === 404) return []
      const removed = []
      for (const entry of await response.json()) {
        const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[a-z0-9]+$/.exec(entry.name)
        if (!entry.isDirectory || !m) continue
        const started = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
        if (Date.now() - started < maxAgeMs) continue
        await api('POST', 'entries/delete', { json: { path: `${parent}/${entry.name}`, recursive: true }, ok: [404] })
        removed.push(entry.name)
      }
      return removed
    }
  }

  globalThis.__e2e = { state, fixture }
}

/** Records what the main process tells the window about transfers (files:*, sync:*). */
export function captureEvents(electron) {
  const state = globalThis.__e2e.state
  const contents = electron.BrowserWindow.getAllWindows()[0].webContents
  let proto = Object.getPrototypeOf(contents)
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'send')) proto = Object.getPrototypeOf(proto)
  if (!proto || proto.send.__e2e) return
  const send = proto.send
  const patched = function (channel, ...args) {
    if (/^(files|sync):/.test(channel)) state.events.push({ channel, payload: args[0], at: Date.now() })
    return send.call(this, channel, ...args)
  }
  patched.__e2e = true
  proto.send = patched
}
