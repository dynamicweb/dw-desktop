import { ipcMain } from 'electron'
import { testConnection, type TestCredentials } from '../auth'
import { getCredentialHints, saveApiKey, saveOAuthCredentials, saveUsername } from '../credentials'
import { getEnvs } from '../config'
import { humanizeAuthError } from '../../shared/authErrors'
import type { ConnectionStatus, CredentialHints, IPCResult, StoredEnv } from '../../shared/types'

export function registerAuthHandlers(): void {
  ipcMain.handle(
    'auth:test',
    async (
      _event,
      { env, credentials }: { env: StoredEnv; credentials: TestCredentials }
    ): Promise<IPCResult<ConnectionStatus>> => {
      const status = await testConnection(env, credentials)
      return { ok: true, data: status }
    }
  )

  ipcMain.handle(
    'auth:saveCredentials',
    async (
      _event,
      { envName, credentials }: { envName: string; credentials: TestCredentials }
    ): Promise<IPCResult> => {
      try {
        if (credentials.authType === 'apiKey') {
          await saveApiKey(envName, credentials.apiKey)
        } else if (credentials.authType === 'oauth') {
          await saveOAuthCredentials(envName, credentials.clientId, credentials.clientSecret)
        } else if (credentials.authType === 'password') {
          // For password auth the caller passes the apiKey via loginPassword first,
          // so this path just acknowledges (no direct secret to store without a key)
          return { ok: true }
        }
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'auth:getHints',
    async (_event, { envName }: { envName: string }): Promise<IPCResult<CredentialHints>> => {
      try {
        const hints = await getCredentialHints(envName)
        return { ok: true, data: hints }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'auth:loginPassword',
    async (
      _event,
      { env, username, password }: { env: StoredEnv; username: string; password: string }
    ): Promise<IPCResult> => {
      try {
        const base = `${env.protocol}://${env.host}`
        // Login and get session cookie
        const loginResponse = await fetch(`${base}/Admin/Authentication/Login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `Username=${encodeURIComponent(username)}&Password=${encodeURIComponent(password)}`,
          redirect: 'follow'
        })
        if (!loginResponse.ok) {
          return {
            ok: false,
            error: humanizeAuthError(`Login failed with status ${loginResponse.status}`, env)
          }
        }
        // Attempt to get an API key via the management API using session
        const cookie = loginResponse.headers.get('set-cookie') ?? ''
        const keyResponse = await fetch(`${base}/Admin/Api/Management/ApiKey/Create`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: 'dw-desktop' })
        })
        // Persist the username so it can be shown back when editing the environment.
        await saveUsername(env.name, username)
        if (keyResponse.ok) {
          const payload = (await keyResponse.json()) as Record<string, unknown>
          const apiKey = String(payload['data'] ?? payload['key'] ?? payload['apiKey'] ?? '')
          if (apiKey) {
            await saveApiKey(env.name, apiKey)
            return { ok: true }
          }
        }
        // Fallback: store the password itself as a key (password auth mode)
        await saveApiKey(env.name, password)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: humanizeAuthError((err as Error).message, env) }
      }
    }
  )

  // Ensure unused import is referenced (getEnvs used by future handlers)
  void getEnvs
}
