import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'

const {
  mkdirMock,
  openMock,
  closeMock,
  readMock,
  statMock,
  readdirMock,
  renameMock,
  rmMock,
  writtenFiles
} = vi.hoisted(() => ({
  mkdirMock: vi.fn(),
  openMock: vi.fn(),
  closeMock: vi.fn(),
  readMock: vi.fn(),
  statMock: vi.fn(),
  readdirMock: vi.fn(),
  renameMock: vi.fn(),
  rmMock: vi.fn(),
  // Download targets: path → { flags, bytes } for each createWriteStream call.
  writtenFiles: new Map<string, { flags: string; bytes: number[] }>()
}))

vi.mock('fs/promises', () => ({
  mkdir: mkdirMock,
  readdir: readdirMock,
  stat: statMock,
  open: openMock,
  rename: renameMock,
  rm: rmMock
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const { Writable } = await import('stream')
  return {
    ...actual,
    createWriteStream: (path: string, options: { flags: string }) => {
      const record = { flags: options.flags, bytes: [] as number[] }
      writtenFiles.set(path, record)
      return new Writable({
        write(chunk: Buffer, _encoding, callback): void {
          record.bytes.push(...chunk)
          callback()
        }
      })
    }
  }
})

vi.mock('./auth', () => ({
  resolveAuthHeader: vi.fn().mockResolvedValue('Bearer test-key')
}))

import {
  listFiles,
  downloadFile,
  deleteRemote,
  copyRemote,
  renameRemote,
  createRemoteDirectory,
  uploadFiles,
  checkUploadConflicts,
  TIMED_OUT
} from './dw-api'
import type { StoredEnv } from '../shared/types'

const env: StoredEnv = {
  name: 'prod',
  host: 'dw.example.com',
  protocol: 'https',
  authType: 'apiKey'
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

function errorResponse(status: number, body?: unknown): Response {
  return {
    ok: false,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body))
  } as unknown as Response
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>
}

const missingFile = Object.assign(new Error('missing'), { code: 'ENOENT' })

