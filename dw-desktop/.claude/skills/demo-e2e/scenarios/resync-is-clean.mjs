// Right after a deploy, previewing again finds nothing to do: the sync baseline,
// the server's checksums and its timestamps agree with what was just sent.
import * as fs from 'node:fs'
import * as path from 'node:path'

const SYNCS = [
  { name: 'E2E resync deploy', direction: 'push', compareContent: true },
  { name: 'E2E resync deploy by date', direction: 'push', compareContent: false },
  { name: 'E2E resync get', direction: 'pull', compareContent: true },
  { name: 'E2E resync get by date', direction: 'pull', compareContent: false }
]

export default {
  name: 'resync-is-clean',
  description: 'Previewing again right after a deploy (deploy or get, by content or date) finds nothing to do',
  launch: { syncs: SYNCS },

  async run(t) {
    t.writeLocal({
      'a.txt': 'alpha',
      'css/site.css': 'body { margin: 0 }',
      'img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>'
    })
    // Real files are older than the deploy: date them a day back.
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000)
    for (const rel of ['a.txt', 'css/site.css', 'img/logo.svg'])
      fs.utimesSync(path.join(t.local, ...rel.split('/')), dayAgo, dayAgo)

    await t.openSavedSync(SYNCS[0].name)
    const label = await t.preview()
    t.check(label === 'Deploy 5 items', `run button says "${label}", expected "Deploy 5 items"`)
    const result = await t.runSync()
    t.check(result.failed === 0 && !result.cancelled, `sync result ${JSON.stringify(result)}`)

    for (const sync of SYNCS) {
      await t.openSavedSync(sync.name)
      const again = await t.preview()
      if (!t.check(again === null, `"${sync.name}" right after the deploy wants to "${again}"`))
        await t.ss(sync.name.replace(/\W+/g, '-'))
    }
  }
}
