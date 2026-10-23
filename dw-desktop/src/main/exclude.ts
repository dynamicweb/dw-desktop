import ignore, { type Ignore } from 'ignore'
import { readFile, stat } from 'fs/promises'
import { dirname, join, relative, resolve, sep } from 'path'
import { DEFAULT_EXCLUDES } from '../shared/exclude'

/**
 * Exclude rules for a sync, in gitignore syntax. Sources, lowest precedence first:
 * the built-in junk list, .gitignore files (opt-in: from the repository root down
 * to the synced folder, then nested ones as the walk finds them), the .dwignore in
 * the synced folder, and the sync's own patterns. A later rule wins, so a sync
 * pattern like `!dist/` can bring back what a .gitignore leaves out.
 *
 * Every rule goes into one `ignore` list, rebased onto the outermost folder that has
 * rules, so the list's own semantics (last match wins, nothing inside an excluded
 * folder can be re-included) apply across sources exactly as in git.
 *
 * The same rules apply to both sides of a sync, with paths relative to the synced
 * folders: a file a rule excludes is neither transferred nor deleted.
 */

// Matching the CLI: logs and cache under /Files are never synced. These only apply
// when the synced folder is above them, so a sync of /Files/System/Log itself works.
const PROTECTED_SERVER_FOLDERS = ['System/Log', 'Cache.net']

export interface ExcludeOptions {
  localRoot: string
  /** Server folder as an API path ('' = /Files). */
  apiRoot: string
  useDefaults: boolean
  useGitignore: boolean
  patterns: string[]
}

export interface Exclusions {
  /**
   * The rule that excludes a path (relative to the synced folders, '/' separated),
   * or null. A path inside an excluded folder is excluded by that folder's rule.
   */
  match(rel: string, isDir: boolean): string | null
  /** Called by the local walk before it lists a subfolder, to pick up its .gitignore. */
  enterDir(absolute: string, rel: string): Promise<void>
  /** Whether a .dwignore was read from the local folder. */
  readonly dwignore: boolean
  /** How many .gitignore files are in use. */
  readonly gitignores: number
}

interface Rule {
  pattern: string
  mark: string
}

