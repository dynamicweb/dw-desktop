// The guard itself: writes outside the run folder, other hosts and foreign upload
// sessions are refused before anything is sent. The requests carry no credentials,
// so even a broken guard couldn't change anything on the server.
export default {
  name: 'sandbox-guard',
  description: 'Writes outside the run folder, other hosts and foreign sessions are refused',

  async run(t) {
    const base = `${t.env.protocol ?? 'https'}://${t.env.host}/Admin/Api/FileTransfer`
    const { outcomes, blocked } = await t.app.evaluate(
      async (_e, { base, inside }) => {
        const json = (body) => ({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const attempts = [
          ['write outside the run folder', `${base}/entries/directory`, json({ path: 'DWDesktopQA-guard-test' })],
          ['move out of the run folder', `${base}/entries/move`, json({ sourcePath: inside, destinationPath: 'Templates/x' })],
          ['chunk for a session it did not open', `${base}/uploads/not-ours/chunks/0`, { method: 'PUT', body: 'x' }],
          ['request to another host', 'https://example.com/Admin/Api/FileTransfer/entries', {}]
        ]
        const outcomes = []
        for (const [name, url, init] of attempts) {
          try {
            const response = await fetch(url, init)
            outcomes.push([name, `sent (${response.status})`])
          } catch (err) {
            outcomes.push([name, err.message])
          }
        }
        // Expected refusals; take them off the run's list.
        return { outcomes, blocked: globalThis.__e2e.state.blocked.splice(0) }
      },
      { base, inside: `${t.remoteApi}/a.txt` }
    )
    for (const [name, outcome] of outcomes)
      t.check(outcome.startsWith('Blocked by the demo-e2e sandbox'), `${name}: ${outcome}`)
    t.check(blocked.length === outcomes.length, `${blocked.length} refusals recorded for ${outcomes.length} attempts`)
  }
}
