import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ENV_KINDS,
  envKind,
  envKindLabel,
  envLabel,
  type EnvKind,
  type StoredEnv
} from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'
import { useFileStore } from '../stores/fileStore'
import { useTransferStore } from '../stores/transferStore'
import { useUiStore, type View } from '../stores/uiStore'
import { folderName, useWorkspaceStore } from '../stores/workspaceStore'
import {
  ActivityIcon,
  BrowseIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CloseIcon,
  FolderIcon,
  LogoMark,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  SyncIcon
} from './Icons'

const isMac = navigator.platform.toUpperCase().includes('MAC')

export function KindBadge({ kind }: { kind: EnvKind }): React.JSX.Element | null {
  if (kind === 'development') return null
  const production = kind === 'production'
  return (
    <span
      className="chip"
      style={{
        height: 18,
        padding: '0 7px',
        background: production ? 'var(--chip-danger-bg)' : 'var(--chip-changed-bg)',
        color: production ? 'var(--chip-danger-fg)' : 'var(--chip-changed-fg)'
      }}
    >
      {envKindLabel(kind)}
    </span>
  )
}

function StatusDot({ state }: { state: 'online' | 'error' | 'idle' }): React.JSX.Element {
  const color =
    state === 'online'
      ? 'var(--online)'
      : state === 'error'
        ? 'var(--danger)'
        : 'var(--border-strong)'
  return (
    <span
      aria-hidden="true"
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  )
}

function useConnectionState(): 'online' | 'error' | 'idle' {
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const remoteEnvName = useFileStore((s) => s.remoteEnvName)
  const remoteError = useFileStore((s) => s.remoteError)
  if (!activeEnv || remoteEnvName !== activeEnv.name) return 'idle'
  return remoteError ? 'error' : 'online'
}

function EnvSwitcher({ onClose }: { onClose: () => void }): React.JSX.Element {
  const envs = useEnvStore((s) => s.envs)
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const setActiveEnv = useEnvStore((s) => s.setActiveEnv)
  const openAddEnv = useUiStore((s) => s.openAddEnv)
  const setView = useUiStore((s) => s.setView)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (e: StoredEnv): boolean =>
      !q || envLabel(e).toLowerCase().includes(q) || e.host.toLowerCase().includes(q)
    return ENV_KINDS.map((kind) => ({
      kind,
      envs: envs
        .filter((e) => envKind(e) === kind && match(e))
        .sort((a, b) => envLabel(a).localeCompare(envLabel(b)))
    })).filter((g) => g.envs.length > 0)
  }, [envs, query])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Choose environment"
      className="popover"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        width: 340,
        maxHeight: 520,
        overflowY: 'auto',
        zIndex: 50,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 38,
          padding: '0 12px',
          marginBottom: 4,
          borderRadius: 10,
          background: 'var(--surface-raised)',
          color: 'var(--text-subtle)'
        }}
      >
        <SearchIcon />
        <input
          autoFocus
          type="search"
          placeholder="Search environments"
          aria-label="Search environments"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 13,
            flex: 1,
            minWidth: 0
          }}
        />
      </label>

      {groups.length === 0 && (
        <p style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-subtle)' }}>
          {envs.length === 0 ? 'No environments yet.' : 'No environment matches.'}
        </p>
      )}

      {groups.map((g) => (
        <div key={g.kind}>
          <div
            style={{
              padding: '10px 12px 4px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-subtle)'
            }}
          >
            {envKindLabel(g.kind)}
          </div>
          {g.envs.map((env) => {
            const current = env.name === activeEnv?.name
            return (
              <button
                key={env.name}
                type="button"
                className="menu-item"
                aria-current={current}
                onClick={() => {
                  void setActiveEnv(env.name)
                  setView('browse')
                  onClose()
                }}
                style={{
                  minHeight: 48,
                  padding: '6px 12px',
                  background: current ? 'var(--surface-raised)' : undefined
                }}
              >
                <span
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{envLabel(env)}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-subtle)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {env.host}
                  </span>
                </span>
                {current && <CheckIcon />}
              </button>
            )
          })}
        </div>
      ))}

      <div className="menu-separator" />
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          openAddEnv()
          onClose()
        }}
      >
        <PlusIcon />
        Add environment
      </button>
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          setView('settings')
          onClose()
        }}
      >
        <SettingsIcon />
        Manage environments
      </button>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        margin: '18px 10px 6px',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-subtle)'
      }}
    >
      {children}
    </div>
  )
}

