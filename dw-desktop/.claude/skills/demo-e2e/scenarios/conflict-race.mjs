// A server file that changes between preview and run is not overwritten (If-Match),
// the item says why, and the next preview lists it as a conflict.
export default {
  name: 'conflict-race',
  description: 'Server file edited between preview and run is kept; next preview flags a conflict',
  launch: { syncs: [{ name: 'E2E conflict-race', direction: 'push' }] },

  async run(t) {
    t.writeLocal({ 'theme.json': '{"color":"local"}' })
    await t.seedRemote({ 'theme.json': '{"color":"v1"}' })

    await t.openSavedSync('E2E conflict-race')
    const label = await t.preview()
    t.check(label === 'Deploy 1 item', `run button says "${label}", expected "Deploy 1 item"`)

    // Someone edits the file on the server after the preview.
    await t.putRemote('theme.json', '{"color":"edited on the server"}')

    const result = await t.runSync()
    t.check(result.failed === 1, `expected 1 failed item, got ${JSON.stringify(result)}`)
    const failure = t.events.find((e) => e.channel === 'files:done' && !e.payload.ok)
    t.check(
      /changed on the server while syncing/.test(failure?.payload.error ?? ''),
      `the failed item doesn't explain the race: ${failure?.payload.error}`
    )
    t.check(
      (await t.readRemote('theme.json')) === '{"color":"edited on the server"}',
      "the server's edit was overwritten"
    )
    await t.ss('activity')

    await t.openSavedSync('E2E conflict-race')
    await t.preview()
    const text = await t.text()
    t.check(text.includes('Conflict'), 'the next preview does not list a conflict')
    await t.ss('conflict')
  }
}
