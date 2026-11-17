// Get with delete: what is new on the server comes down, local-only files go to the
// trash, and a local folder holding an excluded .git is emptied but kept.
export default {
  name: 'get-delete',
  description: 'Get + delete: downloads, trashes local-only files, keeps excluded .git',
  launch: { syncs: [{ name: 'E2E get-delete', direction: 'pull', deleteExtra: true }] },

  async run(t) {
    t.writeLocal({
      'a.txt': 'same',
      'local-only.txt': 'mine',
      'Designs/old.css': 'old',
      'Designs/.git/HEAD': 'ref'
    })
    await t.seedRemote({
      'a.txt': 'same',
      'new.txt': 'from the server',
      'Templates/page.cshtml': 'page'
    })

    await t.openSavedSync('E2E get-delete')
    const label = await t.preview()
    t.check(label === 'Get 5 items', `run button says "${label}", expected "Get 5 items"`)
    await t.ss('preview')

    const result = await t.runSync()
    t.check(result.failed === 0 && !result.cancelled, `sync result ${JSON.stringify(result)}`)

    t.checkLocal({
      'a.txt': true,
      'new.txt': true,
      'Templates/page.cshtml': true,
      'local-only.txt': false,
      'Designs/old.css': false,
      Designs: true,
      'Designs/.git/HEAD': true
    })
    if (t.localExists('new.txt')) t.check(t.readLocal('new.txt') === 'from the server', 'new.txt has the wrong content')
    t.checkListing(
      await t.listRemote(),
      { 'a.txt': true, 'new.txt': true, 'Templates/page.cshtml': true },
      'server (must be untouched)'
    )
  }
}
