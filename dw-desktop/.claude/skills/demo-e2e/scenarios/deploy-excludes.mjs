// Deploy with every exclude source and delete on. Only real files reach the server;
// excluded server files survive; a server-only folder holding an excluded file is
// emptied item by item but kept.
export default {
  name: 'deploy-excludes',
  description: 'Deploy + delete with junk list, .gitignore, .dwignore and a pattern',
  launch: {
    syncs: [
      {
        name: 'E2E deploy-excludes',
        direction: 'push',
        deleteExtra: true,
        useGitignore: true,
        exclude: ['*.bak']
      }
    ]
  },

  async run(t) {
    t.writeLocal({
      'Templates/page.cshtml': 'new page',
      'Templates/new.cshtml': 'new',
      '.gitignore': 'dist/\n',
      '.dwignore': '*.scss\n',
      'site.scss': 'scss',
      'dist/app.js': 'local build',
      'notes.bak': 'pattern',
      '.DS_Store': 'junk',
      'node_modules/lib/index.js': 'junk',
      '.git/HEAD': 'junk'
    })
    await t.seedRemote({
      'Templates/page.cshtml': 'old',
      'stale.txt': 'stale',
      'dist/app.js': 'server build',
      'keep/.DS_Store': 'junk',
      'keep/old.txt': 'old'
    })

    await t.openSavedSync('E2E deploy-excludes')
    const label = await t.preview()
    t.check(label === 'Deploy 5 items', `run button says "${label}", expected "Deploy 5 items"`)
    await t.page.getByRole('button', { name: /^Excluded \(\d+\)$/ }).click()
    const text = await t.text()
    for (const rule of ['Built-in: .DS_Store', '.gitignore: dist/', '.dwignore: *.scss', 'Sync pattern: *.bak'])
      t.check(text.includes(rule), `preview doesn't show the rule "${rule}"`)
    await t.ss('preview')

    const result = await t.runSync()
    t.check(result.failed === 0 && !result.cancelled, `sync result ${JSON.stringify(result)}`)

    const server = await t.listRemote()
    t.checkListing(
      server,
      {
        'Templates/page.cshtml': true,
        'Templates/new.cshtml': true,
        '.gitignore': true,
        'dist/app.js': true,
        keep: true,
        'keep/.DS_Store': true,
        'stale.txt': false,
        'keep/old.txt': false,
        '.DS_Store': false,
        node_modules: false,
        '.git': false,
        '.dwignore': false,
        'site.scss': false,
        'notes.bak': false
      },
      'server'
    )
    t.check((await t.readRemote('Templates/page.cshtml')) === 'new page', 'Templates/page.cshtml was not replaced')
    t.check((await t.readRemote('dist/app.js')) === 'server build', 'gitignored dist/app.js was overwritten')
  }
}
