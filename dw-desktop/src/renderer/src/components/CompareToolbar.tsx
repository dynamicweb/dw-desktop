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
  filterActive: boolean
  onFilterChange: (v: boolean) => void
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

function EyeIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <ellipse cx="8" cy="8" rx="6" ry="4" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      {!open && (
        <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </svg>
  )
}

const segBase: React.CSSProperties = {
  height: 22,
  padding: '0 8px',
  fontSize: 10,
  fontFamily: 'var(--font-ui)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 80ms ease-out, color 80ms ease-out',
}

export default function CompareToolbar({
  mode,
  onModeChange,
  diffMap,
  highlightedStatuses,
  onToggleStatus,
  mirrorNav,
  onMirrorNavChange,
  pathsMatch,
  filterActive,
  onFilterChange
}: CompareToolbarProps): React.JSX.Element {
  const counts = countByStatus(diffMap)
  const hasDiff = diffMap.size > 0
  const compareOn = mode !== 'off'
  const showFilter = compareOn && hasDiff

  const compareBorder = compareOn && !pathsMatch ? '1px solid var(--accent)' : '1px solid var(--border-strong)'
  const compareBg = compareOn && pathsMatch ? 'var(--accent)' : 'var(--surface-raised)'
  const compareColor = compareOn ? (pathsMatch ? '#fff' : 'var(--accent)') : 'var(--text-subtle)'

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
      {/* Compare button — segmented with eye filter when active */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
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
            ...segBase,
            background: compareBg,
            color: compareColor,
            border: compareBorder,
            borderRadius: showFilter ? 'var(--r-sm) 0 0 var(--r-sm)' : 'var(--r-sm)',
          }}
        >
          ⊟ Compare
        </button>
        {showFilter && (
          <button
            type="button"
            title={filterActive ? 'Show all files' : 'Show only selected status files'}
            onClick={() => onFilterChange(!filterActive)}
            style={{
              ...segBase,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              padding: 0,
              background: filterActive ? compareBg : 'var(--surface-raised)',
              color: filterActive ? compareColor : 'var(--text-subtle)',
              border: compareBorder,
              borderLeft: 'none',
              borderRadius: '0 var(--r-sm) var(--r-sm) 0',
            }}
          >
            <EyeIcon open={!filterActive} />
          </button>
        )}
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
          border: mirrorNav && !pathsMatch ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
          cursor: 'pointer',
          background: mirrorNav && pathsMatch ? 'var(--accent)' : 'var(--surface-raised)',
          color: mirrorNav ? (pathsMatch ? '#fff' : 'var(--accent)') : 'var(--text-subtle)',
          transition: 'background 80ms ease-out, color 80ms ease-out',
          userSelect: 'none'
        }}
      >
        ⇄ Mirror
      </button>
    </div>
  )
}
