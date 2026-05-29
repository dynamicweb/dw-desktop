import { getApiKey, getOAuthCredentials } from './credentials'
import { debugRequest, debugResponse } from './debug'
import type { ConnectionStatus, StoredEnv } from '../shared/types'

interface OAuthCacheEntry {
  token: string
  expiresAt: number
}

const oauthCache = new Map<string, OAuthCacheEntry>()

// Replace token-bearing fields in a JSON body with a redacted marker so the
// Debug panel never surfaces a live access token.
function redactTokenBody(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>
    for (const key of ['token', 'Token', 'access_token']) {
      if (parsed[key] !== undefined) parsed[key] = '***redacted***'
    }
    return JSON.stringify(parsed, null, 2)
  } catch {
    return bodyText
  }
}

export async function resolveAuthHeader(env: StoredEnv): Promise<string> {
  if (env.authType === 'apiKey' || env.authType === 'password') {
    const key = await getApiKey(env.name)
    if (!key) throw new Error(`No API key found for environment "${env.name}"`)
    return `Bearer ${key}`
  }

  if (env.authType === 'oauth') {
    const cached = oauthCache.get(env.name)
    if (cached && cached.expiresAt - Date.now() > 60_000) {
      return `Bearer ${cached.token}`
    }

    const creds = await getOAuthCredentials(env.name)
    if (!creds) throw new Error(`No OAuth credentials found for environment "${env.name}"`)

    const clientId = creds.clientId.trim()
    const clientSecret = creds.clientSecret.trim()
    const tokenUrl = `${env.protocol}://${env.host}/Admin/OAuth/token`
    const body = { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }

    const dbEntry = debugRequest(
      'POST',
      tokenUrl,
      JSON.stringify({ ...body, client_secret: '***redacted***' }, null, 2)
    )
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const bodyText = await response.text()
    const debugBody = response.ok ? redactTokenBody(bodyText) : bodyText
    debugResponse(dbEntry, response.status, debugBody.slice(0, 1000))

    if (!response.ok) {
      throw new Error(`OAuth token request failed (${response.status}): ${bodyText.slice(0, 300)}`)
    }

    let payload: Record<string, unknown>
    try { payload = JSON.parse(bodyText) as Record<string, unknown> } catch {
      throw new Error(`OAuth response was not JSON: ${bodyText.slice(0, 200)}`)
    }
    const token = String(payload['token'] ?? payload['Token'] ?? payload['access_token'] ?? '')
    if (!token) throw new Error(`OAuth response did not contain a token: ${bodyText.slice(0, 200)}`)

    const expiresRaw = payload['expires'] ?? payload['Expires'] ?? payload['expires_in']
    let expiresAt: number
    if (typeof expiresRaw === 'string') {
      const parsed = Date.parse(expiresRaw)
      expiresAt = Number.isFinite(parsed) ? parsed : Date.now() + 5 * 60 * 1000
    } else if (typeof expiresRaw === 'number') {
      expiresAt = Date.now() + expiresRaw * 1000
    } else {
      expiresAt = Date.now() + 5 * 60 * 1000
    }

    oauthCache.set(env.name, { token, expiresAt })
    return `Bearer ${token}`
  }

  throw new Error(`Unknown authType "${env.authType}"`)
}

export type TestCredentials =
  | { authType: 'apiKey'; apiKey: string }
  | { authType: 'oauth'; clientId: string; clientSecret: string }
  | { authType: 'password'; username: string; password: string }

export async function testConnection(
  env: StoredEnv,
  credentials: TestCredentials
): Promise<ConnectionStatus> {
  try {
    const base = `${env.protocol}://${env.host}`

    if (credentials.authType === 'apiKey') {
      // Use DirectoryAll — a real endpoint the CLI uses to verify auth
      const response = await fetch(
        `${base}/Admin/Api/DirectoryAll?DirectoryPath=/&recursive=false&includeFiles=false`,
        { headers: { Authorization: `Bearer ${credentials.apiKey}` } }
      )
      if (!response.ok) {
        return { connected: false, error: `Server returned ${response.status}` }
      }
      return { connected: true }
    }

    if (credentials.authType === 'oauth') {
      const clientId = credentials.clientId.trim()
      const clientSecret = credentials.clientSecret.trim()
      const tokenUrl = `${base}/Admin/OAuth/token`
      const body = { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }

      const dbEntry = debugRequest(
        'POST',
        tokenUrl,
        JSON.stringify({ ...body, client_secret: '***redacted***' }, null, 2)
      )
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const bodyText = await tokenResponse.text().catch(() => '')
      const debugBody = tokenResponse.ok ? redactTokenBody(bodyText) : bodyText
      debugResponse(dbEntry, tokenResponse.status, debugBody.slice(0, 1000))

      if (!tokenResponse.ok) {
        return {
          connected: false,
          error: `OAuth token request failed (${tokenResponse.status})${bodyText ? ': ' + bodyText.slice(0, 300) : ''}`
        }
      }
      let tokenPayload: Record<string, unknown>
      try { tokenPayload = JSON.parse(bodyText) as Record<string, unknown> } catch {
        return { connected: false, error: `OAuth response was not JSON: ${bodyText.slice(0, 200)}` }
      }
      const token = String(tokenPayload['token'] ?? tokenPayload['Token'] ?? tokenPayload['access_token'] ?? '')
      if (!token) return { connected: false, error: `OAuth response did not contain a token: ${bodyText.slice(0, 200)}` }
      return { connected: true }
    }

    if (credentials.authType === 'password') {
      const loginResponse = await fetch(`${base}/Admin/Authentication/Login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `Username=${encodeURIComponent(credentials.username)}&Password=${encodeURIComponent(credentials.password)}`,
        redirect: 'follow'
      })
      if (!loginResponse.ok) {
        return { connected: false, error: `Login failed with status ${loginResponse.status}` }
      }
      // Verify the session can reach the API
      const verifyResponse = await fetch(
        `${base}/Admin/Api/DirectoryAll?DirectoryPath=/&recursive=false&includeFiles=false`,
        { headers: { Cookie: loginResponse.headers.get('set-cookie') ?? '' } }
      )
      if (!verifyResponse.ok) {
        return { connected: false, error: `Authenticated but API returned ${verifyResponse.status}` }
      }
      return { connected: true }
    }

    return { connected: false, error: 'Unknown auth type' }
  } catch (err) {
    return { connected: false, error: (err as Error).message }
  }
}
