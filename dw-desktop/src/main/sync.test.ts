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
