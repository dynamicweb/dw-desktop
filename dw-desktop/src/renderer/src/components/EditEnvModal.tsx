import { useEffect, useRef, useState } from 'react'
import { useEnvStore } from '../stores/envStore'
import type { StoredEnv } from '../../../shared/types'

type AuthTab = 'oauth' | 'apiKey' | 'password'

interface EditEnvModalProps {
  env: StoredEnv
  onDone: () => void
}

export default function EditEnvModal({ env, onDone }: EditEnvModalProps): React.JSX.Element {
  const updateEnv = useEnvStore((s) => s.updateEnv)

  const [displayName, setDisplayName] = useState(env.displayName ?? env.name)
  const [host, setHost] = useState(`${env.protocol}://${env.host}`)
  const [localStartPath, setLocalStartPath] = useState(env.localStartPath ?? '')
  const [saving, setSaving] = useState(false)

  // Auth — secrets (API key, client secret, password) are write-only and start
  // blank; leaving them blank keeps the existing credentials. Non-secret values
  // (client id, username) are loaded back from the keychain and pre-filled, and
  // the stored API key is shown as an obfuscated hint so it can be recognized.
  const [authTab, setAuthTab] = useState<AuthTab>(env.authType)
  const [apiKey, setApiKey] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiKeyHint, setApiKeyHint] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    connected: boolean
    version?: string
    error?: string
  } | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDone()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onDone])

  // Load the non-secret credential hints for this environment so client id /
  // username can be shown and the API key can be previewed.
  useEffect(() => {
    let cancelled = false
    void window.dw.auth.getHints(env.name).then((result) => {
      if (cancelled || !result.ok || !result.data) return
      if (result.data.clientId) setClientId(result.data.clientId)
      if (result.data.username) setUsername(result.data.username)
      setApiKeyHint(result.data.apiKeyHint)
    })
    return () => {
      cancelled = true
    }
  }, [env.name])

  function detectProtocol(raw: string): 'http' | 'https' {
    if (raw.startsWith('http://')) return 'http'
    return 'https'
  }

  function cleanHost(raw: string): string {
    const withoutProtocol = raw.replace(/^https?:\/\//, '')
    return withoutProtocol.split('/')[0].trim()
  }

  function hostIsValid(raw: string): boolean {
    return cleanHost(raw).length > 0
  }

  const authTypeChanged = authTab !== env.authType

  /**
   * Whether the user has supplied a new secret for the current auth tab. Client id
   * and username are pre-filled and not secrets, so they don't count on their own —
   * persisting credentials always requires the matching secret (API key, client
   * secret, or password) to be (re-)entered.
   */
  function hasNewSecret(): boolean {
    if (authTab === 'apiKey') return apiKey.trim().length > 0
    if (authTab === 'oauth') return clientSecret.trim().length > 0
    return password.trim().length > 0
  }

  function buildEnv(): StoredEnv {
    const trimmedStart = localStartPath.trim()
    const trimmedDisplay = displayName.trim()
    return {
      ...env,
      host: cleanHost(host),
      protocol: detectProtocol(host),
      authType: authTab,
      displayName: trimmedDisplay && trimmedDisplay !== env.name ? trimmedDisplay : undefined,
      localStartPath: trimmedStart || undefined
    }
  }

  function buildCredentials(): unknown {
    if (authTab === 'apiKey') return { authType: 'apiKey', apiKey }
    if (authTab === 'oauth') return { authType: 'oauth', clientId, clientSecret }
    return { authType: 'password', username, password }
  }

  const pickingRef = useRef(false)
  async function pickLocalStartPath(): Promise<void> {
    if (pickingRef.current) return
    pickingRef.current = true
    try {
      const result = await window.dw.fs.openDialog(['openDirectory'])
      if (result.ok && result.data && result.data.paths.length > 0) {
        setLocalStartPath(result.data.paths[0])
      }
    } finally {
      pickingRef.current = false
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    const result = await window.dw.auth.test(buildEnv(), buildCredentials())
    setTestResult(result.data ?? { connected: false, error: result.error })
    setTesting(false)
  }

  async function handleSave(): Promise<void> {
    // New credentials must be entered when switching auth type (we can't reuse the old ones).
    if (authTypeChanged && !hasNewSecret()) {
      setAuthError('Enter credentials for the new authentication type before saving.')
      return
    }
    // OAuth needs both parts together — a client secret without a client id can't be saved.
    if (authTab === 'oauth' && hasNewSecret() && clientId.trim().length === 0) {
      setAuthError('Enter the client id to go with the client secret.')
      return
    }
    setAuthError(null)
    setSaving(true)
    const updated = buildEnv()
    await updateEnv(updated)
    if (hasNewSecret()) {
      if (authTab === 'password') {
        // Password auth has no secret to store directly — exchange the credentials
        // for an API key (or fall back to storing the password) via loginPassword.
        const result = await window.dw.auth.loginPassword(updated, username, password)
        if (!result.ok) {
          setAuthError(result.error ?? 'Could not sign in with those credentials.')
          setSaving(false)
          return
        }
      } else {
        await window.dw.auth.saveCredentials(updated.name, buildCredentials())
      }
    }
    setSaving(false)
    onDone()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--r-sm)',
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text)',
    transition: 'border-color 120ms ease'
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 4
  }

  const btnPrimary: React.CSSProperties = {
    padding: '8px 16px',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    border: 'none',
    borderRadius: 'var(--r-sm)',
    cursor: 'pointer',
    transition: 'background 120ms ease'
  }

  const btnSecondary: React.CSSProperties = {
    padding: '8px 16px',
    background: 'var(--surface-raised)',
    color: 'var(--text-muted)',
    fontSize: 12,
    border: 'none',
    borderRadius: 'var(--r-sm)',
    cursor: 'pointer',
    transition: 'background 120ms ease'
  }

  const hintStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-subtle)',
    marginTop: 6
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 440,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 32
        }}
      >
        <button
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={onDone}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            color: 'var(--text-subtle)',
            cursor: 'pointer',
            transition: 'background 80ms ease-out, color 80ms ease-out'
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'var(--surface-hover)'
            el.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'transparent'
            el.style.color = 'var(--text-subtle)'
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M3 3L13 13M13 3L3 13" />
          </svg>
        </button>
        <h2
          style={{
            fontSize: 22,
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontWeight: 400,
            color: 'var(--text)',
            marginBottom: 24
          }}
        >
          Edit environment
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Display name</label>
            <input
              style={inputStyle}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p style={hintStyle}>
              Shown in the sidebar and pane header. Internal id:{' '}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {env.name}
              </span>
            </p>
          </div>
          <div>
            <label style={labelStyle}>Host</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={inputStyle}
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  padding: '4px 8px',
                  color: 'var(--text-muted)',
                  flexShrink: 0
                }}
              >
                {detectProtocol(host).toUpperCase()}
              </span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Local start folder (optional)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={inputStyle}
                type="text"
                placeholder={
                  window.dw.platform === 'win32'
                    ? 'e.g. C:\\projects\\my-site'
                    : 'e.g. ~/projects/my-site'
                }
                value={localStartPath}
                onChange={(e) => setLocalStartPath(e.target.value)}
              />
              <button
                type="button"
                style={{ ...btnSecondary, flexShrink: 0 }}
                onClick={() => void pickLocalStartPath()}
              >
                Browse…
              </button>
            </div>
            <p style={hintStyle}>Leave empty to open your home folder.</p>
          </div>

          {/* Authentication */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <label style={labelStyle}>Authentication</label>
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginBottom: 12,
                background: 'var(--surface-raised)',
                borderRadius: 'var(--r-sm)',
                padding: 4
              }}
            >
              {(['oauth', 'apiKey', 'password'] as AuthTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setAuthTab(tab)
                    setTestResult(null)
                    setAuthError(null)
                  }}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: '5px 0',
                    borderRadius: 'var(--r-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 120ms ease, color 120ms ease',
                    background: authTab === tab ? 'var(--surface-hover)' : 'transparent',
                    color: authTab === tab ? 'var(--text)' : 'var(--text-subtle)'
                  }}
                >
                  {tab === 'oauth' ? 'OAuth' : tab === 'apiKey' ? 'API key' : 'Username'}
                </button>
              ))}
            </div>

            {authTab === 'oauth' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Client ID</label>
                  <input
                    style={inputStyle}
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Client secret</label>
                  <input
                    style={inputStyle}
                    type="password"
                    placeholder={authTypeChanged ? '' : '•••••••• (unchanged)'}
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>
              </div>
            )}

            {authTab === 'apiKey' && (
              <div>
                <label style={labelStyle}>API key</label>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder={authTypeChanged ? '' : '•••••••• (unchanged)'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {!authTypeChanged && apiKeyHint && (
                  <p style={hintStyle}>
                    Current key:{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {apiKeyHint}
                    </span>
                  </p>
                )}
              </div>
            )}

            {authTab === 'password' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Username</label>
                  <input
                    style={inputStyle}
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input
                    style={inputStyle}
                    type="password"
                    placeholder={authTypeChanged ? '' : '•••••••• (unchanged)'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            <p style={hintStyle}>
              {authTypeChanged
                ? 'Enter credentials for the new authentication type.'
                : authTab === 'apiKey'
                  ? 'Leave the API key blank to keep the current one, or enter a new key to replace it.'
                  : authTab === 'oauth'
                    ? 'Leave the client secret blank to keep the current credentials, or enter a new secret to replace them.'
                    : 'Leave the password blank to keep the current credentials, or enter a new password to replace them.'}
            </p>

            {hasNewSecret() && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <button
                  style={{ ...btnSecondary, opacity: testing ? 0.6 : 1 }}
                  type="button"
                  disabled={testing}
                  onClick={() => void handleTest()}
                >
                  {testing ? 'Testing…' : 'Test connection'}
                </button>
                {testResult && (
                  <span
                    style={{
                      fontSize: 12,
                      color: testResult.connected ? 'var(--success)' : 'var(--danger)'
                    }}
                  >
                    {testResult.connected
                      ? testResult.version
                        ? `✓ DynamicWeb ${testResult.version}`
                        : '✓ Connected'
                      : (testResult.error ?? 'Connection failed')}
                  </span>
                )}
              </div>
            )}

            {authError && (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)' }}>{authError}</p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button style={btnSecondary} type="button" onClick={onDone}>
            Cancel
          </button>
          <button
            style={{ ...btnPrimary, opacity: !hostIsValid(host) || saving ? 0.5 : 1 }}
            type="button"
            disabled={!hostIsValid(host) || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
