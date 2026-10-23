// A folder uploaded from Browse leaves the built-in junk out and says so in Activity.
export default {
  name: 'upload-folder-junk',
  description: 'Browse folder upload skips .DS_Store, node_modules, *.tmp and reports them',

  async run(t) {
    t.writeLocal({
      'site/page.cshtml': 'page',
      'site/css/a.css': 'css',
      'site/.DS_Store': 'junk',
      'site/backup.tmp': 'junk',
      'site/node_modules/x/index.js': 'junk'
    })
    await t.refreshPanes()

    await t.rowMenu('local', 'site', 'Upload to server')
    const done = await t.waitForEvent('files:done', () => true, { label: 'the upload to finish' })
    t.check(done.ok, `upload failed: ${done.error}`)
    const excluded = [...(done.excludedNames ?? [])].sort()
    const expected = ['site/.DS_Store', 'site/backup.tmp', 'site/node_modules']
    t.check(
      JSON.stringify(excluded) === JSON.stringify(expected),
      `reported as left out: ${JSON.stringify(excluded)}, expected ${JSON.stringify(expected)}`
    )

    t.checkListing(
      await t.listRemote(),
      {
        'site/page.cshtml': true,
        'site/css/a.css': true,
        'site/.DS_Store': false,
        'site/backup.tmp': false,
        'site/node_modules': false
      },
      'server'
    )

    await t.quiet(() => t.driver.commands.nav('Activity'))
    let text = await t.text()
    if (!text.includes('Left out as junk')) {
      // Single-file batches collapse their job row; open it.
      await t.page.getByRole('button', { name: /site/ }).first().click()
      text = await t.text()
    }
    t.check(text.includes('Left out as junk'), "Activity doesn't say what was left out")
    await t.ss('activity')
  }
}
