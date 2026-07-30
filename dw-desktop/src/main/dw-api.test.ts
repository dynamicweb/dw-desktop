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

import { listFiles, downloadFile } from './dw-api'
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
    expect(result.data).toHaveLength(2)
    expect(result.data![0]).toMatchObject({ name: 'Images', type: 'directory', path: '/Images' })
    expect(result.data![1]).toMatchObject({
      name: 'README.txt',
      type: 'file',
      size: 128,
      path: '/README.txt'
    })
  })

  it('listFiles walks every page via PagingSize/PagingIndex and concatenates them', async () => {
    const page = (names: string[], totalPages: number): Response =>
      ({
        ok: true,
        text: async () =>
          JSON.stringify({
            model: {
              totalPages,
              data: names.map((n) => ({ name: n, sizeInBytes: 10 }))
            }
          })
      }) as Response

    vi.mocked(fetch)
      .mockResolvedValueOnce(page(['a.txt', 'b.txt'], 3))
      .mockResolvedValueOnce(page(['c.txt', 'd.txt'], 3))
      .mockResolvedValueOnce(page(['e.txt'], 3))

    const result = await listFiles(env, '/Images')

    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(5)
    expect(result.data!.map((e) => e.name)).toEqual(['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'])
    expect(fetch).toHaveBeenCalledTimes(3)

    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    // Correct (capitalized) paging params — not the silently-ignored `pageSize`.
    expect(urls[0]).toContain('PagingSize=500')
    expect(urls[0]).not.toContain('pageSize=')
    expect(urls[0]).toContain('PagingIndex=1')
    expect(urls[1]).toContain('PagingIndex=2')
    expect(urls[2]).toContain('PagingIndex=3')
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
})
