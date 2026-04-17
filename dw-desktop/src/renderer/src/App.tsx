import { useEffect, useState } from 'react'
import type { StoredEnv } from '../../shared/types'
import { useEnvStore } from './stores/envStore'
import { useFileStore } from './stores/fileStore'
import { initTransferListeners } from './stores/transferStore'
import DualPaneBrowser from './components/DualPaneBrowser'
import EnvSidebar from './components/EnvSidebar'
import TransferQueue from './components/TransferQueue'
import TransferLog from './components/TransferLog'
import AddEnvModal from './components/AddEnvModal'
import EditEnvModal from './components/EditEnvModal'
import DebugPanel from './components/DebugPanel'
import ThemeSwitcher from './components/ThemeSwitcher'
import ToastContainer from './components/ToastContainer'
import { useTheme } from './hooks/useTheme'
import UpdateBanner from './components/UpdateBanner'
import logoUrl from './assets/logo.svg'

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

type Tab = 'files' | 'log' | 'debug'

export default function App(): React.JSX.Element {
  const loadEnvs = useEnvStore((s) => s.loadEnvs)
  const loadLocal = useFileStore((s) => s.loadLocal)

  const [tab, setTab] = useState<Tab>('files')
  const [showAddEnv, setShowAddEnv] = useState(false)
  const [editEnv, setEditEnv] = useState<StoredEnv | null>(null)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    async function init(): Promise<void> {
      await loadEnvs()
      // If there's no active env, seed the local pane with homedir.
      // If there *is* an active env, DualPaneBrowser restores its saved
      // local path (or the env's localStartPath) — don't fight that here.
      if (!useEnvStore.getState().activeEnv) {
        const homedir = await window.dw.fs.homedir()
        await loadLocal(homedir, null)
      }
    }
    const unsubscribe = initTransferListeners()
    void init()
    return unsubscribe
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        userSelect: 'none'
      }}
    >
      {/* Tab bar (also acts as the drag region / title bar) */}
      <div
        className="drag-region"
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          paddingLeft: isMac ? 80 : 10,
          paddingRight: 12,
          gap: 10,
          flexShrink: 0
        }}
      >
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          style={{ width: 20, height: 22, display: 'block', flexShrink: 0 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
          {(['files', 'log', 'debug'] as Tab[]).map((t) => {
            const active = tab === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="no-drag"
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  fontFamily: 'var(--font-ui)',
                  background: active ? 'var(--control-hover)' : 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 6,
                  color: active ? 'var(--text)' : 'var(--text-subtle)',
                  cursor: 'pointer',
                  transition: 'background 80ms ease-out, color 80ms ease-out'
                }}
              >
                {t === 'files' ? 'Files' : t === 'log' ? 'Transfer log' : 'Debug'}
              </button>
            )
          })}
        </div>
        <div className="no-drag">
          <ThemeSwitcher theme={theme} onChange={setTheme} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <EnvSidebar onAddEnv={() => setShowAddEnv(true)} onEditEnv={(env) => setEditEnv(env)} />
        {showAddEnv ? (
          <AddEnvModal onDone={() => setShowAddEnv(false)} />
        ) : editEnv ? (
          <EditEnvModal env={editEnv} onDone={() => setEditEnv(null)} />
        ) : tab === 'files' ? (
          <DualPaneBrowser />
        ) : tab === 'log' ? (
          <TransferLog />
        ) : (
          <DebugPanel />
        )}
      </div>

      <UpdateBanner />
      <TransferQueue />
      <ToastContainer />
    </div>
  )
}
