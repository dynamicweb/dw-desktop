import type { CompareMode, DiffStatus } from '../../../shared/types'
import { countByStatus } from '../utils/compareEntries'

interface CompareToolbarProps {
  mode: CompareMode
  onModeChange: (mode: CompareMode) => void
  diffMap: Map<string, DiffStatus>
  highlightedStatuses: DiffStatus[]
  onToggleStatus: (status: DiffStatus) => void
  syncNav: boolean
  onSyncNavChange: (v: boolean) => void
}

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
  onToggleStatus,
  syncNav,
  onSyncNavChange
}: CompareToolbarProps): React.JSX.Element {
  const counts = countByStatus(diffMap)
  const hasDiff = diffMap.size > 0
  const compareOn = mode !== 'off'

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
      <button
        type="button"
        title={compareOn ? 'Disable compare' : 'Enable compare — detects differences by comparing file sizes'}
        onClick={() => onModeChange(compareOn ? 'off' : 'auto')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '2px 10px',
          borderRadius: 'var(--r-sm)',
          border: `1px solid ${compareOn ? 'var(--accent)' : 'var(--border)'}`,
          cursor: 'pointer',
          background: compareOn ? 'var(--accent)' : 'var(--surface-raised)',
          color: compareOn ? '#fff' : 'var(--text-subtle)',
          transition: 'background 80ms ease, color 80ms ease, border-color 80ms ease',
          userSelect: 'none'
        }}
      >
        ⊟ Compare
      </button>

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

      <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
      <button
        type="button"
        title={syncNav ? 'Disable synchronized navigation' : 'Enable synchronized navigation — navigates both panes together when folder structures match'}
        onClick={() => onSyncNavChange(!syncNav)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '2px 10px',
          borderRadius: 'var(--r-sm)',
          border: `1px solid ${syncNav ? 'var(--accent)' : 'var(--border)'}`,
          cursor: 'pointer',
          background: syncNav ? 'var(--accent)' : 'var(--surface-raised)',
          color: syncNav ? '#fff' : 'var(--text-subtle)',
          transition: 'background 80ms ease, color 80ms ease, border-color 80ms ease',
          userSelect: 'none'
        }}
      >
        ⇄ Sync
      </button>
    </div>
  )
}
