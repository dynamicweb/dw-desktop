import { describe, expect, it } from 'vitest'
import { humanizeAuthError } from './authErrors'

const env = { host: 'example.dynamicweb.dk' }

describe('humanizeAuthError', () => {
  it('translates "fetch failed" into an unreachable-host message naming the host', () => {
    const msg = humanizeAuthError('fetch failed', env)
    expect(msg).toContain('example.dynamicweb.dk')
    expect(msg.toLowerCase()).toContain("couldn't reach")
    expect(msg).not.toContain('fetch failed')
  })

  it('translates DNS/connection errors', () => {
    expect(humanizeAuthError('getaddrinfo ENOTFOUND example.dynamicweb.dk', env)).toContain(
      "Couldn't reach"
    )
    expect(humanizeAuthError('connect ECONNREFUSED 1.2.3.4:443', env)).toContain("Couldn't reach")
  })

  it('translates OAuth 401 into an authentication message without the status code', () => {
    const msg = humanizeAuthError('OAuth token request failed (401): invalid_client', env)
    expect(msg).toBe('Authentication failed. Double-check your credentials for this environment.')
  })

  it('translates a 403 into an authentication message', () => {
    expect(humanizeAuthError('Server returned 403', env)).toContain('Authentication failed')
  })

  it('translates a 404 into a "not a DynamicWeb site" hint', () => {
    expect(humanizeAuthError('Server returned 404: Not Found', env)).toContain(
      "DynamicWeb API wasn't found"
    )
  })

  it('translates 5xx into a server-error message', () => {
    expect(humanizeAuthError('Server returned 500: Internal Server Error', env)).toContain(
      'server error'
    )
  })

  it('translates timeouts', () => {
    expect(humanizeAuthError('ETIMEDOUT', env).toLowerCase()).toContain('too long')
  })

  it('translates certificate errors', () => {
    expect(humanizeAuthError('unable to verify the first certificate', env)).toContain(
      'security certificate'
    )
  })

  it('translates missing stored credentials', () => {
    expect(humanizeAuthError('No API key found for environment "prod"', env)).toContain(
      'No saved credentials'
    )
  })

  it('falls back to the original message when unrecognized', () => {
    expect(humanizeAuthError('something weird happened', env)).toBe('something weird happened')
  })

  it('handles a missing host gracefully', () => {
    expect(humanizeAuthError('fetch failed')).toContain('the host')
  })

  it('provides a generic message when given no input', () => {
    expect(humanizeAuthError(undefined)).toBe('Something went wrong while connecting.')
  })
})
