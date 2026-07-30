import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mkdirMock, extractAllToMock, admZipConstructorMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn(),
  extractAllToMock: vi.fn(),
  admZipConstructorMock: vi.fn()
}))

vi.mock('fs/promises', () => ({
  mkdir: mkdirMock,
  readdir: vi.fn(),
  stat: vi.fn()
}))

// Preserve real `fs` but stub createReadStream to yield one chunk so uploadFiles
// can be exercised without touching the disk.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    createReadStream: () => {
      async function* gen(): AsyncGenerator<Buffer> {
        yield Buffer.from('data')
      }
      return gen()
    }
  }
})

vi.mock('adm-zip', () => ({
  default: class MockAdmZip {
    constructor(buffer: Buffer) {
      admZipConstructorMock(buffer)
    }
    extractAllTo(path: string, overwrite: boolean): void {
      extractAllToMock(path, overwrite)
    }
    getEntries(): Array<{ entryName: string; isDirectory: boolean; header: { size: number } }> {
      return []
    }
  }
}))

vi.mock('./auth', () => ({
  resolveAuthHeader: vi.fn().mockResolvedValue('Bearer test-key')
}))

import { stat } from 'fs/promises'
import { listFiles, downloadFile, uploadFiles } from './dw-api'
import type { StoredEnv } from '../shared/types'

const env: StoredEnv = {
  name: 'prod',
  host: 'dw.example.com',
  protocol: 'https',
  authType: 'apiKey'
}

describe('dw-api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mkdirMock.mockResolvedValue(undefined)
  })

  it('listFiles maps file entries correctly', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          model: {
            data: [
              { name: 'Images', sizeInBytes: 0, updatedAt: '2026-04-10T08:00:00.000Z' },
              { name: 'README.txt', sizeInBytes: 128, updatedAt: '2026-04-15T10:00:00.000Z' }
            ]
          }
        })
    } as Response)

    const result = await listFiles(env, '/')

    expect(fetch).toHaveBeenCalledOnce()
    expect(result.ok).toBe(true)
    expect(result.data!.entries).toHaveLength(2)
    expect(result.data!.hasMore).toBe(false)
    expect(result.data!.entries[0]).toMatchObject({
      name: 'Images',
      type: 'directory',
      path: '/Images'
    })
    expect(result.data!.entries[1]).toMatchObject({
      name: 'README.txt',
      type: 'file',
      size: 128,
      path: '/README.txt'
    })
  })

  it('listFiles loads only the first page by default and reports hasMore', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          model: {
            totalCount: 287,
            totalPages: 2,
            data: [{ name: 'a.png', sizeInBytes: 10 }]
          }
        })
    } as Response)

    const result = await listFiles(env, '/Images')

    expect(fetch).toHaveBeenCalledOnce() // default: first page only, no walk
    expect(result.ok).toBe(true)
    expect(result.data!.totalCount).toBe(287)
    expect(result.data!.hasMore).toBe(true)
    const url = String(vi.mocked(fetch).mock.calls[0][0])
    expect(url).toContain('PagingSize=')
    expect(url).not.toContain('pageSize=') // the old, silently-ignored param
    expect(url).toContain('PagingIndex=1')
  })

  it('listFiles(loadAll) walks every page and clears hasMore', async () => {
    const page = (names: string[], totalCount: number, totalPages: number): Response =>
      ({
        ok: true,
        text: async () =>
          JSON.stringify({
            model: { totalCount, totalPages, data: names.map((n) => ({ name: n, sizeInBytes: 5 })) }
          })
      }) as Response

    vi.mocked(fetch)
      .mockResolvedValueOnce(page(['a', 'b'], 3, 2))
      .mockResolvedValueOnce(page(['c'], 3, 2))

    const result = await listFiles(env, '/Images', true)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.data!.entries.map((e) => e.name)).toEqual(['a', 'b', 'c'])
    expect(result.data!.hasMore).toBe(false)
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('PagingIndex=2')
  })

  it('listFiles returns error on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as Response)
    const result = await listFiles(env, '/')
    expect(result.ok).toBe(false)
    // 401 is humanized into a user-facing authentication message.
    expect(result.error).toContain('Authentication failed')
  })

  it('downloadFile extracts zip archive into a subfolder named after the remote folder', async () => {
    // ZIP magic bytes 'PK\x03\x04' so the code path treats it as a ZIP archive.
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/zip' : null) },
      arrayBuffer: async () => zipBytes.buffer
    } as unknown as Response)

    const result = await downloadFile(env, '/Files', '/tmp/downloads')

    expect(result).toEqual({ ok: true })
    expect(mkdirMock).toHaveBeenCalledWith('/tmp/downloads', { recursive: true })
    expect(admZipConstructorMock).toHaveBeenCalledOnce()
    // Directory downloads wrap the contents in a subfolder named after the remote
    // folder (path basename) so they don't spill into the destination root.
    const wrappedPath = expect.stringMatching(/[\\/]tmp[\\/]downloads[\\/]Files$/)
    expect(mkdirMock).toHaveBeenCalledWith(wrappedPath, { recursive: true })
    expect(extractAllToMock).toHaveBeenCalledWith(wrappedPath, true)
  })

  it('uploadFiles reports files the server skipped (absent from response model)', async () => {
    // Both inputs are plain files.
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => false,
      size: 4
    } as unknown as Awaited<ReturnType<typeof stat>>)

    // Server wrote only new.txt; old.txt already existed and was skipped, so it
    // is absent from `model`.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'ok', model: ['/Files/x/new.txt'] })
    } as Response)

    const result = await uploadFiles(
      env,
      ['/local/new.txt', '/local/old.txt'],
      '/x',
      false,
      () => {}
    )

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ uploaded: 1, skipped: 1 })
    expect(result.data!.skippedNames).toEqual(['old.txt'])
  })
})
