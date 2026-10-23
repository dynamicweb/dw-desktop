// File and folder names that need encoding in URLs and JSON make the round trip:
// deployed under the same name, readable back, and in sync on the next preview.
const NAMES = [
  'æøå fil (1).txt',
  '100%.txt',
  '#hash.txt',
  'a+b=c&d.txt',
  "it's.txt",
  '[brackets].txt',
  'Ünïcødé/naïve café.txt',
  'deep/nested/with space/x.txt'
]

export default {
  name: 'odd-names',
  description: 'Names with spaces, %, #, +, &, quotes, brackets and non-ASCII round-trip',
  launch: { syncs: [{ name: 'E2E odd-names', direction: 'push' }] },

  async run(t) {
    t.writeLocal(Object.fromEntries(NAMES.map((n) => [n, `content of ${n}`])))

    await t.openSavedSync('E2E odd-names')
    await t.preview()
    const result = await t.runSync()
    t.check(result.failed === 0 && !result.cancelled, `sync result ${JSON.stringify(result)}`)
    const failed = t.events.filter((e) => e.channel === 'files:done' && !e.payload.ok)
    for (const f of failed) t.failures.push(`item failed: ${f.payload.error}`)

    const server = await t.listRemote()
    for (const name of NAMES) {
      if (!t.check(!!server[name.toLowerCase()], `server: "${name}" is missing`)) continue
      const content = await t.readRemote(name)
      t.check(content === `content of ${name}`, `server: "${name}" has the wrong content`)
    }

    await t.openSavedSync('E2E odd-names')
    const again = await t.preview()
    t.check(again === null, `the next preview wants to "${again}"`)
    if (again) await t.ss('preview-again')
  }
}
