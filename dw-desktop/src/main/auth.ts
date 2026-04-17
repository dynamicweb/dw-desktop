import { getApiKey, getOAuthCredentials } from './credentials'
import type { ConnectionStatus, StoredEnv } from '../shared/types'

interface OAuthCacheEntry {
  token: string
  expiresAt: number
}

const oauthCache = new Map<string, OAuthCacheEntry>()

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

    const response = await fetch(`${env.protocol}://${env.host}/Admin/OAuth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret
      })
    })

    if (!response.ok) {
      throw new Error(`OAuth token request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as Record<string, unknown>
    const token = String(payload['token'] ?? payload['Token'] ?? '')
    const expiresIn = Number(payload['expires'] ?? payload['Expires'] ?? 3600)

    if (!token) throw new Error('OAuth response did not contain a token')

    oauthCache.set(env.name, { token, expiresAt: Date.now() + expiresIn * 1000 })
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
      // A successful token fetch is proof of connection — no second request needed
      const tokenResponse = await fetch(`${base}/Admin/OAuth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret
        })
      })
      if (!tokenResponse.ok) {
        const body = await tokenResponse.text().catch(() => '')
        return {
          connected: false,
          error: `OAuth token request failed (${tokenResponse.status})${body ? ': ' + body.slice(0, 200) : ''}`
        }
      }
      const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>
      const token = String(tokenPayload['token'] ?? tokenPayload['Token'] ?? '')
      if (!token) return { connected: false, error: 'OAuth response did not contain a token' }
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
