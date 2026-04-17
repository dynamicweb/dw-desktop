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

import {
  saveApiKey,
  getApiKey,
  saveOAuthCredentials,
  getOAuthCredentials,
  deleteAllCredentials
} from './credentials'

describe('credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPasswordMock.mockResolvedValue(null)
    setPasswordMock.mockResolvedValue(undefined)
    deletePasswordMock.mockResolvedValue(true)
  })

  it('saveApiKey stores with correct account key format', async () => {
    await saveApiKey('prod', 'my-api-key')
    expect(setPasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:apiKey', 'my-api-key')
  })

  it('getApiKey reads with correct account key format', async () => {
    getPasswordMock.mockResolvedValue('returned-key')
    const key = await getApiKey('prod')
    expect(getPasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:apiKey')
    expect(key).toBe('returned-key')
  })

  it('getOAuthCredentials returns null when not set', async () => {
    getPasswordMock.mockResolvedValue(null)
    const result = await getOAuthCredentials('prod')
    expect(result).toBeNull()
  })

  it('getOAuthCredentials returns null when only clientId is set', async () => {
    getPasswordMock.mockImplementation((_svc: string, account: string) =>
      Promise.resolve(account.endsWith(':oauthClientId') ? 'some-id' : null)
    )
    const result = await getOAuthCredentials('prod')
    expect(result).toBeNull()
  })

  it('getOAuthCredentials returns credentials when both are set', async () => {
    getPasswordMock.mockImplementation((_svc: string, account: string) => {
      if (account === 'prod:oauthClientId') return Promise.resolve('client-id')
      if (account === 'prod:oauthClientSecret') return Promise.resolve('client-secret')
      return Promise.resolve(null)
    })
    const result = await getOAuthCredentials('prod')
    expect(result).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' })
  })

  it('saveOAuthCredentials stores both keys', async () => {
    await saveOAuthCredentials('staging', 'cid', 'csecret')
    expect(setPasswordMock).toHaveBeenCalledWith('dw-desktop', 'staging:oauthClientId', 'cid')
    expect(setPasswordMock).toHaveBeenCalledWith('dw-desktop', 'staging:oauthClientSecret', 'csecret')
  })

  it('deleteAllCredentials calls delete for all three key types', async () => {
    await deleteAllCredentials('prod')
    expect(deletePasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:apiKey')
    expect(deletePasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:oauthClientId')
    expect(deletePasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:oauthClientSecret')
    expect(deletePasswordMock).toHaveBeenCalledTimes(3)
  })
})
