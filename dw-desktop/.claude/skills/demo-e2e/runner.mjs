// End-to-end scenarios against the demo site, through the built app.
//
//   node .claude/skills/demo-e2e/runner.mjs all            run every scenario
//   node .claude/skills/demo-e2e/runner.mjs <name> [...]   run some
//   node .claude/skills/demo-e2e/runner.mjs list           list them
//
// Options:
//   --env <name>     the DW Desktop environment to test on (default: demo.local.json,
//                    else the only one on a test host)
//   --keep           leave the run folder on the server (to look into a failure)
//   --allow-outside  lift the run-folder check for this run. Only after the operator
//                    approved a plan that needs it; the demo host check stays.
//
// Build first: npx electron-vite build. See SKILL.md for the rules.
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Session } from './lib/session.mjs'
import { resolveTestEnv } from './lib/target.mjs'

const SKILL_DIR = import.meta.dirname
const APP_DIR = path.resolve(SKILL_DIR, '../../..')
const SCENARIO_DIR = path.join(SKILL_DIR, 'scenarios')
const SANDBOX = 'DWDesktopQA'
const BUDGET_PER_SCENARIO = 600
const SWEEP_AFTER_MS = 24 * 3600 * 1000

async function loadScenarios() {
  const files = fs.readdirSync(SCENARIO_DIR).filter((f) => f.endsWith('.mjs')).sort()
  const all = []
  for (const f of files) all.push((await import(pathToFileURL(path.join(SCENARIO_DIR, f)).href)).default)
  return all
}

function runId() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`
}

async function main() {
  const args = process.argv.slice(2)
  const keep = args.includes('--keep')
  const allowOutside = args.includes('--allow-outside')
  const envIndex = args.indexOf('--env')
  const requestedEnv = envIndex >= 0 ? args[envIndex + 1] : undefined
  const names = args.filter((a, i) => !a.startsWith("--") && (envIndex < 0 || i !== envIndex + 1))
  const scenarios = await loadScenarios()

  if (names.length === 0 || names[0] === 'list') {
    for (const s of scenarios) console.log(`${s.name.padEnd(20)} ${s.description}`)
    return 0
  }
  const chosen = names.includes('all') ? scenarios : names.map((n) => scenarios.find((s) => s.name === n) ?? n)
  const unknown = chosen.filter((s) => typeof s === 'string')
  if (unknown.length) throw new Error(`Unknown scenario: ${unknown.join(', ')} (try "list")`)
  if (!fs.existsSync(path.join(APP_DIR, 'out', 'main', 'index.js')))
    throw new Error('The app is not built. Run: npx electron-vite build')

  const env = resolveTestEnv(requestedEnv)
  const id = runId()
  const runRoot = `${SANDBOX}/${id}`
  const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), `dw-e2e-${id}-`))
  const shotDir = path.join(SKILL_DIR, 'shots', id)
  console.log(`demo-e2e run ${id} on ${env.name} (${env.host})`)
  console.log(`server folder /Files/${runRoot}${keep ? ' (kept)' : ''}${allowOutside ? ' - RUN-FOLDER CHECK LIFTED' : ''}`)

  const results = []
  for (const [i, scenario] of chosen.entries()) {
    const t = new Session({
      env,
      runRoot,
      scenario: scenario.name,
      localRoot,
      shotDir,
      allowOutside,
      budget: BUDGET_PER_SCENARIO
    })
    const started = Date.now()
    let error = null
    try {
      await t.launch(scenario.launch ?? {})
      if (i === 0) {
        const swept = await t.fixture('sweep', SANDBOX, SWEEP_AFTER_MS)
        if (swept.length) console.log(`swept ${swept.length} old run folder(s)`)
      }
      await scenario.run(t)
    } catch (err) {
      error = err
      await t.ss('error').catch(() => {})
    } finally {
      await t.close({ keep, removeRunRoot: i === chosen.length - 1 }).catch((err) => {
        t.failures.push(`cleanup: ${err.message.split('\n')[0]}`)
      })
    }
    if (error) t.failures.unshift(`error: ${error.message.split('\n')[0]}`)
    for (const b of t.blocked ?? []) t.failures.push(`sandbox refused: ${b}`)
    const ok = t.failures.length === 0
    results.push(ok)
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${scenario.name}  (${secs}s, ${t.requests ?? '?'} requests)`)
    for (const f of t.failures) console.log(`      - ${f}`)
  }

  fs.rmSync(localRoot, { recursive: true, force: true })
  console.log(`screenshots: ${shotDir}`)
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  return passed === results.length ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`demo-e2e: ${err.message}`)
    process.exit(2)
  }
)
