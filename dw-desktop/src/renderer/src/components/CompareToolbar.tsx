import type { CompareMode, DiffStatus } from '../../../shared/types'
import { countByStatus } from '../utils/compareEntries'

interface CompareToolbarProps {
  mode: CompareMode
  onModeChange: (mode: CompareMode) => void
  diffMap: Map<string, DiffStatus>
  highlightedStatuses: DiffStatus[]
  onToggleStatus: (status: DiffStatus) => void
  mirrorNav: boolean
  onMirrorNavChange: (v: boolean) => void
  pathsMatch: boolean
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
  'remote-only': 'remote',
  'local-only': 'local',
  identical: 'equal'
}

const STRIPE = (color: string): string =>
  `repeating-linear-gradient(45deg, ${color}, ${color} 3px, color-mix(in srgb, ${color} 35%, transparent) 3px, color-mix(in srgb, ${color} 35%, transparent) 7px)`

export default function CompareToolbar({
  mode,
  onModeChange,
  diffMap,
  highlightedStatuses,
  onToggleStatus,
  mirrorNav,
  onMirrorNavChange,
  pathsMatch
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
        title={
          compareOn
            ? pathsMatch
              ? 'Disable compare'
              : 'Compare is enabled — navigate both panes to a matching /Files/… folder to activate'
            : 'Enable compare — detects differences by comparing file sizes'
        }
        onClick={() => onModeChange(compareOn ? 'off' : 'auto')}
        style={{
          height: 22,
          padding: '0 8px',
          fontSize: 10,
          fontFamily: 'var(--font-ui)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border-strong)',
          cursor: 'pointer',
          background: compareOn
            ? pathsMatch
              ? 'var(--accent)'
              : STRIPE('var(--accent)')
            : 'var(--surface-raised)',
          color: compareOn ? '#fff' : 'var(--text-subtle)',
          transition: 'background 80ms ease-out, color 80ms ease-out',
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
        title={
          mirrorNav
            ? pathsMatch
              ? 'Disable mirror navigation'
              : 'Mirror is enabled — navigate both panes to a matching /Files/… folder to activate'
            : 'Enable mirror navigation — navigates both panes together when folder structures match'
        }
        onClick={() => onMirrorNavChange(!mirrorNav)}
        style={{
          height: 22,
          padding: '0 8px',
          fontSize: 10,
          fontFamily: 'var(--font-ui)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border-strong)',
          cursor: 'pointer',
          background: mirrorNav
            ? pathsMatch
              ? 'var(--accent)'
              : STRIPE('var(--accent)')
            : 'var(--surface-raised)',
          color: mirrorNav ? '#fff' : 'var(--text-subtle)',
          transition: 'background 80ms ease-out, color 80ms ease-out',
          userSelect: 'none'
        }}
      >
        ⇄ Mirror
      </button>
    </div>
  )
}
