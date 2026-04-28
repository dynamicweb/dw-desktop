import { useRef, useState } from 'react'
import { envLabel, type StoredEnv } from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'

type SortKey =
  | 'displayName-asc'
  | 'displayName-desc'
  | 'name-asc'
  | 'name-desc'
  | 'date-asc'
  | 'date-desc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'displayName-asc', label: 'Name A→Z' },
  { value: 'displayName-desc', label: 'Name Z→A' },
  { value: 'name-asc', label: 'Project A→Z' },
  { value: 'name-desc', label: 'Project Z→A' },
  { value: 'date-asc', label: 'Date: oldest' },
  { value: 'date-desc', label: 'Date: newest' },
]

function applySorting(envs: StoredEnv[], sort: SortKey): StoredEnv[] {
  const copy = [...envs]
  switch (sort) {
    case 'displayName-asc':
      return copy.sort((a, b) => envLabel(a).localeCompare(envLabel(b)))
    case 'displayName-desc':
      return copy.sort((a, b) => envLabel(b).localeCompare(envLabel(a)))
    case 'name-asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'name-desc':
      return copy.sort((a, b) => b.name.localeCompare(a.name))
    case 'date-asc':
      return copy
    case 'date-desc':
      return copy.reverse()
  }
}

interface EnvSidebarProps {
  onAddEnv: () => void
  onEditEnv: (env: StoredEnv) => void
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

function IconButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        border: 'none',
        borderRadius: 'var(--r-sm)',
        background: 'transparent',
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
      {children}
    </button>
  )
}

function EnvRow({
  env,
  isActive,
  onClick,
  onEdit,
  onDelete
}: {
  env: StoredEnv
  isActive: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: isActive ? '2px 8px 2px 0' : '2px 8px 2px 2px',
        background: isActive ? 'rgba(208, 112, 48, 0.08)' : hover ? 'var(--surface-raised)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 80ms ease-out'
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 4px 4px 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        <StatusDot connected={isActive} />
        <div style={{ minWidth: 0, flex: 1 }}>
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
            {envLabel(env)}
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
      <div
        style={{
          display: 'flex',
          gap: 2,
          flexShrink: 0,
          opacity: hover ? 1 : 0,
          pointerEvents: hover ? 'auto' : 'none',
          transition: 'opacity 80ms ease-out'
        }}
      >
        <IconButton
          title="Edit environment"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.5l2 2L5 13H3v-2z" />
          </svg>
        </IconButton>
        <IconButton
          title="Delete environment"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5l.5-9" />
          </svg>
        </IconButton>
      </div>
    </div>
  )
}

const MIN_WIDTH = 140
const MAX_WIDTH = 400

export default function EnvSidebar({ onAddEnv, onEditEnv }: EnvSidebarProps): React.JSX.Element {
  const envs = useEnvStore((s) => s.envs)
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const setActiveEnv = useEnvStore((s) => s.setActiveEnv)
  const removeEnv = useEnvStore((s) => s.removeEnv)

  const [sort, setSort] = useState<SortKey>(() => {
    const saved = localStorage.getItem('dw.envSort')
    return SORT_OPTIONS.some((o) => o.value === saved) ? (saved as SortKey) : 'displayName-asc'
  })

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('dw.sidebarWidth'))
    return Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : 180
  })
  const [resizing, setResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setResizing(true)
    const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0

    function onMove(ev: PointerEvent): void {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX - sidebarLeft))
      setSidebarWidth(newWidth)
    }
    function onUp(): void {
      target.releasePointerCapture(e.pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      setResizing(false)
      setSidebarWidth((w) => {
        localStorage.setItem('dw.sidebarWidth', String(w))
        return w
      })
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  async function handleDelete(env: StoredEnv): Promise<void> {
    const ok = window.confirm(
      `Delete environment "${envLabel(env)}"?\n\nThis removes its stored credentials and saved folder state. You'll need to re-enter credentials to use this host again.`
    )
    if (!ok) return
    await removeEnv(env.name)
  }

  const sortedEnvs = applySorting(envs, sort)

  return (
    <>
      <aside
        ref={sidebarRef}
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}
      >
        <div
          style={{
            padding: '12px 12px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6
          }}
        >
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-subtle)',
              flexShrink: 0
            }}
          >
            Environments
          </span>
          <select
            value={sort}
            onChange={(e) => {
              const val = e.target.value as SortKey
              setSort(val)
              localStorage.setItem('dw.envSort', val)
            }}
            style={{
              fontSize: 10,
              color: 'var(--text-subtle)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              padding: '1px 3px',
              cursor: 'pointer',
              minWidth: 0,
              maxWidth: 90
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sortedEnvs.length === 0 ? (
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
            sortedEnvs.map((env) => (
              <EnvRow
                env={env}
                isActive={activeEnv?.name === env.name}
                key={env.name}
                onClick={() => void setActiveEnv(env.name)}
                onEdit={() => onEditEnv(env)}
                onDelete={() => void handleDelete(env)}
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
                {envLabel(activeEnv)}
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Resize handle — sits between sidebar and main content as a flex sibling */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · Double-click to reset"
        onPointerDown={handleResizePointerDown}
        onDoubleClick={() => {
          setSidebarWidth(180)
          localStorage.setItem('dw.sidebarWidth', '180')
        }}
        style={{
          flex: '0 0 4px',
          cursor: 'col-resize',
          background: resizing ? 'var(--accent)' : 'var(--border)',
          transition: resizing ? 'none' : 'background 120ms ease',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          if (!resizing) (e.currentTarget as HTMLElement).style.background = 'var(--border-strong)'
        }}
        onMouseLeave={(e) => {
          if (!resizing) (e.currentTarget as HTMLElement).style.background = 'var(--border)'
        }}
      />
    </>
  )
}
