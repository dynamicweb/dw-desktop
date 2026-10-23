import { mkdir, mkdtemp, rm, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { collectManifestMock, getJsonMock, postJsonMock, uploadOneFileMock, downloadOneFileMock } =
  vi.hoisted(() => ({
    collectManifestMock: vi.fn(),
    getJsonMock: vi.fn(),
    postJsonMock: vi.fn(),
    uploadOneFileMock: vi.fn(),
    downloadOneFileMock: vi.fn()
  }))

vi.mock('./dw-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dw-api')>()
  return {
    ...actual,
    collectManifest: collectManifestMock,
    getJson: getJsonMock,
    postJson: postJsonMock,
    uploadOneFile: uploadOneFileMock,
    downloadOneFile: downloadOneFileMock
  }
})

vi.mock('./auth', () => ({ resolveAuthHeader: vi.fn().mockResolvedValue('Bearer k') }))

import { FileTransferApiError } from './dw-api'
import { buildSyncPlan, hashFile, runSyncPlan } from './sync'
import type { BaselineEntry, TransferState } from './transferState'
import type { StoredEnv, SyncRequest } from '../shared/types'

const env: StoredEnv = { name: 'prod', host: 'h', protocol: 'https', authType: 'apiKey' }

function memoryState(): TransferState & {
  files: Map<string, BaselineEntry>
  roots: Set<string>
} {
  const files = new Map<string, BaselineEntry>()
  const roots = new Set<string>()
  return {
    files,
    roots,
    getFile: (p) => files.get(p.toLowerCase()) ?? null,
    recordFile: (p, e) => void files.set(p.toLowerCase(), e),
    forget: (p) => void files.delete(p.toLowerCase()),
    knownHash: (p, eTag) => {
      const f = files.get(p.toLowerCase())
      return f?.sha256 && f.eTag === eTag ? f.sha256 : null
    },
    cacheHash: () => undefined,
    isTracked: (dir) => roots.has(dir.toLowerCase()),
    markRootSynced: (dir) => void roots.add(dir.toLowerCase()),
    save: () => undefined
  }
}

function remote(path: string, size: number, eTag: string, isDirectory = false): object {
  return {
    path,
    name: path.split('/').pop(),
    isDirectory,
    size,
    modifiedUtc: '2020-01-01T00:00:00Z',
    eTag: isDirectory ? null : eTag
  }
}

let root: string

