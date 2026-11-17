import { useEffect } from 'react'
import { useEnvStore } from './stores/envStore'
import { useFileStore } from './stores/fileStore'
import { initTransferListeners } from './stores/transferStore'
import { useUiStore } from './stores/uiStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import ActivityView from './components/ActivityView'
import AddEnvModal from './components/AddEnvModal'
import DualPaneBrowser from './components/DualPaneBrowser'
import EditEnvModal from './components/EditEnvModal'
import SettingsView from './components/SettingsView'
import Sidebar from './components/Sidebar'
import SyncView from './components/SyncView'
import ToastContainer from './components/ToastContainer'
import TransferPill from './components/TransferPill'
import UpdateBanner from './components/UpdateBanner'
import { useTheme } from './hooks/useTheme'

const isMac = navigator.platform.toUpperCase().includes('MAC')

export default function App(): React.JSX.Element {
  const loadEnvs = useEnvStore((s) => s.loadEnvs)
  const activeEnvName = useEnvStore((s) => s.activeEnv?.name ?? null)
  const loadLocal = useFileStore((s) => s.loadLocal)
  const loadWorkspace = useWorkspaceStore((s) => s.load)
  const { view, showAddEnv, editEnv, closeEnvDialogs } = useUiStore()
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

  // Pinned / recent folders and saved syncs belong to the active environment.
  useEffect(() => {
    void loadWorkspace(activeEnvName)
  }, [activeEnvName, loadWorkspace])

  let content: React.ReactNode
  if (showAddEnv) content = <AddEnvModal onDone={closeEnvDialogs} />
  else if (editEnv) content = <EditEnvModal env={editEnv} onDone={closeEnvDialogs} />
  else if (view === 'sync') content = <SyncView />
  else if (view === 'activity') content = <ActivityView />
  else if (view === 'settings') content = <SettingsView theme={theme} onThemeChange={setTheme} />
  else content = <DualPaneBrowser />

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
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--bg)'
          }}
        >
          {/* macOS has no title bar (hiddenInset): keep the top edge draggable. */}
          {isMac && (
            <div
              className="drag-region"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, zIndex: 1 }}
            />
          )}
          {content}
        </main>
      </div>
      <UpdateBanner />
      <TransferPill />
      <ToastContainer />
    </div>
  )
}
