import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultExclusions,
  hasGitignore,
  loadExclusions,
  rebase,
  type ExcludeOptions
} from './exclude'
import { countPatterns, patternLines } from '../shared/exclude'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dw-exclude-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function options(patch: Partial<ExcludeOptions> = {}): ExcludeOptions {
  return {
    localRoot: dir,
    apiRoot: 'Templates',
    useDefaults: false,
    useGitignore: false,
    patterns: [],
    ...patch
  }
}

describe('rebase', () => {
  it('leaves rules for the root alone and drops blanks and comments', () => {
    expect(rebase('dist/', '')).toBe('dist/')
    expect(rebase('   ', 'a')).toBeNull()
    expect(rebase('# note', 'a')).toBeNull()
  })

  it('anchors slashed rules to their folder and lets the rest match at any depth', () => {
    expect(rebase('/dist', 'site')).toBe('site/dist')
    expect(rebase('assets/*.map', 'site')).toBe('site/assets/*.map')
    expect(rebase('*.log', 'site')).toBe('site/**/*.log')
    expect(rebase('build/', 'site')).toBe('site/**/build/')
    expect(rebase('!keep.log', 'site')).toBe('!site/**/keep.log')
    expect(rebase('dist/   ', 'site')).toBe('site/**/dist/')
  })

  it('escapes glob characters in the folder name', () => {
    expect(rebase('*.log', 'old [v1]')).toBe('old \\[v1\\]/**/*.log')
    expect(rebase('*.log', '#tmp')).toBe('\\#tmp/**/*.log')
  })
})

describe('patternLines', () => {
  it('splits lines, drops blanks and keeps comments', () => {
    const lines = patternLines('*.scss\n\n  # drafts\n/drafts/\r\n')
    expect(lines).toEqual(['*.scss', '# drafts', '/drafts/'])
    expect(countPatterns(lines)).toBe(2)
  })
})

describe('loadExclusions', () => {
  it('applies the built-in list at any depth, folders and files alike', async () => {
    const ex = await loadExclusions(options({ useDefaults: true }))
    expect(ex.match('.git', true)).toBe('Built-in: .git/')
    expect(ex.match('a/b/node_modules', true)).toBe('Built-in: node_modules/')
    expect(ex.match('a/b/node_modules/x/y.js', false)).toBe('Built-in: node_modules/')
    expect(ex.match('Designs/.DS_Store', false)).toBe('Built-in: .DS_Store')
    expect(ex.match('a/report.TMP', false)).toBe('Built-in: *.tmp')
    expect(ex.match('a/~$doc.docx', false)).toBe('Built-in: ~$*')
    expect(ex.match('a/logo.png.abc123.dwpart', false)).toBe('Built-in: *.dwpart')
    // A folder-only rule leaves a file of that name alone.
    expect(ex.match('node_modules', false)).toBeNull()
    expect(ex.match('a/style.css', false)).toBeNull()
  })

  it('does nothing with the built-in list off', async () => {
    const ex = await loadExclusions(options())
    expect(ex.match('.git', true)).toBeNull()
  })

  it('skips comment lines among sync patterns', async () => {
    const ex = await loadExclusions(options({ patterns: ['# drafts', '*.bak'] }))
    expect(ex.match('# drafts', false)).toBeNull()
    expect(ex.match('a.bak', false)).toBe('Sync pattern: *.bak')
  })

  it('matches case-insensitively, like the server', async () => {
    const ex = await loadExclusions(options({ patterns: ['Drafts/'] }))
    expect(ex.match('drafts', true)).toBe('Sync pattern: Drafts/')
    expect(ex.match('DRAFTS/a.txt', false)).toBe('Sync pattern: Drafts/')
  })

  it('anchors patterns with a slash and matches the rest anywhere', async () => {
    const ex = await loadExclusions(options({ patterns: ['/drafts', 'Designs/**/*.scss'] }))
    expect(ex.match('drafts', true)).not.toBeNull()
    expect(ex.match('sub/drafts', true)).toBeNull()
    expect(ex.match('Designs/Swift/css/a.scss', false)).not.toBeNull()
    expect(ex.match('Other/a.scss', false)).toBeNull()
  })

  it('lets a later source re-include what an earlier one excludes', async () => {
    const ex = await loadExclusions(
      options({ useDefaults: true, patterns: ['!node_modules/', '!keep.tmp'] })
    )
    expect(ex.match('node_modules', true)).toBeNull()
    expect(ex.match('node_modules/lib/a.js', false)).toBeNull()
    expect(ex.match('keep.tmp', false)).toBeNull()
    expect(ex.match('other.tmp', false)).toBe('Built-in: *.tmp')
  })

  it('never re-includes a file inside an excluded folder', async () => {
    const ex = await loadExclusions(options({ patterns: ['build/', '!build/keep.js'] }))
    expect(ex.match('build/keep.js', false)).toBe('Sync pattern: build/')
  })

  it('reads .dwignore from the local folder and excludes the file itself', async () => {
    await writeFile(join(dir, '.dwignore'), '# local only\n*.scss\n')
    const ex = await loadExclusions(options())
    expect(ex.dwignore).toBe(true)
    expect(ex.match('css/a.scss', false)).toBe('.dwignore: *.scss')
    expect(ex.match('.dwignore', false)).toBe('.dwignore')
    expect(ex.match('sub/.dwignore', false)).toBeNull()
  })

  it('protects System/Log and Cache.net below the synced server folder', async () => {
    const atFiles = await loadExclusions(options({ apiRoot: '' }))
    expect(atFiles.match('System/Log', true)).toBe('Protected server folder: System/Log')
    expect(atFiles.match('system/log/2026/a.log', false)).toBe(
      'Protected server folder: System/Log'
    )
    expect(atFiles.match('Cache.net', true)).toBe('Protected server folder: Cache.net')
    expect(atFiles.match('System/Logs', true)).toBeNull()

    const atSystem = await loadExclusions(options({ apiRoot: 'System' }))
    expect(atSystem.match('Log/a.log', false)).not.toBeNull()

    // Syncing the log folder itself is a deliberate choice.
    const atLog = await loadExclusions(options({ apiRoot: 'System/Log' }))
    expect(atLog.match('a.log', false)).toBeNull()
  })

  it('protected folders win over a re-including pattern', async () => {
    const ex = await loadExclusions(options({ apiRoot: '', patterns: ['!System/Log/'] }))
    expect(ex.match('System/Log', true)).not.toBeNull()
  })
})

