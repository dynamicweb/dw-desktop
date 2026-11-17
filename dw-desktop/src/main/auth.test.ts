import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPasswordMock, setPasswordMock, deletePasswordMock } = vi.hoisted(() => ({
  getPasswordMock: vi.fn(),
  setPasswordMock: vi.fn(),
  deletePasswordMock: vi.fn()
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: getPasswordMock,
    setPassword: setPasswordMock,
    deletePassword: deletePasswordMock
  }
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { resolveAuthHeader, testConnection } from './auth'
import type { StoredEnv } from '../shared/types'

const prodEnv: StoredEnv = {
  name: 'prod',
  host: 'dw.example.com',
  protocol: 'https',
  authType: 'apiKey'
}

const oauthEnv: StoredEnv = {
  name: 'oauth-env',
  host: 'dw.example.com',
  protocol: 'https',
  authType: 'oauth'
}

describe('resolveAuthHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPasswordMock.mockResolvedValue(null)
    setPasswordMock.mockResolvedValue(undefined)
    deletePasswordMock.mockResolvedValue(true)
    fetchMock.mockReset()
  })

  it('resolveAuthHeader for apiKey reads from keytar and returns correct header', async () => {
    getPasswordMock.mockResolvedValue('secret-api-key')

    const header = await resolveAuthHeader(prodEnv)

    expect(getPasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:apiKey')
    expect(header).toBe('Bearer secret-api-key')
  })

  it('resolveAuthHeader for apiKey throws when key not found', async () => {
    getPasswordMock.mockResolvedValue(null)

    await expect(resolveAuthHeader(prodEnv)).rejects.toThrow('No API key found')
  })

  it('OAuth token is fetched and cached after first call', async () => {
    // Use a unique env name to avoid cache collision with other tests
    const tokenEnv: StoredEnv = { ...oauthEnv, name: 'oauth-cache-test-' + Date.now() }

    getPasswordMock.mockImplementation((_: string, account: string) => {
      if (account.endsWith(':oauthClientId')) return Promise.resolve('client-id')
      if (account.endsWith(':oauthClientSecret')) return Promise.resolve('client-secret')
      return Promise.resolve(null)
    })

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ token: 'oauth-token-123', expires: 3600 }))
    })

    const header1 = await resolveAuthHeader(tokenEnv)
    expect(header1).toBe('Bearer oauth-token-123')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Second call: token is far from expiry (3600 - 60 = 3540s left), should use cache
    const header2 = await resolveAuthHeader(tokenEnv)
    expect(header2).toBe('Bearer oauth-token-123')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('OAuth token is refreshed when within 60s of expiry', async () => {
    const tokenEnv: StoredEnv = { ...oauthEnv, name: 'oauth-refresh-test-' + Date.now() }

    getPasswordMock.mockImplementation((_: string, account: string) => {
      if (account.endsWith(':oauthClientId')) return Promise.resolve('client-id')
      if (account.endsWith(':oauthClientSecret')) return Promise.resolve('client-secret')
      return Promise.resolve(null)
    })

    // First fetch: token expires in 30s — within the 60s refresh window
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ token: 'expiring-soon', expires: 30 }))
    })

    // Second fetch: fresh token
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ token: 'fresh-token', expires: 3600 }))
    })

    const header1 = await resolveAuthHeader(tokenEnv)
    expect(header1).toBe('Bearer expiring-soon')

    // Token expires in 30s which is < 60s threshold, so second call re-fetches
    const header2 = await resolveAuthHeader(tokenEnv)
    expect(header2).toBe('Bearer fresh-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('testConnection', () => {
  const tokenOk = (): Response =>
    new Response(JSON.stringify({ token: 'tok', expires_in: 3600 }), { status: 200 })
  const creds = { authType: 'oauth' as const, clientId: 'id', clientSecret: 'secret' }

  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('treats a 403 on the root probe as a working login limited by folder permissions', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(new Response('{"code":"FORBIDDEN"}', { status: 403 }))
    const status = await testConnection(oauthEnv, creds)
    expect(status.connected).toBe(true)
    expect(status.notice).toContain('/Files root')
  })

  it('still fails when the token request is refused', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"invalid_client"}', { status: 401 }))
    const status = await testConnection(oauthEnv, creds)
    expect(status.connected).toBe(false)
    expect(status.error).toContain('Authentication failed')
  })

  it('still fails when the API rejects the token (401)', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(new Response('', { status: 401 }))
    const status = await testConnection(oauthEnv, creds)
    expect(status.connected).toBe(false)
  })
})
