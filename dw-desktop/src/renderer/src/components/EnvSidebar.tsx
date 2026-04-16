import type { StoredEnv } from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'

interface EnvSidebarProps {
  onAddEnv: () => void
}

function StatusDot({ connected }: { connected: boolean }): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        flexShrink: 0,
        background: connected ? 'var(--success)' : 'var(--text-subtle)'
      }}
    />
  )
}

function EnvRow({
  env,
  isActive,
  onClick
}: {
  env: StoredEnv
  isActive: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: isActive ? '6px 12px 6px 10px' : '6px 12px',
        background: isActive ? 'rgba(208, 112, 48, 0.08)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'background 80ms ease-out'
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <StatusDot connected={isActive} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3
          }}
        >
          {env.name}
        </div>
        <div
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-subtle)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3
          }}
        >
          {env.host}
        </div>
      </div>
    </button>
  )
}

export default function EnvSidebar({ onAddEnv }: EnvSidebarProps): React.JSX.Element {
  const envs = useEnvStore((s) => s.envs)
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const setActiveEnv = useEnvStore((s) => s.setActiveEnv)

  return (
    <aside
      style={{
        width: 180,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <div style={{ padding: '12px 12px 4px' }}>
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-subtle)'
          }}
        >
          Environments
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {envs.length === 0 ? (
          <p
            style={{
              padding: '12px',
              fontSize: 11,
              color: 'var(--text-subtle)',
              lineHeight: 1.5
            }}
          >
            No environments yet. Add your first DynamicWeb solution to get started.
          </p>
        ) : (
          envs.map((env) => (
            <EnvRow
              env={env}
              isActive={activeEnv?.name === env.name}
              key={env.name}
              onClick={() => void setActiveEnv(env.name)}
            />
          ))
        )}
      </div>

      <div
        style={{
          padding: '8px',
          borderTop: '1px solid var(--border)'
        }}
      >
        <button
          type="button"
          onClick={onAddEnv}
          style={{
            width: '100%',
            textAlign: 'left',
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'none',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--r-sm)',
            padding: '4px 8px',
            cursor: 'pointer',
            transition: 'border-color 80ms ease-out, color 80ms ease-out'
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = 'var(--text-muted)'
            el.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = 'var(--border-strong)'
            el.style.color = 'var(--text-muted)'
          }}
        >
          + Add environment
        </button>
      </div>

      {activeEnv && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot connected={true} />
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {activeEnv.name}
            </span>
          </div>
        </div>
      )}
    </aside>
  )
}
