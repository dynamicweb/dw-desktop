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
    constructor(buffer: Buffer) { admZipConstructorMock(buffer) }
    extractAllTo(path: string, overwrite: boolean): void { extractAllToMock(path, overwrite) }
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
      text: async () => JSON.stringify({
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
    expect(result.data![1]).toMatchObject({ name: 'README.txt', type: 'file', size: 128, path: '/README.txt' })
  })

  it('listFiles returns error on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as Response)
    const result = await listFiles(env, '/')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('401')
  })

  it('downloadFile extracts zip archive to localPath', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
    } as Response)

    const result = await downloadFile(env, '/Files', '/tmp/downloads')

    expect(result).toEqual({ ok: true })
    expect(mkdirMock).toHaveBeenCalledWith('/tmp/downloads', { recursive: true })
    expect(admZipConstructorMock).toHaveBeenCalledOnce()
    expect(extractAllToMock).toHaveBeenCalledWith('/tmp/downloads', true)
  })
})
