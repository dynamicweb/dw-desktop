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
  saveUsername,
  getUsername,
  getCredentialHints,
  obfuscateSecret,
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
    expect(setPasswordMock).toHaveBeenCalledWith(
      'dw-desktop',
      'staging:oauthClientSecret',
      'csecret'
    )
  })

  it('saveUsername / getUsername use the correct account key', async () => {
    await saveUsername('prod', 'admin')
    expect(setPasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:username', 'admin')
    getPasswordMock.mockResolvedValue('admin')
    expect(await getUsername('prod')).toBe('admin')
    expect(getPasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:username')
  })

  it('deleteAllCredentials clears api key, oauth pair, and username', async () => {
    await deleteAllCredentials('prod')
    expect(deletePasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:apiKey')
    expect(deletePasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:oauthClientId')
    expect(deletePasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:oauthClientSecret')
    expect(deletePasswordMock).toHaveBeenCalledWith('dw-desktop', 'prod:username')
    expect(deletePasswordMock).toHaveBeenCalledTimes(4)
  })

  describe('obfuscateSecret', () => {
    it('keeps first and last 4 chars of a long secret and masks the middle', () => {
      expect(obfuscateSecret('abcdef1234567890wxyz')).toBe('abcd…wxyz')
    })

    it('fully masks short secrets', () => {
      expect(obfuscateSecret('short')).toBe('••••••••')
    })

    it('returns null for an empty value', () => {
      expect(obfuscateSecret('')).toBeNull()
      expect(obfuscateSecret('   ')).toBeNull()
    })
  })

  describe('getCredentialHints', () => {
    it('returns clientId, username, and an obfuscated api key hint — never the raw key', async () => {
      getPasswordMock.mockImplementation((_svc: string, account: string) => {
        if (account === 'prod:oauthClientId') return Promise.resolve('the-client-id')
        if (account === 'prod:username') return Promise.resolve('admin')
        if (account === 'prod:apiKey') return Promise.resolve('SECRETKEY12345678ENDS')
        return Promise.resolve(null)
      })
      const hints = await getCredentialHints('prod')
      expect(hints.clientId).toBe('the-client-id')
      expect(hints.username).toBe('admin')
      expect(hints.apiKeyHint).toBe('SECR…ENDS')
      expect(hints.apiKeyHint).not.toContain('12345678')
    })

    it('returns nulls when nothing is stored', async () => {
      getPasswordMock.mockResolvedValue(null)
      const hints = await getCredentialHints('prod')
      expect(hints).toEqual({ clientId: null, username: null, apiKeyHint: null })
    })
  })
})
