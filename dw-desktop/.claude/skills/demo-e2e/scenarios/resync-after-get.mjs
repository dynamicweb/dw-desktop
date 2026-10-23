// Right after a Get, previewing again finds nothing to do - also by date, although
// every downloaded file is dated by when it landed here, after the server's copy.
const SYNCS = [
  { name: 'E2E reget get', direction: 'pull', compareContent: true },
  { name: 'E2E reget deploy by date', direction: 'push', compareContent: false },
  { name: 'E2E reget deploy', direction: 'push', compareContent: true },
  { name: 'E2E reget get by date', direction: 'pull', compareContent: false }
]

export default {
  name: 'resync-after-get',
  description: 'Previewing again right after a get (deploy or get, by content or date) finds nothing to do',
  launch: { syncs: SYNCS },

  async run(t) {
    await t.seedRemote({
      'a.txt': 'alpha',
      'css/site.css': 'body { margin: 0 }',
      'img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>'
    })

    await t.openSavedSync(SYNCS[0].name)
    const label = await t.preview()
    t.check(label === 'Get 5 items', `run button says "${label}", expected "Get 5 items"`)
    const result = await t.runSync()
    t.check(result.failed === 0 && !result.cancelled, `sync result ${JSON.stringify(result)}`)

    for (const sync of SYNCS) {
      await t.openSavedSync(sync.name)
      const again = await t.preview()
      if (!t.check(again === null, `"${sync.name}" right after the get wants to "${again}"`))
        await t.ss(sync.name.replace(/\W+/g, '-'))
    }
  }
}
