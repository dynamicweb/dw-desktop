import { useEffect, useState } from 'react'
import { useEnvStore } from '../stores/envStore'
import type { StoredEnv } from '../../../shared/types'

type AuthTab = 'oauth' | 'apiKey' | 'password'

interface Step1Data {
  name: string
  host: string
  localStartPath: string
}

interface Step2Data {
  authTab: AuthTab
  apiKey: string
  clientId: string
  clientSecret: string
  username: string
  password: string
}

interface AddEnvModalProps {
  onDone: () => void
}

function StepDots({ current }: { current: number }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
      {[1, 2, 3].map((step) => (
        <div
          key={step}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            transition: 'background 150ms ease',
            background:
              step === current
                ? 'var(--accent)'
                : step < current
                ? 'var(--text-muted)'
                : 'var(--border-strong)'
          }}
        />
      ))}
    </div>
  )
}

export default function AddEnvModal({ onDone }: AddEnvModalProps): React.JSX.Element {
  const addEnv = useEnvStore((s) => s.addEnv)
  const setActiveEnv = useEnvStore((s) => s.setActiveEnv)

  const [step, setStep] = useState(1)
  const [step1, setStep1] = useState<Step1Data>({ name: '', host: '', localStartPath: '' })
  const [step2, setStep2] = useState<Step2Data>({
    authTab: 'oauth',
    apiKey: '',
    clientId: '',
    clientSecret: '',
    username: '',
    password: ''
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; version?: string; error?: string } | null>(null)

  useEffect(() => {
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDone()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onDone])

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

  function buildEnv(): StoredEnv {
    const trimmedStart = step1.localStartPath.trim()
    return {
      name: step1.name,
      host: cleanHost(step1.host),
      protocol: detectProtocol(step1.host),
      authType: step2.authTab === 'password' ? 'password' : step2.authTab,
      ...(trimmedStart ? { localStartPath: trimmedStart } : {})
    }
  }

  async function pickLocalStartPath(): Promise<void> {
    const result = await window.dw.fs.openDialog(['openDirectory'])
    if (result.ok && result.data && result.data.paths.length > 0) {
      setStep1((s) => ({ ...s, localStartPath: result.data!.paths[0] }))
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    const env = buildEnv()
    let credentials: unknown
    if (step2.authTab === 'apiKey') {
      credentials = { authType: 'apiKey', apiKey: step2.apiKey }
    } else if (step2.authTab === 'oauth') {
      credentials = { authType: 'oauth', clientId: step2.clientId, clientSecret: step2.clientSecret }
    } else {
      credentials = { authType: 'password', username: step2.username, password: step2.password }
    }
    const result = await window.dw.auth.test(env, credentials)
    setTestResult(result.data ?? { connected: false, error: result.error })
    setTesting(false)
    if (result.data?.connected) setStep(3)
  }

  async function handleSave(): Promise<void> {
    const env = buildEnv()
    await addEnv(env)
    let credentials: unknown
    if (step2.authTab === 'apiKey') {
      credentials = { authType: 'apiKey', apiKey: step2.apiKey }
    } else if (step2.authTab === 'oauth') {
      credentials = { authType: 'oauth', clientId: step2.clientId, clientSecret: step2.clientSecret }
    } else {
      credentials = { authType: 'password', username: step2.username, password: step2.password }
    }
    await window.dw.auth.saveCredentials(env.name, credentials)
    await setActiveEnv(env.name)
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
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3L13 13M13 3L3 13" />
          </svg>
        </button>
        <StepDots current={step} />

        {step === 1 && (
          <>
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
              Add environment
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  autoFocus
                  style={inputStyle}
                  type="text"
                  placeholder="production"
                  value={step1.name}
                  onChange={(e) => setStep1((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Host</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="https://yoursite.dynamicweb.dk"
                    value={step1.host}
                    onChange={(e) => setStep1((s) => ({ ...s, host: e.target.value }))}
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
                    {detectProtocol(step1.host).toUpperCase()}
                  </span>
                </div>
                {step1.host && (
                  <p style={hintStyle}>
                    Will connect to:{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {detectProtocol(step1.host)}://{cleanHost(step1.host)}
                    </span>
                  </p>
                )}
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
                    value={step1.localStartPath}
                    onChange={(e) => setStep1((s) => ({ ...s, localStartPath: e.target.value }))}
                  />
                  <button
                    type="button"
                    style={{ ...btnSecondary, flexShrink: 0 }}
                    onClick={() => void pickLocalStartPath()}
                  >
                    Browse…
                  </button>
                </div>
                <p style={hintStyle}>
                  Leave empty to open your home folder. The app remembers where you last
                  navigated per environment.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                style={{ ...btnPrimary, opacity: (!step1.name || !hostIsValid(step1.host)) ? 0.5 : 1 }}
                disabled={!step1.name || !hostIsValid(step1.host)}
                type="button"
                onClick={() => setStep(2)}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2
              style={{
                fontSize: 22,
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontWeight: 400,
                color: 'var(--text)',
                marginBottom: 16
              }}
            >
              Authentication
            </h2>
            {/* Auth tab switcher */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginBottom: 24,
                background: 'var(--surface-raised)',
                borderRadius: 'var(--r-sm)',
                padding: 4
              }}
            >
              {(['oauth', 'apiKey', 'password'] as AuthTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStep2((s) => ({ ...s, authTab: tab }))}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: '5px 0',
                    borderRadius: 'var(--r-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 120ms ease, color 120ms ease',
                    background: step2.authTab === tab ? 'var(--surface-hover)' : 'transparent',
                    color: step2.authTab === tab ? 'var(--text)' : 'var(--text-subtle)'
                  }}
                >
                  {tab === 'oauth' ? 'OAuth (recommended)' : tab === 'apiKey' ? 'API key' : 'Username & password'}
                </button>
              ))}
            </div>

            {step2.authTab === 'oauth' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Client ID</label>
                  <input style={inputStyle} type="text" value={step2.clientId} onChange={(e) => setStep2((s) => ({ ...s, clientId: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Client secret</label>
                  <input style={inputStyle} type="password" value={step2.clientSecret} onChange={(e) => setStep2((s) => ({ ...s, clientSecret: e.target.value }))} />
                </div>
                <p style={hintStyle}>
                  Create an OAuth client in your DW backend under Settings → OAuth Clients. Set grant type to Client credentials.
                </p>
              </div>
            )}

            {step2.authTab === 'apiKey' && (
              <div>
                <label style={labelStyle}>API key</label>
                <input style={inputStyle} type="password" value={step2.apiKey} onChange={(e) => setStep2((s) => ({ ...s, apiKey: e.target.value }))} />
                <p style={hintStyle}>Generate a key in your DW backend under Settings → API Keys.</p>
              </div>
            )}

            {step2.authTab === 'password' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Username</label>
                  <input style={inputStyle} type="text" value={step2.username} onChange={(e) => setStep2((s) => ({ ...s, username: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input style={inputStyle} type="password" value={step2.password} onChange={(e) => setStep2((s) => ({ ...s, password: e.target.value }))} />
                </div>
                <p style={hintStyle}>We'll exchange your credentials for an API key and store that instead.</p>
              </div>
            )}

            {testResult && !testResult.connected && (
              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--danger)' }}>
                {testResult.error ?? 'Connection failed'}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
              <button style={btnSecondary} type="button" onClick={() => setStep(1)}>← Back</button>
              <button
                style={{ ...btnPrimary, opacity: testing ? 0.6 : 1 }}
                type="button"
                disabled={testing}
                onClick={() => void handleTest()}
              >
                {testing ? 'Testing…' : 'Test connection →'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                marginBottom: 24
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12, color: 'var(--success)' }}>✓</div>
              <h2
                style={{
                  fontSize: 22,
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  color: 'var(--text)',
                  marginBottom: 6
                }}
              >
                Connected
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {testResult?.version ? `DynamicWeb ${testResult.version}` : 'Connection successful'}
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={btnSecondary} type="button" onClick={() => setStep(2)}>← Back</button>
              <button style={btnPrimary} type="button" onClick={() => void handleSave()}>Save & open →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
