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

export async function deleteAllCredentials(envName: string): Promise<void> {
  await keytar.deletePassword(SERVICE, `${envName}:apiKey`)
  await keytar.deletePassword(SERVICE, `${envName}:oauthClientId`)
  await keytar.deletePassword(SERVICE, `${envName}:oauthClientSecret`)
}
