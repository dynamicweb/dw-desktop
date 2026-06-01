import keytar from 'keytar'

const SERVICE = 'dw-desktop'

export async function saveApiKey(envName: string, apiKey: string): Promise<void> {
  await keytar.setPassword(SERVICE, `${envName}:apiKey`, apiKey)
}

export async function getApiKey(envName: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, `${envName}:apiKey`)
}

export async function saveOAuthCredentials(
  envName: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  await keytar.setPassword(SERVICE, `${envName}:oauthClientId`, clientId)
  await keytar.setPassword(SERVICE, `${envName}:oauthClientSecret`, clientSecret)
}

export async function getOAuthCredentials(
  envName: string
): Promise<{ clientId: string; clientSecret: string } | null> {
  const clientId = await keytar.getPassword(SERVICE, `${envName}:oauthClientId`)
  const clientSecret = await keytar.getPassword(SERVICE, `${envName}:oauthClientSecret`)
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export async function saveUsername(envName: string, username: string): Promise<void> {
  await keytar.setPassword(SERVICE, `${envName}:username`, username)
}

export async function getUsername(envName: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, `${envName}:username`)
}

/**
 * Obfuscates a secret for display so it can be recognized without being readable:
 * keeps a few leading/trailing characters and masks the middle. Returns null for
 * values too short to partially reveal safely.
 */
export function obfuscateSecret(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length < 8) return trimmed.length > 0 ? '••••••••' : null
  const head = trimmed.slice(0, 4)
  const tail = trimmed.slice(-4)
  return `${head}…${tail}`
}

/**
 * Returns only the non-secret parts of an environment's stored credentials,
 * safe to display in the UI: the OAuth client id, the saved username, and an
 * obfuscated hint of the API key (never the key itself).
 */
export async function getCredentialHints(envName: string): Promise<{
  clientId: string | null
  username: string | null
  apiKeyHint: string | null
}> {
  const [clientId, username, apiKey] = await Promise.all([
    keytar.getPassword(SERVICE, `${envName}:oauthClientId`),
    keytar.getPassword(SERVICE, `${envName}:username`),
    keytar.getPassword(SERVICE, `${envName}:apiKey`)
  ])
  return {
    clientId: clientId ?? null,
    username: username ?? null,
    apiKeyHint: apiKey ? obfuscateSecret(apiKey) : null
  }
}

export async function deleteAllCredentials(envName: string): Promise<void> {
  await keytar.deletePassword(SERVICE, `${envName}:apiKey`)
  await keytar.deletePassword(SERVICE, `${envName}:oauthClientId`)
  await keytar.deletePassword(SERVICE, `${envName}:oauthClientSecret`)
  await keytar.deletePassword(SERVICE, `${envName}:username`)
}
