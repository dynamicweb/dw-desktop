import { useEffect, useState } from 'react'
import { useEnvStore } from './stores/envStore'
import { useFileStore } from './stores/fileStore'
import { initTransferListeners } from './stores/transferStore'
import DualPaneBrowser from './components/DualPaneBrowser'
import EnvSidebar from './components/EnvSidebar'
import TransferQueue from './components/TransferQueue'
import TransferLog from './components/TransferLog'
import AddEnvModal from './components/AddEnvModal'
import DebugPanel from './components/DebugPanel'
import ThemeSwitcher from './components/ThemeSwitcher'
import { useTheme } from './hooks/useTheme'

type Tab = 'files' | 'log' | 'debug'

export default function App(): React.JSX.Element {
  const loadEnvs = useEnvStore((s) => s.loadEnvs)
  const loadLocal = useFileStore((s) => s.loadLocal)

  const [tab, setTab] = useState<Tab>('files')
  const [showAddEnv, setShowAddEnv] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    async function init(): Promise<void> {
      await loadEnvs()
      const homedir = await window.dw.fs.homedir()
      await loadLocal(homedir)
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
      {/* Title bar */}
      <div
        className="drag-region"
        style={{
          height: 38,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 16,
          flexShrink: 0,
          gap: 8
        }}
      >
        <span
          style={{
            marginLeft: 64,
            fontSize: 11,
            color: 'var(--text-subtle)',
            fontFamily: 'var(--font-ui)',
            flexGrow: 1
          }}
        >
          DW Desktop
        </span>
        <ThemeSwitcher theme={theme} onChange={setTheme} />
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0
        }}
      >
        {(['files', 'log', 'debug'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '1px solid var(--accent)' : '1px solid transparent',
              color: tab === t ? 'var(--text)' : 'var(--text-subtle)',
              cursor: 'pointer',
              transition: 'color 80ms ease-out'
            }}
          >
            {t === 'files' ? 'Files' : t === 'log' ? 'Transfer log' : 'Debug'}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <EnvSidebar onAddEnv={() => setShowAddEnv(true)} />
        {showAddEnv ? (
          <AddEnvModal onDone={() => setShowAddEnv(false)} />
        ) : tab === 'files' ? (
          <DualPaneBrowser />
        ) : tab === 'log' ? (
          <TransferLog />
        ) : (
          <DebugPanel />
        )}
      </div>

      <TransferQueue />
    </div>
  )
}