describe('loadExclusions with .gitignore', () => {
  it('is ignored unless turned on', async () => {
    await writeFile(join(dir, '.gitignore'), 'dist/\n')
    const off = await loadExclusions(options())
    expect(off.match('dist', true)).toBeNull()
    expect(off.gitignores).toBe(0)
    const on = await loadExclusions(options({ useGitignore: true }))
    expect(on.match('dist', true)).toBe('.gitignore: dist/')
    expect(on.gitignores).toBe(1)
  })

  it('applies negation within the file', async () => {
    await writeFile(join(dir, '.gitignore'), '*.log\n!keep.log\n')
    const ex = await loadExclusions(options({ useGitignore: true }))
    expect(ex.match('a/x.log', false)).toBe('.gitignore: *.log')
    expect(ex.match('a/keep.log', false)).toBeNull()
  })

  it('applies parent .gitignore files up to the repository root, rebased', async () => {
    const root = join(dir, 'repo')
    const files = join(root, 'Files')
    await mkdir(join(root, '.git'), { recursive: true })
    await mkdir(files, { recursive: true })
    await writeFile(join(root, '.gitignore'), '/Files/Templates/*.css\n*.log\n/dist\n')
    // Above the repository: never read.
    await writeFile(join(dir, '.gitignore'), '*.png\n')

    const ex = await loadExclusions(options({ localRoot: files, useGitignore: true }))
    expect(ex.gitignores).toBe(1)
    expect(ex.match('Templates/site.css', false)).toBe('../.gitignore: /Files/Templates/*.css')
    expect(ex.match('Templates/sub/site.css', false)).toBeNull()
    expect(ex.match('System/x.log', false)).toBe('../.gitignore: *.log')
    // Anchored to the repository root, not to the synced folder.
    expect(ex.match('dist', true)).toBeNull()
    expect(ex.match('Images/a.png', false)).toBeNull()
    expect(await hasGitignore(files)).toBe(true)
  })

  it('a sync pattern overrides the .gitignore', async () => {
    await writeFile(join(dir, '.gitignore'), 'dist/\n')
    const ex = await loadExclusions(options({ useGitignore: true, patterns: ['!dist/'] }))
    expect(ex.match('dist/app.js', false)).toBeNull()
  })

  it('a nested .gitignore only applies below its folder', async () => {
    await mkdir(join(dir, 'Designs', 'Swift'), { recursive: true })
    await writeFile(join(dir, 'Designs', 'Swift', '.gitignore'), 'cache/\n/local.json\n')
    const ex = await loadExclusions(options({ useGitignore: true }))
    await ex.enterDir(join(dir, 'Designs'), 'Designs')
    await ex.enterDir(join(dir, 'Designs', 'Swift'), 'Designs/Swift')
    expect(ex.gitignores).toBe(1)
    expect(ex.match('Designs/Swift/cache', true)).toBe('Designs/Swift/.gitignore: cache/')
    expect(ex.match('Designs/Swift/a/cache', true)).not.toBeNull()
    expect(ex.match('Designs/Swift/local.json', false)).not.toBeNull()
    expect(ex.match('Designs/Swift/a/local.json', false)).toBeNull()
    expect(ex.match('cache', true)).toBeNull()
    expect(ex.match('Designs/cache', true)).toBeNull()
  })

  it('a nested .gitignore in a folder with glob characters in its name still applies', async () => {
    await mkdir(join(dir, 'old [v1]'), { recursive: true })
    await writeFile(join(dir, 'old [v1]', '.gitignore'), '*.log\n')
    const ex = await loadExclusions(options({ useGitignore: true }))
    await ex.enterDir(join(dir, 'old [v1]'), 'old [v1]')
    expect(ex.match('old [v1]/a/x.log', false)).not.toBeNull()
    expect(ex.match('old v/a/x.log', false)).toBeNull()
  })

  it('hasGitignore is false outside a repository without one', async () => {
    expect(await hasGitignore(dir)).toBe(false)
    expect(await hasGitignore('')).toBe(false)
  })
})

describe('defaultExclusions', () => {
  it('matches the built-in list', () => {
    const excluded = defaultExclusions()
    expect(excluded('.git', true)).toBe(true)
    expect(excluded('a/.DS_Store', false)).toBe(true)
    expect(excluded('a/b.css', false)).toBe(false)
  })
})
