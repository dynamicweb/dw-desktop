import { getApiKey, getOAuthCredentials } from './credentials'
import { debugRequest, debugResponse } from './debug'
import {
  FILE_TRANSFER_UNSUPPORTED,
  ROOT_FORBIDDEN_NOTICE,
  humanizeAuthError
} from '../shared/authErrors'
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
    const body = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    }

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
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      throw new Error(`OAuth response was not JSON: ${bodyText.slice(0, 200)}`)
    }
    const token = String(payload['token'] ?? payload['Token'] ?? payload['access_token'] ?? '')
    if (!token) throw new Error(`OAuth response did not contain a token: ${bodyText.slice(0, 200)}`)

    // Try each candidate field in priority order; fall through if a value is
    // present but unparseable so a valid `expires_in` isn't shadowed by a
    // malformed `expires`.
    function parseExpiry(value: unknown): number | null {
      if (typeof value === 'string') {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Date.now() + value * 1000
      }
      return null
    }
    const expiresAt =
      parseExpiry(payload['expires']) ??
      parseExpiry(payload['Expires']) ??
      parseExpiry(payload['expires_in']) ??
      Date.now() + 5 * 60 * 1000

    oauthCache.set(env.name, { token, expiresAt })
    return `Bearer ${token}`
  }

  throw new Error(`Unknown authType "${env.authType}"`)
}

// The app talks only to the File Transfer API, so the connection test probes it
// directly: `entries/exists` on the files root is cheap and needs the same auth.
function fileTransferProbeUrl(base: string): string {
  return `${base}/Admin/Api/FileTransfer/entries/exists?path=`
}

async function probeResult(
  response: Response,
  env: StoredEnv,
  prefix: string
): Promise<ConnectionStatus> {
  if (response.ok) return { connected: true }
  // A 404 from the probe means the route is missing: the site's Dynamicweb version
  // predates the File Transfer API.
  if (response.status === 404) return { connected: false, error: FILE_TRANSFER_UNSUPPORTED }
  // 403 means the credentials were accepted but folder permissions don't include the
  // root (e.g. a client limited to /Files/Images). That is still a working login.
  if (response.status === 403) return { connected: true, notice: ROOT_FORBIDDEN_NOTICE }
  return { connected: false, error: humanizeAuthError(`${prefix} ${response.status}`, env) }
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
      const response = await fetch(fileTransferProbeUrl(base), {
        headers: { Authorization: `Bearer ${credentials.apiKey}` }
      })
      return probeResult(response, env, 'Server returned')
    }

    if (credentials.authType === 'oauth') {
      const clientId = credentials.clientId.trim()
      const clientSecret = credentials.clientSecret.trim()
      const tokenUrl = `${base}/Admin/OAuth/token`
      const body = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }

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
          error: humanizeAuthError(
            `OAuth token request failed (${tokenResponse.status})${bodyText ? ': ' + bodyText.slice(0, 300) : ''}`,
            env
          )
        }
      }
      let tokenPayload: Record<string, unknown>
      try {
        tokenPayload = JSON.parse(bodyText) as Record<string, unknown>
      } catch {
        return { connected: false, error: humanizeAuthError('OAuth response was not JSON', env) }
      }
      const token = String(
        tokenPayload['token'] ?? tokenPayload['Token'] ?? tokenPayload['access_token'] ?? ''
      )
      if (!token)
        return {
          connected: false,
          error: humanizeAuthError('OAuth response did not contain a token', env)
        }
      const probeResponse = await fetch(fileTransferProbeUrl(base), {
        headers: { Authorization: `Bearer ${token}` }
      })
      return probeResult(probeResponse, env, 'Authenticated but API returned')
    }

    if (credentials.authType === 'password') {
      const loginResponse = await fetch(`${base}/Admin/Authentication/Login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `Username=${encodeURIComponent(credentials.username)}&Password=${encodeURIComponent(credentials.password)}`,
        redirect: 'follow'
      })
      if (!loginResponse.ok) {
        return {
          connected: false,
          error: humanizeAuthError(`Login failed with status ${loginResponse.status}`, env)
        }
      }
      // Verify the session can reach the File Transfer API
      const verifyResponse = await fetch(fileTransferProbeUrl(base), {
        headers: { Cookie: loginResponse.headers.get('set-cookie') ?? '' }
      })
      return probeResult(verifyResponse, env, 'Authenticated but API returned')
    }

    return { connected: false, error: 'Unknown auth type' }
  } catch (err) {
    return { connected: false, error: humanizeAuthError((err as Error).message, env) }
  }
}