function escapeGlob(path: string): string {
  return path.replace(/[\\*?[\]]/g, '\\$&').replace(/^[#!]/, '\\$&')
}

/**
 * Rewrites one line of rules written for folder `base` (relative to the matcher's
 * root, '' = the root itself) so it applies from the root. A slash at the start or
 * in the middle anchors a rule to its own folder; without one it matches at any
 * depth below it. Blank lines and comments give null.
 */
export function rebase(line: string, base: string): string | null {
  let pattern = line.replace(/(^|[^\\])\s+$/, '$1')
  if (!pattern || pattern.startsWith('#')) return null
  if (!base) return pattern
  const negative = pattern.startsWith('!')
  if (negative) pattern = pattern.slice(1)
  if (!pattern) return null
  const anchored = pattern.replace(/\/$/, '').includes('/')
  const body = anchored ? pattern.replace(/^\//, '') : `**/${pattern}`
  return `${negative ? '!' : ''}${escapeGlob(base)}/${body}`
}

function toRules(lines: string[], base: string, source: string): Rule[] {
  const rules: Rule[] = []
  for (const line of lines) {
    const pattern = rebase(line, base)
    if (pattern) rules.push({ pattern, mark: `${source}: ${line.trim()}` })
  }
  return rules
}

async function readLines(path: string): Promise<string[] | null> {
  try {
    return (await readFile(path, 'utf8')).split(/\r?\n/)
  } catch {
    return null
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function toSlashes(path: string): string {
  return path.split(sep).join('/')
}

function joinRel(base: string, rel: string): string {
  return base ? `${base}/${rel}` : rel
}

/** The nearest folder at or above `dir` that holds a .git folder (or file, for worktrees). */
async function findRepoRoot(dir: string): Promise<string | null> {
  let current = dir
  for (;;) {
    if (await exists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/** Folders whose .gitignore applies to `localRoot`, outermost first, ending with it. */
async function gitignoreFolders(localRoot: string): Promise<string[]> {
  const repo = await findRepoRoot(localRoot)
  const folders = [localRoot]
  if (!repo) return folders
  for (let dir = localRoot; dir !== repo; ) {
    dir = dirname(dir)
    folders.unshift(dir)
  }
  return folders
}

/** Whether a .gitignore applies to this folder (in it or above it, within its repository). */
export async function hasGitignore(localPath: string): Promise<boolean> {
  if (!localPath) return false
  for (const dir of await gitignoreFolders(resolve(localPath))) {
    if (await exists(join(dir, '.gitignore'))) return true
  }
  return false
}

function protectedRule(apiRoot: string, rel: string): string | null {
  const root = apiRoot.toLowerCase()
  const full = joinRel(root, rel.toLowerCase())
  for (const folder of PROTECTED_SERVER_FOLDERS) {
    const lower = folder.toLowerCase()
    if (root && !lower.startsWith(`${root}/`)) continue
    if (full === lower || full.startsWith(`${lower}/`)) return `Protected server folder: ${folder}`
  }
  return null
}

export async function loadExclusions(options: ExcludeOptions): Promise<Exclusions> {
  const localRoot = resolve(options.localRoot)

  // Parent .gitignore files are written for their own folder: everything is rebased
  // onto the outermost one, and tested paths get the synced folder's place under it.
  const gitFolders = options.useGitignore ? await gitignoreFolders(localRoot) : [localRoot]
  const top = gitFolders[0]
  const rootBase = toSlashes(relative(top, localRoot))

  const defaults = options.useDefaults ? toRules(DEFAULT_EXCLUDES, rootBase, 'Built-in') : []
  const gitignore: Rule[] = []
  let gitignores = 0
  const addGitignore = (lines: string[] | null, folder: string): void => {
    if (!lines) return
    const base = toSlashes(relative(top, folder))
    const shown = toSlashes(relative(localRoot, join(folder, '.gitignore')))
    gitignore.push(...toRules(lines, base, shown))
    gitignores++
  }
  if (options.useGitignore) {
    for (const folder of gitFolders)
      addGitignore(await readLines(join(folder, '.gitignore')), folder)
  }
  const dwLines = await readLines(join(localRoot, '.dwignore'))
  const dwignore = dwLines
    ? [{ pattern: rebase('/.dwignore', rootBase) as string, mark: '.dwignore' }].concat(
        toRules(dwLines, rootBase, '.dwignore')
      )
    : []
  const patterns = toRules(options.patterns, rootBase, 'Sync pattern')

  let ig: Ignore
  const build = (): void => {
    ig = ignore()
    for (const rule of [...defaults, ...gitignore, ...dwignore, ...patterns]) ig.add(rule)
  }
  build()

  return {
    get dwignore() {
      return dwLines !== null
    },
    get gitignores() {
      return gitignores
    },
    match(rel, isDir) {
      const guarded = protectedRule(options.apiRoot, rel)
      if (guarded) return guarded
      const path = joinRel(rootBase, rel)
      try {
        const result = ig.test(isDir ? `${path}/` : path)
        return result.ignored ? (result.rule?.mark ?? 'Excluded') : null
      } catch {
        // A path the matcher can't take is simply not excluded.
        return null
      }
    },
    async enterDir(absolute) {
      if (!options.useGitignore) return
      const lines = await readLines(join(absolute, '.gitignore'))
      if (!lines) return
      addGitignore(lines, absolute)
      build()
    }
  }
}

/** The built-in junk list on its own, for folders uploaded from Browse. */
export function defaultExclusions(): (rel: string, isDir: boolean) => boolean {
  const ig = ignore().add(DEFAULT_EXCLUDES)
  return (rel, isDir) => {
    try {
      return ig.ignores(isDir ? `${rel}/` : rel)
    } catch {
      return false
    }
  }
}