function NavItem({
  view,
  icon,
  label,
  badge,
  collapsed
}: {
  view: View
  icon: React.ReactNode
  label: string
  badge?: number
  collapsed: boolean
}): React.JSX.Element {
  const current = useUiStore((s) => s.view) === view
  const setView = useUiStore((s) => s.setView)
  return (
    <button
      type="button"
      className="nav-item"
      aria-current={current ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={() => setView(view)}
      style={collapsed ? { justifyContent: 'center', padding: 0, position: 'relative' } : undefined}
    >
      {icon}
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!!badge && (
        <span
          className="chip"
          style={
            collapsed
              ? {
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  height: 16,
                  padding: '0 5px',
                  fontSize: 10,
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)'
                }
              : {
                  height: 18,
                  padding: '0 7px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)'
                }
          }
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/** Navigates Browse to a remote folder (used by pinned / recent rows). */
function openRemoteFolder(path: string): void {
  useUiStore.getState().setView('browse')
  useUiStore.getState().requestRemoteFolder(path)
}

export default function Sidebar(): React.JSX.Element {
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const view = useUiStore((s) => s.view)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const startSync = useUiStore((s) => s.startSync)
  const { pinned, recent, syncs, togglePin } = useWorkspaceStore()
  const running = useTransferStore(
    (s) =>
      new Set(
        s.jobs.filter((j) => j.status === 'active' || j.status === 'queued').map((j) => j.batchId)
      ).size
  )
  const connection = useConnectionState()
  const [switcherOpen, setSwitcherOpen] = useState(false)

  return (
    <aside
      style={{
        width: collapsed ? 60 : 260,
        flexShrink: 0,
        height: '100%',
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 10px 12px',
        gap: 2,
        transition: 'width 120ms ease-out'
      }}
    >
      <div
        className="drag-region"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          height: 40,
          paddingLeft: isMac && !collapsed ? 64 : collapsed ? 0 : 6,
          marginTop: isMac && collapsed ? 22 : 0,
          gap: 8
        }}
      >
        {!collapsed && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15 }}
          >
            <LogoMark />
            DW Desktop
          </div>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleSidebar}
        >
          <SidebarIcon size={18} />
        </button>
      </div>

      {/* Environment switcher */}
      <div style={{ position: 'relative', margin: '8px 0 12px' }}>
        {collapsed ? (
          <button
            type="button"
            className="icon-btn"
            aria-label={activeEnv ? `Environment: ${envLabel(activeEnv)}` : 'Choose environment'}
            title={activeEnv ? `${envLabel(activeEnv)} · ${activeEnv.host}` : 'Choose environment'}
            onClick={() => setSwitcherOpen((v) => !v)}
            style={{
              width: 40,
              height: 40,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface)',
              margin: '0 auto'
            }}
          >
            <StatusDot state={connection} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Switch environment"
            aria-expanded={switcherOpen}
            onClick={() => setSwitcherOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              border: `1px solid ${switcherOpen ? 'var(--text-subtle)' : 'var(--border-strong)'}`,
              background: 'var(--surface)',
              borderRadius: 'var(--r-md)'
            }}
          >
            {activeEnv ? (
              <span
                style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <StatusDot state={connection} />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {envLabel(activeEnv)}
                  </span>
                  <KindBadge kind={envKind(activeEnv)} />
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-subtle)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {activeEnv.host}
                </span>
              </span>
            ) : (
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text-muted)' }}>
                Choose environment
              </span>
            )}
            <ChevronsUpDownIcon style={{ color: 'var(--text-subtle)' }} />
          </button>
        )}
        {switcherOpen && <EnvSwitcher onClose={() => setSwitcherOpen(false)} />}
      </div>

      <NavItem view="browse" icon={<BrowseIcon />} label="Browse" collapsed={collapsed} />
      <NavItem view="sync" icon={<SyncIcon />} label="Sync" collapsed={collapsed} />
      <NavItem
        view="activity"
        icon={<ActivityIcon />}
        label="Activity"
        badge={running}
        collapsed={collapsed}
      />

      {!collapsed && activeEnv && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          {view === 'sync' ? (
            <>
              <SectionLabel>Saved syncs</SectionLabel>
              {syncs.length === 0 && (
                <p
                  style={{
                    padding: '0 10px',
                    fontSize: 12,
                    color: 'var(--text-subtle)',
                    lineHeight: 1.5
                  }}
                >
                  Save a folder pair from the Sync screen to run it again with one click.
                </p>
              )}
              {syncs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="nav-item"
                  onClick={() =>
                    startSync({
                      localPath: s.localPath,
                      remotePath: s.remotePath,
                      direction: s.direction,
                      compareContent: s.compareContent,
                      deleteExtra: s.deleteExtra,
                      savedId: s.id,
                      name: s.name
                    })
                  }
                  style={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    padding: '7px 10px'
                  }}
                >
                  <span style={{ fontSize: 13 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                    {s.direction === 'push' ? 'Deploy' : 'Get from server'}
                    {s.lastRunAt ? ` · last run ${new Date(s.lastRunAt).toLocaleDateString()}` : ''}
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <SectionLabel>Pinned</SectionLabel>
              {pinned.length === 0 && (
                <p
                  style={{
                    padding: '0 10px',
                    fontSize: 12,
                    color: 'var(--text-subtle)',
                    lineHeight: 1.5
                  }}
                >
                  Pin a server folder from its “···” menu to keep it here.
                </p>
              )}
              {pinned.map((p) => (
                <div key={p} style={{ position: 'relative' }} className="pinned-row">
                  <button
                    type="button"
                    className="nav-item"
                    title={`/Files${p}`}
                    onClick={() => openRemoteFolder(p)}
                    style={{ fontSize: 13, minHeight: 34, paddingRight: 34 }}
                  >
                    <FolderIcon size={15} style={{ color: 'var(--text-muted)' }} />
                    <span
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {folderName(p)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Unpin ${folderName(p)}`}
                    title="Unpin"
                    onClick={() => togglePin(p)}
                    style={{ position: 'absolute', right: 2, top: 1, width: 30, height: 32 }}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}

              {recent.length > 0 && <SectionLabel>Recent</SectionLabel>}
              {recent.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="nav-item"
                  title={`/Files${p}`}
                  onClick={() => openRemoteFolder(p)}
                  style={{ fontSize: 13, minHeight: 32 }}
                >
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {p.replace(/^\//, '')}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {(collapsed || !activeEnv) && <div style={{ flex: 1 }} />}

      <NavItem view="settings" icon={<SettingsIcon />} label="Settings" collapsed={collapsed} />
    </aside>
  )
}