describe('dw-api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mkdirMock.mockResolvedValue(undefined)
    openMock.mockResolvedValue({ close: closeMock, read: readMock })
    closeMock.mockResolvedValue(undefined)
    readdirMock.mockResolvedValue([])
    renameMock.mockResolvedValue(undefined)
    rmMock.mockResolvedValue(undefined)
    writtenFiles.clear()
  })

  it('listFiles maps file entries correctly', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          path: 'Images',
          name: 'Images',
          isDirectory: true,
          size: 0,
          modifiedUtc: '2026-04-10T08:00:00.000Z'
        },
        {
          path: 'README.txt',
          name: 'README.txt',
          isDirectory: false,
          size: 128,
          modifiedUtc: '2026-04-15T10:00:00.000Z'
        }
      ])
    )

    const result = await listFiles(env, '/')

    expect(fetch).toHaveBeenCalledOnce()
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/Admin/Api/FileTransfer/entries?path=')
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

  it('listFiles returns every entry in one call (no paging)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        Array.from({ length: 150 }, (_, i) => ({
          path: `Images/f${i}.png`,
          name: `f${i}.png`,
          isDirectory: false,
          size: 1,
          modifiedUtc: '2026-01-01T00:00:00Z'
        }))
      )
    )

    const result = await listFiles(env, '/Images')

    expect(fetch).toHaveBeenCalledOnce()
    expect(result.data).toHaveLength(150)
  })

  it('listFiles returns error on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      errorResponse(401, { code: 'UNAUTHORIZED', message: 'Unauthorized' })
    )
    const result = await listFiles(env, '/')
    expect(result.ok).toBe(false)
    // 401 is humanized into a user-facing authentication message.
    expect(result.error).toContain('Authentication failed')
  })

  it('listFiles reports a folder permission refusal, not an authentication failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      errorResponse(403, { code: 'FORBIDDEN', message: 'Access denied', path: '' })
    )
    const result = await listFiles(env, '/')
    expect(result.ok).toBe(false)
    expect(result.error).toContain("don't have access")
    expect(result.error).not.toContain('Authentication failed')
  })

  it('listFiles explains a missing File Transfer API (bare 404)', async () => {
    vi.mocked(fetch).mockResolvedValue(errorResponse(404))
    const result = await listFiles(env, '/')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('File Transfer API')
  })

  it('downloadFile streams a single file to a partial file, then renames it', async () => {
    statMock.mockRejectedValue(missingFile)
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/entries/exists')) {
        return jsonResponse({ path: 'logo.png', exists: true, isDirectory: false })
      }
      if (url.includes('/entries/metadata')) return jsonResponse({ eTag: '"4-abc"' })
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
    })

    const result = await downloadFile(env, '/logo.png', '/tmp/downloads')

    expect(result).toEqual({ ok: true })
    const [[partial, final]] = renameMock.mock.calls as [string, string][]
    expect(partial).toMatch(/logo\.png\.4-abc\.dwpart$/)
    expect(final).toMatch(/[\\/]tmp[\\/]downloads[\\/]logo\.png$/)
    expect(writtenFiles.get(partial)).toEqual({ flags: 'w', bytes: [1, 2, 3, 4] })
  })

  it('downloadFile resumes a partial download with Range + If-Range', async () => {
    // Two bytes of this version already arrived in an earlier attempt.
    statMock.mockResolvedValue({ size: 2 })
    const downloadHeaders: Record<string, string>[] = []
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/entries/exists')) {
        return jsonResponse({ path: 'logo.png', exists: true, isDirectory: false })
      }
      if (url.includes('/entries/metadata')) return jsonResponse({ eTag: '4-abc' })
      downloadHeaders.push(headersOf(init))
      return new Response(new Uint8Array([3, 4]), { status: 206 })
    })

    const result = await downloadFile(env, '/logo.png', '/tmp/downloads')

    expect(result).toEqual({ ok: true })
    expect(downloadHeaders[0]).toMatchObject({ Range: 'bytes=2-', 'If-Range': '4-abc' })
    const [[partial]] = renameMock.mock.calls as [string, string][]
    expect(writtenFiles.get(partial)).toEqual({ flags: 'a', bytes: [3, 4] })
  })

  it('downloadFile walks the manifest and downloads each file for a directory', async () => {
    statMock.mockRejectedValue(missingFile)
    const entry = (path: string, isDirectory: boolean): object => ({
      path,
      name: path.split('/').pop(),
      isDirectory,
      size: 1,
      modifiedUtc: '2026-01-01T00:00:00Z',
      eTag: isDirectory ? null : `1-${path.replace(/\W/g, '')}`
    })
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/entries/exists')) {
        return jsonResponse({ path: 'Docs', exists: true, isDirectory: true })
      }
      if (url.includes('/manifest')) {
        return jsonResponse({
          path: 'Docs',
          entries: [entry('a.txt', false), entry('sub', true), entry('sub/b.txt', false)],
          nextCursor: null
        })
      }
      if (url.includes('/entries/metadata')) throw new Error('eTag should come from the manifest')
      return new Response(new Uint8Array([9]), { status: 200 })
    })

    const result = await downloadFile(env, '/Docs', '/tmp/downloads')

    expect(result).toEqual({ ok: true })
    // Directory downloads wrap the contents in a subfolder named after the remote folder.
    const finals = renameMock.mock.calls.map(([, to]) => String(to))
    expect(finals).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/[\\/]tmp[\\/]downloads[\\/]Docs[\\/]a\.txt$/),
        expect.stringMatching(/[\\/]tmp[\\/]downloads[\\/]Docs[\\/]sub[\\/]b\.txt$/)
      ])
    )
  })

  it('downloadFile refuses manifest paths that escape the destination', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/entries/exists')) {
        return jsonResponse({ path: 'Docs', exists: true, isDirectory: true })
      }
      return jsonResponse({
        path: 'Docs',
        entries: [{ path: '../evil.txt', name: 'evil.txt', isDirectory: false, size: 1 }],
        nextCursor: null
      })
    })

    const result = await downloadFile(env, '/Docs', '/tmp/downloads')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('unsafe path')
    expect(renameMock).not.toHaveBeenCalled()
  })

  it('deleteRemote posts to entries/delete with recursive:true and an Idempotency-Key', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => '' } as Response)
    const result = await deleteRemote(env, '/Files/Images')
    expect(result).toEqual({ ok: true })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/Admin/Api/FileTransfer/entries/delete')
    expect(JSON.parse(init!.body as string)).toEqual({ path: 'Files/Images', recursive: true })
    expect(headersOf(init)['Idempotency-Key']).toBeTruthy()
  })

  it('deleteRemote treats an already-missing path as success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      errorResponse(404, { code: 'NOT_FOUND', message: 'Not found' })
    )
    expect(await deleteRemote(env, '/gone.txt')).toEqual({ ok: true })
  })

  it('deleteRemote with ifMatch deletes only that version and explains a newer one', async () => {
    vi.mocked(fetch).mockResolvedValue(
      errorResponse(412, { code: 'PRECONDITION_FAILED', message: 'eTag mismatch' })
    )
    const result = await deleteRemote(env, '/Templates/old.cshtml', 'etag-1')
    expect(headersOf(vi.mocked(fetch).mock.calls[0][1])['If-Match']).toBe('etag-1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('“old.cshtml” changed on the server since the preview')
  })

  it('copyRemote posts source/destination paths', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => '' } as Response)
    const result = await copyRemote(env, '/Files/a.txt', '/Files/b.txt')
    expect(result).toEqual({ ok: true })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init!.body as string)).toEqual({
      sourcePath: 'Files/a.txt',
      destinationPath: 'Files/b.txt',
      overwrite: false
    })
  })

  it('mutations reuse one Idempotency-Key across retries', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        errorResponse(503, { code: 'IO_ERROR', message: 'busy', retryable: true })
      )
      .mockResolvedValueOnce({ ok: true, text: async () => '' } as Response)

    const result = await copyRemote(env, '/a.txt', '/b.txt')

    expect(result).toEqual({ ok: true })
    const keys = vi.mocked(fetch).mock.calls.map(([, init]) => headersOf(init)['Idempotency-Key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  function mockLocalFile(size: number): void {
    statMock.mockResolvedValue({ isDirectory: () => false, isFile: () => true, size })
    readMock.mockImplementation((buffer: Buffer, offset: number, length: number) => {
      buffer.fill(66, offset, offset + length)
      return Promise.resolve({ bytesRead: length })
    })
  }

  it('checkUploadConflicts reports files that already exist remotely', async () => {
    mockLocalFile(4)
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input))
      const exists = url.includes('Files/a.txt')
      return jsonResponse({ path: '', exists, isDirectory: false })
    })

    const result = await checkUploadConflicts(env, ['/tmp/src/a.txt', '/tmp/src/b.txt'], '/Files')

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ totalFiles: 2, conflicts: ['a.txt'] })
  })

  // A local tree for folder uploads: folder path → child names (a trailing '/' marks a folder).
  function mockLocalTree(tree: Record<string, string[]>): void {
    const folders = new Set(Object.keys(tree).map((p) => join(p)))
    statMock.mockImplementation(async (p: string) => {
      const isDir = folders.has(join(p))
      return { isDirectory: () => isDir, isFile: () => !isDir, size: 4 }
    })
    readdirMock.mockImplementation(async (p: string) => {
      const entry = Object.entries(tree).find(([folder]) => join(folder) === join(p))
      return (entry?.[1] ?? []).map((name) => ({
        name: name.replace(/\/$/, ''),
        isDirectory: () => name.endsWith('/')
      }))
    })
    readMock.mockImplementation((buffer: Buffer, offset: number, length: number) => {
      buffer.fill(66, offset, offset + length)
      return Promise.resolve({ bytesRead: length })
    })
  }

  it('checkUploadConflicts leaves junk out of an uploaded folder without listing it', async () => {
    mockLocalTree({
      '/tmp/site': ['page.cshtml', '.DS_Store', '.git/', 'css/'],
      '/tmp/site/.git': ['HEAD'],
      '/tmp/site/css': ['a.css', 'b.tmp']
    })
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({ path: '', exists: false, isDirectory: false })
    )

    const result = await checkUploadConflicts(env, ['/tmp/site'], '/Files')

    expect(result.data).toEqual({ totalFiles: 2, conflicts: [] })
    expect(readdirMock.mock.calls.map(([p]) => join(p as string))).not.toContain(
      join('/tmp/site/.git')
    )
  })

  it('uploadFiles reports excluded junk, matches inside the picked folder, and keeps picked files', async () => {
    mockLocalTree({
      '/tmp/src/node_modules': ['lib.js', '.DS_Store']
    })
    const sessionsCreated: string[] = []
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      if (url.endsWith('/uploads') && init?.method === 'POST') {
        sessionsCreated.push((JSON.parse(init.body as string) as { targetPath: string }).targetPath)
        return jsonResponse({ id: 's1', chunkSize: 4, totalChunks: 1 })
      }
      if (url.includes('/chunks/')) return jsonResponse({})
      if (url.includes('/finalize')) return jsonResponse({ targetPath: 'x' })
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await uploadFiles(
      env,
      ['/tmp/src/node_modules', '/tmp/src/.DS_Store'],
      '/Files',
      true,
      () => undefined
    )

    expect(result.data).toMatchObject({
      uploaded: 2,
      excludedNames: ['node_modules/.DS_Store']
    })
    expect(sessionsCreated.sort()).toEqual(['Files/.DS_Store', 'Files/node_modules/lib.js'])
  })

  it('uploadFiles marks a folder permission refusal and names the missing permission', async () => {
    mockLocalFile(4)
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      if (url.endsWith('/uploads') && init?.method === 'POST') {
        return errorResponse(403, {
          code: 'FORBIDDEN',
          message: 'Create permission is required on the target directory.',
          path: 'Images/file.txt'
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await uploadFiles(env, ['/tmp/file.txt'], '/Images', true, () => undefined)

    expect(result.ok).toBe(false)
    expect(result.errorKind).toBe('permission')
    expect(result.error).toContain('You need Create permission on "/Images/file.txt"')
    expect(result.error).not.toContain('Authentication failed')
  })

  it('uploadFiles with ifMatch replaces only that version and explains a newer one', async () => {
    mockLocalFile(4)
    let finalizeInit: RequestInit | undefined
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      if (url.endsWith('/uploads') && init?.method === 'POST') {
        return jsonResponse({ id: 's1', chunkSize: 4, totalChunks: 1 })
      }
      if (url.includes('/chunks/')) return jsonResponse({})
      if (url.includes('/finalize')) {
        finalizeInit = init
        return errorResponse(412, { code: 'PRECONDITION_FAILED', message: 'eTag mismatch' })
      }
      if (init?.method === 'DELETE') return jsonResponse({})
      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await uploadFiles(
      env,
      ['/tmp/src/theme.json'],
      '/Files',
      true,
      () => undefined,
      undefined,
      'etag-1'
    )

    expect(headersOf(finalizeInit)['If-Match']).toBe('etag-1')
    // With If-Match the server replaces only that version, so overwrite stays off.
    expect(JSON.parse(finalizeInit!.body as string)).toMatchObject({ overwrite: false })
    expect(result.ok).toBe(false)
    expect(result.data?.firstError).toContain(
      '“theme.json” changed on the server since the preview'
    )
  })

  it('uploadFiles skips existing files when overwrite is off and reports a summary', async () => {
    mockLocalFile(4)
    const sessionsCreated: string[] = []
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      if (url.includes('/entries/exists')) {
        return jsonResponse({ path: '', exists: url.includes('Files/a.txt'), isDirectory: false })
      }
      if (url.endsWith('/uploads') && init?.method === 'POST') {
        expect(headersOf(init)['Idempotency-Key']).toBeTruthy()
        const body = JSON.parse(init.body as string) as { targetPath: string }
        sessionsCreated.push(body.targetPath)
        return jsonResponse({ id: 's1', chunkSize: 4, totalChunks: 1 })
      }
      if (url.includes('/chunks/')) return jsonResponse({})
      if (url.includes('/finalize')) return jsonResponse({ targetPath: 'Files/b.txt' })
      throw new Error(`Unexpected request: ${url}`)
    })

    const progress: number[] = []
    const result = await uploadFiles(
      env,
      ['/tmp/src/a.txt', '/tmp/src/b.txt'],
      '/Files',
      false,
      (transferred) => progress.push(transferred)
    )

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      uploaded: 1,
      skipped: 1,
      skippedNames: ['a.txt'],
      failed: 0
    })
    // Only the missing file got an upload session.
    expect(sessionsCreated).toEqual(['Files/b.txt'])
    // Progress total reflects only the uploaded file's bytes.
    expect(progress.at(-1)).toBe(4)
  })

  it('uploadFiles with overwrite replaces without any exists checks', async () => {
    mockLocalFile(4)
    const existsCalls: string[] = []
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      if (url.includes('/entries/exists')) existsCalls.push(url)
      if (url.endsWith('/uploads') && init?.method === 'POST') {
        return jsonResponse({ id: 's1', chunkSize: 4, totalChunks: 1 })
      }
      if (url.includes('/chunks/')) return jsonResponse({})
      if (url.includes('/finalize')) {
        const body = JSON.parse(init!.body as string) as { overwrite: boolean }
        expect(body.overwrite).toBe(true)
        return jsonResponse({})
      }
      return jsonResponse({})
    })

    const result = await uploadFiles(env, ['/tmp/src/a.txt'], '/Files', true, () => {})

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ uploaded: 1, skipped: 0, failed: 0 })
    expect(existsCalls).toEqual([])
  })

  it('uploadFiles cancels the session when a chunk fails terminally', async () => {
    mockLocalFile(4)
    const methods: string[] = []
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      methods.push(`${init?.method ?? 'GET'} ${url.replace(/^.*FileTransfer\//, '')}`)
      if (url.endsWith('/uploads')) return jsonResponse({ id: 's1', chunkSize: 4, totalChunks: 1 })
      if (url.includes('/chunks/')) {
        return errorResponse(422, { code: 'CHECKSUM_MISMATCH', message: 'bad chunk' })
      }
      return jsonResponse({})
    })

    const result = await uploadFiles(env, ['/tmp/src/a.txt'], '/Files', true, () => {})

    expect(result.ok).toBe(false)
    expect(result.error).toContain('bad chunk')
    expect(methods).toContain('DELETE uploads/s1')
  })

  it('createRemoteDirectory posts the joined path to entries/directory', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ entry: {}, created: true }))
    const result = await createRemoteDirectory(env, '/Images', 'Banners')
    expect(result).toEqual({ ok: true })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/Admin/Api/FileTransfer/entries/directory')
    expect(JSON.parse(init!.body as string)).toEqual({ path: 'Images/Banners' })
    expect(headersOf(init)['Idempotency-Key']).toBeTruthy()
  })

  it('createRemoteDirectory at the root creates a top-level folder', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ entry: {}, created: true }))
    await createRemoteDirectory(env, '/', 'Exports')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init!.body as string)).toEqual({ path: 'Exports' })
  })

  it('createRemoteDirectory reports an existing folder as an error', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ entry: {}, created: false }))
    const result = await createRemoteDirectory(env, '/Images', 'Banners')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('already exists')
  })

  it('gives up on a JSON request the server doesn’t answer, without retrying', async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    const result = await createRemoteDirectory(env, '/', 'Exports')
    expect(result).toEqual({ ok: false, error: TIMED_OUT })
    expect(fetch).toHaveBeenCalledOnce()
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('renameRemote moves within the same parent directory', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => '' } as Response)
    const result = await renameRemote(env, '/Files/Images/old.png', 'new.png')
    expect(result).toEqual({ ok: true })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init!.body as string)).toEqual({
      sourcePath: 'Files/Images/old.png',
      destinationPath: 'Files/Images/new.png',
      overwrite: false
    })
  })
})