beforeEach(async () => {
  vi.clearAllMocks()
  root = await mkdtemp(join(tmpdir(), 'dw-sync-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function request(overrides: Partial<SyncRequest> = {}): SyncRequest {
  return {
    envName: 'prod',
    localPath: root,
    remotePath: '/Templates',
    direction: 'push',
    compareContent: true,
    deleteExtra: false,
    ...overrides
  }
}

describe('buildSyncPlan', () => {
  it('classifies a push: new, replaced, unchanged and server-only files', async () => {
    await writeFile(join(root, 'new.txt'), 'new')
    await writeFile(join(root, 'changed.txt'), 'longer content')
    await writeFile(join(root, 'same.txt'), 'same')
    const sameSha = await hashFile(join(root, 'same.txt'))
    collectManifestMock.mockResolvedValue([
      remote('changed.txt', 3, 'e1'),
      remote('same.txt', 4, 'e2'),
      remote('legacy.txt', 6, 'e3')
    ])
    getJsonMock.mockResolvedValue({ value: sameSha, eTag: 'e2' })

    const result = await buildSyncPlan(env, request(), memoryState())

    expect(result.ok).toBe(true)
    const byPath = Object.fromEntries(result.data!.items.map((i) => [i.path, i]))
    expect(byPath['new.txt']).toMatchObject({ action: 'upload', include: true })
    expect(byPath['changed.txt']).toMatchObject({
      action: 'replace',
      include: true,
      remoteETag: 'e1'
    })
    expect(byPath['legacy.txt']).toMatchObject({ action: 'skip', include: true })
    expect(byPath['same.txt']).toBeUndefined()
    expect(result.data!.unchanged).toBe(1)
    expect(result.data!.syncedBefore).toBe(false)
  })

  it('flags a replace as a conflict when the server changed it since the last sync', async () => {
    await writeFile(join(root, 'theme.json'), 'local edit!')
    collectManifestMock.mockResolvedValue([remote('theme.json', 4, 'server-v2')])
    const state = memoryState()
    state.markRootSynced('Templates')
    state.recordFile('Templates/theme.json', { eTag: 'server-v1', sha256: 'x', size: 4 })

    const result = await buildSyncPlan(env, request(), state)

    expect(result.data!.items[0]).toMatchObject({
      path: 'theme.json',
      action: 'conflict',
      include: false,
      reason: 'Changed on the server since your last sync'
    })
  })

  it('with deleteExtra, deletes a server-only folder as one item', async () => {
    collectManifestMock.mockResolvedValue([
      remote('old', 0, '', true),
      remote('old/a.txt', 1, 'a'),
      remote('old/b.txt', 1, 'b')
    ])

    const result = await buildSyncPlan(env, request({ deleteExtra: true }), memoryState())

    expect(result.data!.items).toHaveLength(1)
    expect(result.data!.items[0]).toMatchObject({
      path: 'old',
      type: 'directory',
      action: 'delete'
    })
  })

  it('classifies a pull and detects a local change since the last sync', async () => {
    await writeFile(join(root, 'page.cshtml'), 'edited locally')
    collectManifestMock.mockResolvedValue([
      remote('page.cshtml', 3, 'p2'),
      remote('missing.png', 10, 'm1')
    ])
    const state = memoryState()
    state.markRootSynced('Templates')
    state.recordFile('Templates/page.cshtml', { eTag: 'p1', sha256: 'old-hash', size: 3 })

    const result = await buildSyncPlan(env, request({ direction: 'pull' }), state)

    const byPath = Object.fromEntries(result.data!.items.map((i) => [i.path, i]))
    expect(byPath['missing.png']).toMatchObject({ action: 'download', include: true })
    expect(byPath['page.cshtml']).toMatchObject({
      action: 'conflict',
      reason: 'Changed on this computer since your last sync'
    })
  })

  it('without content comparison, a same-size file newer locally is replaced on push', async () => {
    await writeFile(join(root, 'a.txt'), 'abcd')
    const now = new Date()
    await utimes(join(root, 'a.txt'), now, now)
    collectManifestMock.mockResolvedValue([remote('a.txt', 4, 'e')])

    const result = await buildSyncPlan(env, request({ compareContent: false }), memoryState())

    expect(getJsonMock).not.toHaveBeenCalled()
    expect(result.data!.items[0]).toMatchObject({
      action: 'replace',
      reason: 'Newer on this computer'
    })
  })

  it('reports a missing local folder for a push', async () => {
    const result = await buildSyncPlan(
      env,
      request({ localPath: join(root, 'nope') }),
      memoryState()
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('doesn’t exist')
  })
})

describe('buildSyncPlan with exclude rules', () => {
  function paths(items: { path: string; action: string }[]): Record<string, string> {
    return Object.fromEntries(items.map((i) => [i.path, i.action]))
  }

  it('leaves out local junk on a push and reports it once per folder', async () => {
    await mkdir(join(root, '.git', 'objects'), { recursive: true })
    await writeFile(join(root, '.git', 'objects', 'abc'), 'x')
    await writeFile(join(root, '.DS_Store'), 'x')
    await writeFile(join(root, 'page.cshtml'), 'x')
    collectManifestMock.mockResolvedValue([])

    const result = await buildSyncPlan(env, request(), memoryState())

    expect(paths(result.data!.items)).toEqual({ 'page.cshtml': 'upload' })
    expect(result.data!.excluded).toEqual([
      { path: '.DS_Store', type: 'file', side: 'local', rule: 'Built-in: .DS_Store' },
      { path: '.git', type: 'directory', side: 'local', rule: 'Built-in: .git/' }
    ])
  })

  it('includes junk when the built-in list is turned off', async () => {
    await writeFile(join(root, '.DS_Store'), 'x')
    collectManifestMock.mockResolvedValue([])

    const result = await buildSyncPlan(env, request({ useDefaultExcludes: false }), memoryState())

    expect(paths(result.data!.items)).toEqual({ '.DS_Store': 'upload' })
    expect(result.data!.excluded).toEqual([])
  })

  it('with deleteExtra, keeps server files that match a pattern', async () => {
    collectManifestMock.mockResolvedValue([
      remote('notes.md', 1, 'n'),
      remote('drafts', 0, '', true),
      remote('drafts/a.txt', 1, 'a'),
      remote('stale.txt', 1, 's')
    ])

    const result = await buildSyncPlan(
      env,
      request({ deleteExtra: true, exclude: ['*.md', 'drafts/'] }),
      memoryState()
    )

    expect(paths(result.data!.items)).toEqual({ 'stale.txt': 'delete' })
    expect(result.data!.excluded.map((x) => [x.path, x.side])).toEqual([
      ['drafts', 'remote'],
      ['notes.md', 'remote']
    ])
  })

  it('with deleteExtra, never deletes a folder that holds a protected server folder', async () => {
    collectManifestMock.mockResolvedValue([
      remote('System', 0, '', true),
      remote('System/Log', 0, '', true),
      remote('System/Log/today.log', 1, 'l'),
      remote('System/old.config', 1, 'o'),
      remote('System/Old', 0, '', true),
      remote('System/Old/a.txt', 1, 'a'),
      remote('Cache.net', 0, '', true)
    ])

    const result = await buildSyncPlan(
      env,
      request({ remotePath: '/', deleteExtra: true }),
      memoryState()
    )

    // System itself stays; what else is in it is deleted item by item.
    expect(paths(result.data!.items)).toEqual({
      'System/Old': 'delete',
      'System/old.config': 'delete'
    })
    expect(result.data!.excluded.map((x) => x.path)).toEqual(['Cache.net', 'System/Log'])
  })

  it('on a pull with deleteExtra, does not trash a local-only folder that holds a repository', async () => {
    await mkdir(join(root, 'Designs', '.git'), { recursive: true })
    await writeFile(join(root, 'Designs', '.git', 'HEAD'), 'x')
    await writeFile(join(root, 'Designs', 'old.css'), 'x')
    collectManifestMock.mockResolvedValue([])

    const result = await buildSyncPlan(
      env,
      request({ direction: 'pull', deleteExtra: true }),
      memoryState()
    )

    expect(paths(result.data!.items)).toEqual({ 'Designs/old.css': 'delete' })
  })

  it('applies a .gitignore only when asked, on both sides', async () => {
    await writeFile(join(root, '.gitignore'), 'dist/\n.env\n')
    await mkdir(join(root, 'dist'))
    await writeFile(join(root, 'dist', 'app.js'), 'x')
    await writeFile(join(root, '.env'), 'secret')
    collectManifestMock.mockResolvedValue([remote('dist', 0, '', true)])

    const off = await buildSyncPlan(env, request(), memoryState())
    expect(paths(off.data!.items)).toEqual({
      '.env': 'upload',
      '.gitignore': 'upload',
      'dist/app.js': 'upload'
    })
    expect(off.data!.gitignores).toBe(0)

    const on = await buildSyncPlan(env, request({ useGitignore: true }), memoryState())
    expect(paths(on.data!.items)).toEqual({ '.gitignore': 'upload' })
    expect(on.data!.gitignores).toBe(1)
    expect(on.data!.excluded).toEqual([
      { path: '.env', type: 'file', side: 'local', rule: '.gitignore: .env' },
      { path: 'dist', type: 'directory', side: 'both', rule: '.gitignore: dist/' }
    ])
  })

  it('reads .dwignore from the local folder', async () => {
    await writeFile(join(root, '.dwignore'), '*.scss\n')
    await writeFile(join(root, 'site.scss'), 'x')
    await writeFile(join(root, 'site.css'), 'x')
    collectManifestMock.mockResolvedValue([])

    const result = await buildSyncPlan(env, request(), memoryState())

    expect(paths(result.data!.items)).toEqual({ 'site.css': 'upload' })
    expect(result.data!.dwignore).toBe(true)
  })
})

describe('sync by date after a sync', () => {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000)
  // The server dates a file by when it was written there: now.
  const serverNow = (path: string, size: number, eTag: string): object => ({
    ...remote(path, size, eTag),
    modifiedUtc: new Date().toISOString()
  })

  it('a Get skips a file the server has not changed since the last sync', async () => {
    await writeFile(join(root, 'a.txt'), 'abcd')
    await utimes(join(root, 'a.txt'), dayAgo, dayAgo)
    collectManifestMock.mockResolvedValue([serverNow('a.txt', 4, 'e1')])
    const state = memoryState()
    state.recordFile('Templates/a.txt', { eTag: 'e1', sha256: 's', size: 4 })

    const plan = (
      await buildSyncPlan(env, request({ direction: 'pull', compareContent: false }), state)
    ).data!

    expect(plan.items).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it('a Get still takes a file the server changed since the last sync', async () => {
    await writeFile(join(root, 'a.txt'), 'abcd')
    await utimes(join(root, 'a.txt'), dayAgo, dayAgo)
    collectManifestMock.mockResolvedValue([serverNow('a.txt', 4, 'e2')])
    const state = memoryState()
    state.recordFile('Templates/a.txt', { eTag: 'e1', sha256: 's', size: 4 })

    const plan = (
      await buildSyncPlan(env, request({ direction: 'pull', compareContent: false }), state)
    ).data!

    expect(plan.items[0]).toMatchObject({ action: 'replace', reason: 'Newer on the server' })
  })

  it('a Deploy skips a file left as the last sync wrote it, and takes one edited since', async () => {
    await writeFile(join(root, 'kept.txt'), 'abcd')
    await writeFile(join(root, 'edited.txt'), 'abcd')
    const { stat } = await import('fs/promises')
    const keptMtime = (await stat(join(root, 'kept.txt'))).mtimeMs
    collectManifestMock.mockResolvedValue([
      remote('kept.txt', 4, 'k1'),
      remote('edited.txt', 4, 'd1')
    ])
    const state = memoryState()
    state.recordFile('Templates/kept.txt', {
      eTag: 'k1',
      sha256: 's',
      size: 4,
      localMtimeMs: keptMtime
    })
    state.recordFile('Templates/edited.txt', { eTag: 'd1', sha256: 's', size: 4, localMtimeMs: 1 })

    const plan = (await buildSyncPlan(env, request({ compareContent: false }), state)).data!

    expect(plan.items.map((i) => [i.path, i.reason])).toEqual([
      ['edited.txt', 'Newer on this computer']
    ])
  })

  it('records the local time of what it wrote, and keeps what it knew about unchanged files', async () => {
    await writeFile(join(root, 'up.txt'), 'new')
    await writeFile(join(root, 'same.txt'), 'abcd')
    await utimes(join(root, 'same.txt'), dayAgo, dayAgo)
    collectManifestMock.mockResolvedValue([remote('same.txt', 4, 's1')])
    const state = memoryState()
    state.recordFile('Templates/same.txt', {
      eTag: 's1',
      sha256: 'known',
      size: 4,
      localMtimeMs: 7
    })
    const plan = (await buildSyncPlan(env, request({ compareContent: false }), state)).data!
    uploadOneFileMock.mockResolvedValue({ targetPath: 'x', size: 3, sha256: 'h', eTag: 'u1' })

    await runSyncPlan(
      plan.id,
      [{ jobId: 'j', path: 'up.txt' }],
      { progress: vi.fn(), done: vi.fn() },
      {
        state,
        trash: vi.fn()
      }
    )

    const { stat } = await import('fs/promises')
    expect(state.getFile('Templates/up.txt')).toMatchObject({
      eTag: 'u1',
      localMtimeMs: (await stat(join(root, 'up.txt'))).mtimeMs
    })
    // Accepted by date only: the known checksum and local time stay as they were.
    expect(state.getFile('Templates/same.txt')).toMatchObject({
      sha256: 'known',
      localMtimeMs: 7
    })
  })
})

describe('runSyncPlan', () => {
  const events = { progress: vi.fn(), done: vi.fn() }
  const trash = vi.fn().mockResolvedValue(undefined)

  it('uploads, guards replaces with the planned eTag, skips a kept server version, and records the baseline', async () => {
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'new.txt'), 'n')
    await writeFile(join(root, 'changed.txt'), 'changed!')
    await writeFile(join(root, 'theirs.txt'), 'mine')
    collectManifestMock.mockResolvedValue([
      remote('changed.txt', 1, 'c1'),
      remote('theirs.txt', 1, 't2')
    ])
    const state = memoryState()
    state.markRootSynced('Templates')
    state.recordFile('Templates/changed.txt', { eTag: 'c1', sha256: 's', size: 1 })
    state.recordFile('Templates/theirs.txt', { eTag: 't1', sha256: 's', size: 1 })
    const plan = (await buildSyncPlan(env, request(), state)).data!
    expect(plan.items.find((i) => i.path === 'theirs.txt')?.action).toBe('conflict')

    uploadOneFileMock.mockImplementation(async (_e, file, target) => ({
      targetPath: target,
      size: file.size,
      sha256: `sha-${file.remoteRelativePath}`,
      eTag: `new-${file.remoteRelativePath}`
    }))
    postJsonMock.mockResolvedValue({ created: true })

    const result = await runSyncPlan(
      plan.id,
      [
        { jobId: 'j-dir', path: 'sub' },
        { jobId: 'j-new', path: 'new.txt' },
        { jobId: 'j-changed', path: 'changed.txt' },
        { jobId: 'j-theirs', path: 'theirs.txt', resolution: 'remote' }
      ],
      events,
      { state, trash }
    )

    expect(result.data).toEqual({ done: 3, skipped: 1, failed: 0, cancelled: false })
    expect(postJsonMock).toHaveBeenCalledWith(
      env,
      'entries/directory',
      { path: 'Templates/sub' },
      {},
      undefined
    )
    const changedCall = uploadOneFileMock.mock.calls.find((c) => c[2] === 'Templates/changed.txt')!
    expect(changedCall[5]).toMatchObject({ ifMatch: 'c1' })
    expect(uploadOneFileMock.mock.calls.some((c) => c[2] === 'Templates/theirs.txt')).toBe(false)
    expect(state.getFile('Templates/new.txt')).toMatchObject({ eTag: 'new-new.txt' })
    // The kept server version is not accepted as the baseline: it stays a conflict.
    expect(state.getFile('Templates/theirs.txt')).toMatchObject({ eTag: 't1' })
    expect(events.done).toHaveBeenCalledWith('j-theirs', { ok: true, skipped: true })
  })

  it('explains a replace that lost the If-Match race', async () => {
    await writeFile(join(root, 'a.txt'), 'local!')
    collectManifestMock.mockResolvedValue([remote('a.txt', 1, 'e1')])
    const plan = (await buildSyncPlan(env, request(), memoryState())).data!
    uploadOneFileMock.mockRejectedValue(
      new FileTransferApiError(412, { code: 'PRECONDITION_FAILED', message: 'x' }, '')
    )

    const result = await runSyncPlan(plan.id, [{ jobId: 'j', path: 'a.txt' }], events, {
      state: memoryState(),
      trash
    })

    expect(result.data!.failed).toBe(1)
    expect(events.done).toHaveBeenCalledWith('j', {
      ok: false,
      error: expect.stringContaining('changed on the server while syncing')
    })
  })

  it('pull deletes go to the trash', async () => {
    await writeFile(join(root, 'stale.txt'), 's')
    collectManifestMock.mockResolvedValue([])
    const plan = (
      await buildSyncPlan(env, request({ direction: 'pull', deleteExtra: true }), memoryState())
    ).data!
    expect(plan.items[0]).toMatchObject({ action: 'delete', path: 'stale.txt' })

    await runSyncPlan(plan.id, [{ jobId: 'j', path: 'stale.txt' }], events, {
      state: memoryState(),
      trash
    })

    expect(trash).toHaveBeenCalledWith(join(root, 'stale.txt'))
  })

  it('cancelling one item stops only that item and still records the baseline', async () => {
    await writeFile(join(root, 'a.txt'), 'a')
    await writeFile(join(root, 'b.txt'), 'b')
    collectManifestMock.mockResolvedValue([])
    const state = memoryState()
    const plan = (await buildSyncPlan(env, request(), state)).data!
    const own = new AbortController()
    uploadOneFileMock.mockImplementation(async (_e, file, target, _o, _p, opts) => {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return { targetPath: target, size: file.size, sha256: 's', eTag: 'e' }
    })
    own.abort()

    const result = await runSyncPlan(
      plan.id,
      [
        { jobId: 'j-a', path: 'a.txt' },
        { jobId: 'j-b', path: 'b.txt' }
      ],
      events,
      { state, trash, itemSignal: (id) => (id === 'j-a' ? own.signal : undefined) },
      new AbortController().signal
    )

    expect(events.done).toHaveBeenCalledWith('j-a', { ok: false, error: 'Cancelled.' })
    expect(events.done).toHaveBeenCalledWith('j-b', { ok: true })
    expect(result.data).toMatchObject({ done: 1, cancelled: false })
    expect(state.roots.has('templates')).toBe(true)
  })

  it('a stale plan id asks for a new preview', async () => {
    const result = await runSyncPlan('gone', [], events, { trash })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Preview the sync again')
  })
})
