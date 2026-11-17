// Cancelling an upload mid-way leaves nothing on the server; Retry failed sends it
// again and the server's copy matches byte for byte.
import { randomBytes } from 'node:crypto'

const SIZE = 48 * 1024 * 1024

export default {
  name: 'cancel-retry',
  description: 'Cancel a large upload mid-way, then Retry failed; checksum must match',

  async run(t) {
    t.writeLocal({ 'big.bin': randomBytes(SIZE) })
    await t.refreshPanes()

    await t.rowMenu('local', 'big.bin', 'Upload to server')
    await t.waitForEvent('files:progress', (p) => p.transferred > 0, { label: 'the upload to start' })
    await t.quiet(() => t.driver.commands.nav('Activity'))
    await t.click('Cancel')
    const first = await t.waitForEvent('files:done', () => true, { label: 'the cancelled upload to stop' })
    if (!t.check(first.cancelled, `the upload ended without being cancelled: ${JSON.stringify(first)}`)) return
    t.check(!(await t.listRemote())['big.bin'], 'a cancelled upload left big.bin on the server')
    await t.ss('cancelled')

    await t.click('Retry failed')
    const second = await t.waitForEvent('files:done', () => true, {
      timeout: 300_000,
      label: 'the retried upload to finish'
    })
    t.check(second.ok, `retry failed: ${second.error}`)
    if (second.ok)
      t.check((await t.checksumRemote('big.bin')) === t.sha256Local('big.bin'), "the server's big.bin differs")
  }
}
