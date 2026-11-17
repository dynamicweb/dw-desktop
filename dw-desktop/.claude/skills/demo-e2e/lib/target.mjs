// Which DW Desktop environment the tests run against. It comes from the app's own
// configuration, so its credentials are already in the OS keychain under that
// environment's name; a throwaway profile holding the same environment entry
// signs in with them, and nothing here ever handles a key.
//
// Only Development environments on test hosts qualify: demo sites, dev01 sites and
// solutions running on this computer. Anything else - a customer site, or one marked
// Staging or Production - is refused, even when named explicitly.
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const SKILL_DIR = path.resolve(import.meta.dirname, '..')
export const LOCAL_FILE = path.join(SKILL_DIR, 'demo.local.json')

/**
 * Nothing to test against on this machine (no test site, several and none chosen,
 * credentials refused, site down). Not a failure: the run is skipped with a note.
 */
export class SkipRun extends Error {}

export const TEST_HOSTS = [
  /\.dwdemo\.dynamicweb\.cloud$/i,
  /\.dev01\.dynamicweb\.dk$/i,
  /^localhost$/i,
  /\.localhost$/i,
  /^127\.0\.0\.1$/,
  /^\[?::1\]?$/
]

/** Host without the port, e.g. "localhost:5001" -> "localhost". */
function hostname(host) {
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d+$/, '')
}

export function isTestHost(host) {
  return TEST_HOSTS.some((re) => re.test(hostname(host)))
}

/** The app's real profile folder (Electron userData for "dw-desktop"). */
export function userDataDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? '', 'dw-desktop')
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'dw-desktop')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'dw-desktop')
}

/** The app's rule: an environment without a kind is Development. */
function kindOf(env) {
  return env.kind ?? 'development'
}

/**
 * The test environment: `--env <name>`, else the one demo.local.json names, else
 * the only Development environment on a test host. It must be on a test host and
 * of kind Development.
 */
export function resolveTestEnv(requested) {
  const configPath = path.join(userDataDir(), 'config.json')
  if (!fs.existsSync(configPath))
    throw new SkipRun('DW Desktop has no configuration on this machine, so there is no test site to use.')
  const environments = JSON.parse(fs.readFileSync(configPath, 'utf8')).environments ?? []
  const eligible = environments.filter((e) => isTestHost(e.host) && kindOf(e) === 'development')
  const list = eligible.map((e) => `${e.name} (${e.host})`).join(', ') || 'none'

  const name =
    requested ?? (fs.existsSync(LOCAL_FILE) ? JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')).env : null)
  let env
  if (name) {
    env = environments.find((e) => e.name === name)
    if (!env) throw new Error(`"${name}" isn't an environment in DW Desktop. Test environments: ${list}.`)
  } else {
    if (eligible.length === 0)
      throw new SkipRun(
        'no test environment in DW Desktop (a Development environment on *.dwdemo.dynamicweb.cloud, *.dev01.dynamicweb.dk or localhost).'
      )
    if (eligible.length > 1)
      throw new SkipRun(
        `${eligible.length} test environments (${list}) and none chosen. ` +
          `Pass --env <name> or set a default in ${LOCAL_FILE}: { "env": "<name>" }.`
      )
    env = eligible[0]
  }
  if (kindOf(env) !== 'development')
    throw new Error(`"${env.name}" is marked ${env.kind}; tests only run on Development environments.`)
  if (!isTestHost(env.host))
    throw new Error(
      `"${env.name}" (${env.host}) is not a test host. Tests only run on *.dwdemo.dynamicweb.cloud, ` +
        '*.dev01.dynamicweb.dk or a solution on this computer (localhost).'
    )
  return env
}
