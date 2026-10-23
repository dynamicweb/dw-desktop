// A server folder downloaded from Browse arrives whole: nested folders, an empty
// file and an empty folder, wrapped in a folder of its own name.
import * as fs from 'node:fs'
import * as path from 'node:path'

function partials(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.dwpart'))
}

export default {
  name: 'folder-download',
  description: 'Browse folder download keeps nested folders, an empty file and an empty folder',

  async run(t) {
    await t.seedRemote({
      'pack/a.txt': 'alpha',
      'pack/empty.txt': '',
      'pack/sub/b.txt': 'beta'
    })
    await t.fixture('mkdir', `${t.remoteApi}/pack/emptydir`)
    await t.refreshPanes()

    await t.rowMenu('remote', 'pack', 'Download to this computer')
    const pack = path.join(t.local, 'pack')
    await t.waitUntil(
      () =>
        t.localExists('pack/a.txt') &&
        t.localExists('pack/empty.txt') &&
        t.localExists('pack/sub/b.txt') &&
        partials(pack).length === 0,
      { label: 'the download to finish' }
    )
    await t.page.waitForTimeout(500)

    t.checkLocal({
      'pack/a.txt': true,
      'pack/empty.txt': true,
      'pack/sub/b.txt': true,
      'pack/emptydir': true
    })
    if (t.localExists('pack/a.txt')) t.check(t.readLocal('pack/a.txt') === 'alpha', 'pack/a.txt has the wrong content')
    if (t.localExists('pack/empty.txt'))
      t.check(fs.statSync(path.join(pack, 'empty.txt')).size === 0, 'pack/empty.txt is not empty')
    t.check(partials(pack).length === 0, 'partial .dwpart files were left behind')
    await t.ss('downloaded')
  }
}
