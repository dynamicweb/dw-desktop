import { nanoid } from 'nanoid'
import { useEffect, useState } from 'react'
import type { FileEntry } from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'
import { useFileStore } from '../stores/fileStore'
import { useToastStore } from '../stores/toastStore'
import { useTransferStore } from '../stores/transferStore'
import AddEnvModal from './AddEnvModal'
import ContextMenu from './ContextMenu'
import FileList from './FileList'
import PaneHeader from './PaneHeader'

interface ContextMenuState {
  entry: FileEntry
  x: number
  y: number
  pane: 'local' | 'remote'
}

function pathBreadcrumbs(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return ['/']
  return ['/', ...parts]
}

function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return '/'
  const parent = '/' + parts.slice(0, -1).join('/')
  if (parent === '/') {
    const driveMatch = normalized.match(/^\/([A-Za-z]:)/)
    if (driveMatch) return `/${driveMatch[1]}`
    return '/'
  }
  return parent
}

function localParentPath(path: string): string {
  const sep = path.includes('\\') ? '\\' : '/'
  const parts = path.split(sep)
  if (parts.length <= 1) return path
  const parent = parts.slice(0, -1).join(sep)
  return parent || path
}

export default function DualPaneBrowser(): React.JSX.Element {
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const { remoteEntries, remotePath, localEntries, localPath, selected, loadRemote, loadLocal, setSelected } =
    useFileStore()
  const { addJob } = useTransferStore()
  const showToast = useToastStore((s) => s.show)

  const [remoteLoading, setRemoteLoading] = useState(false)
  const [localLoading, setLocalLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showAddEnv, setShowAddEnv] = useState(false)
  const [conflictCount, setConflictCount] = useState(0)
  const [overwrite, setOverwrite] = useState(false)

  useEffect(() => {
    if (!activeEnv) return
    setRemoteLoading(true)
    void loadRemote(activeEnv.name, '/').finally(() => setRemoteLoading(false))
  }, [activeEnv?.name])

  useEffect(() => {
    if (selected.pane !== 'local' || selected.paths.length === 0) {
      setConflictCount(0)
      return
    }
    const remoteNames = new Set(remoteEntries.map((e) => e.name))
    const conflicts = selected.paths.filter((p) => {
      const name = p.split('/').pop() ?? p.split('\\').pop() ?? p
      return remoteNames.has(name)
    })
    setConflictCount(conflicts.length)
  }, [selected, remoteEntries])

  async function navigateLocal(entry: FileEntry): Promise<void> {
    if (entry.type !== 'directory') return
    setLocalLoading(true)
    await loadLocal(entry.path)
    setLocalLoading(false)
  }

  async function navigateRemote(entry: FileEntry): Promise<void> {
    if (!activeEnv || entry.type !== 'directory') return
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, entry.path)
    setRemoteLoading(false)
  }

  async function handleUpload(localPaths: string[], targetRemotePath: string): Promise<void> {
    if (!activeEnv) return
    if (targetRemotePath === '/' || targetRemotePath === '') {
      showToast(
        'Uploads to the remote root aren\u2019t allowed. Open a folder (Files, Images, Templates\u2026) and drop there.',
        'warning'
      )
      return
    }
    const batchId = nanoid()
    for (const p of localPaths) {
      const jobId = nanoid()
      const label = p.split('/').pop() ?? p.split('\\').pop() ?? p
      addJob({
        id: jobId,
        batchId,
        direction: 'upload',
        label,
        remotePath: targetRemotePath,
        localPath: p,
        status: 'queued',
        transferred: 0,
        total: 1
      })
      window.dw.files.upload(activeEnv.name, [p], targetRemotePath, overwrite, jobId)
    }
  }

  async function handleDownload(remotePaths: string[]): Promise<void> {
    if (!activeEnv) return
    const batchId = nanoid()
    const targetLocalPath = localPath
    let anyOk = false
    for (const remotePath of remotePaths) {
      const jobId = nanoid()
      const label = remotePath.split('/').filter(Boolean).pop() ?? remotePath
      addJob({
        id: jobId,
        batchId,
        direction: 'download',
        label,
        remotePath,
        localPath: targetLocalPath,
        status: 'active',
        transferred: 0,
        total: 1
      })
      const result = await window.dw.files.download(activeEnv.name, remotePath, targetLocalPath)
      if (result.ok) anyOk = true
      useTransferStore.getState().updateJob(jobId, {
        status: result.ok ? 'done' : 'error',
        transferred: result.ok ? 1 : 0,
        error: result.error
      })
    }
    // Reload the local pane if the download target is still the folder shown.
    if (anyOk && useFileStore.getState().localPath === targetLocalPath) {
      void loadLocal(targetLocalPath)
    }
  }

  async function handleDelete(path: string): Promise<void> {
    if (!activeEnv) return
    await window.dw.files.delete(activeEnv.name, path)
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, remotePath)
    setRemoteLoading(false)
  }

  async function handleCopy(source: string, destination: string): Promise<void> {
    if (!activeEnv) return
    await window.dw.files.copy(activeEnv.name, source, destination)
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, remotePath)
    setRemoteLoading(false)
  }

  async function handleMove(source: string, destination: string): Promise<void> {
    if (!activeEnv) return
    await window.dw.files.move(activeEnv.name, source, destination, true)
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, remotePath)
    setRemoteLoading(false)
  }

  async function handleReveal(path: string): Promise<void> {
    const result = await window.dw.fs.reveal(path)
    if (!result.ok) {
      showToast(result.error ?? 'Could not open the file in your file manager.', 'error')
    }
  }

  async function handleOpenDialog(): Promise<void> {
    const result = await window.dw.fs.openDialog(['openFile', 'multiSelections', 'openDirectory'])
    if (result.ok && result.data && result.data.paths.length > 0) {
      void handleUpload(result.data.paths, remotePath)
    }
  }

  const localSelected = selected.pane === 'local' ? selected.paths : []
  const remoteSelected = selected.pane === 'remote' ? selected.paths : []

  const dropZoneStyle: React.CSSProperties = {
    padding: '7px 12px',
    borderTop: '1px solid var(--border)',
    fontSize: 10,
    color: 'var(--text-subtle)',
    textAlign: 'center',
    transition: 'color 80ms ease-out'
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Local pane */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          borderRight: '1px solid var(--border)'
        }}
      >
        <PaneHeader
          breadcrumbs={pathBreadcrumbs(localPath)}
          label="Local"
          onNavigateUp={() => void loadLocal(localParentPath(localPath))}
          onRefresh={() => void loadLocal(localPath)}
          actions={
            localSelected.length > 1 ? (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{localSelected.length} selected</span>
            ) : undefined
          }
        />
        <FileList
          entries={localEntries}
          loading={localLoading}
          onContextMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'local' })}
          onDoubleClick={(entry) => void navigateLocal(entry)}
          onSelect={(paths) => setSelected('local', paths)}
          pane="local"
          selected={localSelected}
        />

        {/* Conflict banner */}
        {conflictCount > 0 && (
          <div
            style={{
              padding: '6px 12px',
              background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 11
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              {conflictCount} {conflictCount === 1 ? 'file' : 'files'} already exist on remote.
            </span>
            <button
              type="button"
              onClick={() => setOverwrite(false)}
              style={{
                fontSize: 11,
                padding: '1px 8px',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                cursor: 'pointer',
                background: !overwrite ? 'var(--surface-raised)' : 'transparent',
                color: !overwrite ? 'var(--text)' : 'var(--text-subtle)'
              }}
            >
              Skip existing
            </button>
            <button
              type="button"
              onClick={() => setOverwrite(true)}
              style={{
                fontSize: 11,
                padding: '1px 8px',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                cursor: 'pointer',
                background: overwrite ? 'var(--surface-raised)' : 'transparent',
                color: overwrite ? 'var(--text)' : 'var(--text-subtle)'
              }}
            >
              Replace all
            </button>
          </div>
        )}

        {/* Drop zone — accepts OS files and drags from local FileList */}
        <div
          style={{ ...dropZoneStyle, cursor: 'pointer' }}
          onClick={() => void handleOpenDialog()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            // Dragged from local FileList rows
            const raw = e.dataTransfer.getData('application/x-dw-paths')
            if (raw) {
              const { paths } = JSON.parse(raw) as { paths: string[]; pane: string }
              void handleUpload(paths, remotePath)
              return
            }
            // Dragged from OS file explorer
            const osPaths = Array.from(e.dataTransfer.files).map((f) => window.dw.fs.getPathForFile(f))
            if (osPaths.length > 0) {
              void handleUpload(osPaths.filter(Boolean), remotePath)
            }
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')}
        >
          Drop files here or{' '}
          <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>click to browse</span>
        </div>
      </div>

      {/* Remote pane */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {!activeEnv ? (
          showAddEnv ? (
            <AddEnvModal onDone={() => setShowAddEnv(false)} />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg)',
                gap: 16
              }}
            >
              <p
                style={{
                  color: 'var(--text-subtle)',
                  fontSize: 24,
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  fontWeight: 300,
                  textAlign: 'center'
                }}
              >
                No environment connected.
              </p>
              <button
                type="button"
                onClick={() => setShowAddEnv(true)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  transition: 'background 120ms ease'
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--accent)')}
              >
                + Add environment
              </button>
            </div>
          )
        ) : (
          <>
            <PaneHeader
              breadcrumbs={pathBreadcrumbs(remotePath)}
              label={activeEnv.name}
              sublabel={activeEnv.host}
              onNavigateUp={() => void loadRemote(activeEnv.name, parentPath(remotePath))}
              onRefresh={() => {
                setRemoteLoading(true)
                void loadRemote(activeEnv.name, remotePath).finally(() => setRemoteLoading(false))
              }}
              actions={
                remoteSelected.length > 1 ? (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{remoteSelected.length} selected</span>
                ) : undefined
              }
            />
            <FileList
              dropTarget
              entries={remoteEntries}
              loading={remoteLoading}
              onContextMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'remote' })}
              onDoubleClick={(entry) => void navigateRemote(entry)}
              onDropIntoDir={(paths, targetDir) => void handleUpload(paths, targetDir.path)}
              onDropOnPane={(paths) => void handleUpload(paths, remotePath)}
              onSelect={(paths) => setSelected('remote', paths)}
              pane="remote"
              selected={remoteSelected}
            />
            <div
              style={dropZoneStyle}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const raw = e.dataTransfer.getData('application/x-dw-paths')
                if (raw) {
                  const { paths } = JSON.parse(raw) as { paths: string[]; pane: string }
                  void handleDownload(paths)
                }
              }}
            >
              Drag remote files here to copy to local folder
            </div>
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          entry={contextMenu.entry}
          hasActiveEnv={!!activeEnv}
          onClose={() => setContextMenu(null)}
          onCopy={(dest) => void handleCopy(contextMenu.entry.path, dest)}
          onCopyPath={() => void navigator.clipboard.writeText(contextMenu.entry.path)}
          onDelete={() => void handleDelete(contextMenu.entry.path)}
          onDownload={() => void handleDownload([contextMenu.entry.path])}
          onMove={(dest) => void handleMove(contextMenu.entry.path, dest)}
          onReveal={() => void handleReveal(contextMenu.entry.path)}
          onUpload={() => void handleUpload([contextMenu.entry.path], remotePath)}
          pane={contextMenu.pane}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      )}
    </div>
  )
}
