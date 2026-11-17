import { useState } from 'react'
import {
  authTypeLabel,
  envKind,
  envLabel,
  type StoredEnv,
  type ThemeMode
} from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'
import { useUiStore } from '../stores/uiStore'
import { Dialog } from './Dialog'
import { PencilIcon, PlusIcon, TrashIcon } from './Icons'
import { KindBadge } from './Sidebar'

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'System' },
  { value: 'dark', label: 'Dark' }
]

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
      {children}
    </section>
  )
}

export default function SettingsView({
  theme,
  onThemeChange
}: {
  theme: ThemeMode
  onThemeChange: (t: ThemeMode) => void
}): React.JSX.Element {
  const envs = useEnvStore((s) => s.envs)
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const removeEnv = useEnvStore((s) => s.removeEnv)
  const { openAddEnv, openEditEnv } = useUiStore()
  const [deleting, setDeleting] = useState<StoredEnv | null>(null)

  const sorted = [...envs].sort((a, b) => envLabel(a).localeCompare(envLabel(b)))

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '24px 32px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Settings</h1>

        <Section title="Appearance">
          <div
            role="radiogroup"
            aria-label="Theme"
            className="segmented"
            style={{ alignSelf: 'flex-start' }}
          >
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => onThemeChange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Environments">
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              overflow: 'hidden'
            }}
          >
            {sorted.length === 0 && (
              <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 14 }}>
                No environments yet. Add your first Dynamicweb site to get started.
              </p>
            )}
            {sorted.map((env, i) => (
              <div
                key={env.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 12px 12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)'
                }}
              >
                <div
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{envLabel(env)}</span>
                    <KindBadge kind={envKind(env)} />
                    {env.name === activeEnv?.name && (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Current</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{env.host}</span> ·{' '}
                    {authTypeLabel(env.authType)}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit ${envLabel(env)}`}
                  title="Edit"
                  onClick={() => openEditEnv(env)}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete ${envLabel(env)}`}
                  title="Delete"
                  onClick={() => setDeleting(env)}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={openAddEnv}
          >
            <PlusIcon />
            Add environment
          </button>
        </Section>
      </div>

      {deleting && (
        <Dialog
          title={`Delete “${envLabel(deleting)}”?`}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  void removeEnv(deleting.name)
                  setDeleting(null)
                }}
              >
                Delete environment
              </button>
            </>
          }
        >
          This removes its saved credentials, folders and saved syncs from DW Desktop. Nothing on
          the site itself is changed.
        </Dialog>
      )}
    </div>
  )
}
