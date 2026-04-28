import type { CompareMode, DiffStatus } from '../../../shared/types'
import { countByStatus } from '../utils/compareEntries'

interface CompareToolbarProps {
  mode: CompareMode
  onModeChange: (mode: CompareMode) => void
  diffMap: Map<string, DiffStatus>
  highlightedStatuses: DiffStatus[]
  onToggleStatus: (status: DiffStatus) => void
}

const MODES: { value: CompareMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' }
]

const STATUSES: DiffStatus[] = ['different', 'remote-only', 'local-only', 'identical']

const PILL_COLOR: Record<DiffStatus, string> = {
  different: 'var(--danger)',
  'remote-only': 'var(--accent-cool)',
  'local-only': 'var(--warning)',
  identical: 'var(--success)'
}

const LABEL: Record<DiffStatus, string> = {
  different: 'different',
  'remote-only': 'remote only',
  'local-only': 'local only',
  identical: 'identical'
}

export default function CompareToolbar({
  mode,
  onModeChange,
  diffMap,
  highlightedStatuses,
  onToggleStatus
}: CompareToolbarProps): React.JSX.Element {
  const counts = countByStatus(diffMap)
  const hasDiff = diffMap.size > 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        minHeight: 28
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-subtle)',
          userSelect: 'none',
          letterSpacing: 0.3,
          textTransform: 'uppercase'
        }}
      >
        Compare
      </span>
      <div
        style={{
          display: 'flex',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          border: '1px solid var(--border)'
        }}
      >
        {MODES.map((m, i) => {
          const active = mode === m.value
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onModeChange(m.value)}
              style={{
                fontSize: 11,
                padding: '2px 10px',
                border: 'none',
                borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
                cursor: 'pointer',
                background: active ? 'var(--accent)' : 'var(--surface-raised)',
                color: active ? '#fff' : 'var(--text-subtle)',
                transition: 'background 80ms ease, color 80ms ease',
                userSelect: 'none'
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {hasDiff && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {STATUSES.map((status) => {
            const count = counts[status]
            if (count === 0) return null
            const active = highlightedStatuses.includes(status)
            const color = PILL_COLOR[status]
            return (
              <button
                key={status}
                type="button"
                title={`${active ? 'Hide' : 'Show'} ${LABEL[status]} files`}
                onClick={() => onToggleStatus(status)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  padding: '1px 8px',
                  borderRadius: 'var(--r-full)',
                  border: `1px solid ${color}`,
                  cursor: 'pointer',
                  background: active
                    ? `color-mix(in srgb, ${color} 15%, transparent)`
                    : 'transparent',
                  color: active ? color : 'var(--text-subtle)',
                  transition: 'background 80ms ease, color 80ms ease',
                  userSelect: 'none'
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: active ? color : 'transparent',
                    border: `1px solid ${color}`,
                    flexShrink: 0
                  }}
                />
                {count} {LABEL[status]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
