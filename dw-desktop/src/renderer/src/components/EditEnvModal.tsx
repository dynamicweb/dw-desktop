import { useEffect, useRef, useState } from 'react'
import { useEnvStore } from '../stores/envStore'
import type { StoredEnv } from '../../../shared/types'

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

  async function handleSave(): Promise<void> {
    setSaving(true)
    const trimmedStart = localStartPath.trim()
    const trimmedDisplay = displayName.trim()
    const updated: StoredEnv = {
      ...env,
      host: cleanHost(host),
      protocol: detectProtocol(host),
      displayName: trimmedDisplay && trimmedDisplay !== env.name ? trimmedDisplay : undefined,
      localStartPath: trimmedStart || undefined
    }
    await updateEnv(updated)
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
