import { nanoid } from 'nanoid'
import { useEffect, useMemo, useRef, useState } from 'react'
import { envLabel, type FileEntry } from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'
import { useFileStore } from '../stores/fileStore'
import { useToastStore } from '../stores/toastStore'
import { useTransferStore } from '../stores/transferStore'
import { compareEntries, diffKey, getDwRelativeTail } from '../utils/compareEntries'
import AddEnvModal from './AddEnvModal'
import CompareToolbar from './CompareToolbar'
import ContextMenu from './ContextMenu'
import FileList from './FileList'
import PaneHeader from './PaneHeader'

interface ContextMenuState {
  entry: FileEntry
  x: number
  y: number
  pane: 'local' | 'remote'
}

// Map the UI's virtual remote path (rooted at '/') to the real server
// path that the DW Management API uses ('/Files/...'). The backend does
// the same normalization in dw-api.ts#normalizeRemotePath — this helper
// is purely for user-facing display and clipboard strings.
function toDisplayRemotePath(virtualPath: string): string {
  if (!virtualPath || virtualPath === '/') return '/Files/'
  return `/Files${virtualPath}`
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

function pathSegmentCount(p: string): number {
  return p.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean).length
}

function localParentPath(path: string): string {
  if (!path) return ''
  // Windows drive root (C:\, C:/, or C:) → step up to the drives view.
  if (/^[A-Za-z]:[\\/]?$/.test(path)) return ''
  // Unix root has no parent.
  if (path === '/') return '/'

  const sep = path.includes('\\') ? '\\' : '/'
  const parts = path.split(sep).filter(Boolean)
  parts.pop()

  if (parts.length === 0) {
    // Walked off a Unix path → root. Walked off a relative path → drives.
    return sep === '/' ? '/' : ''
  }
  // Drive letter alone needs a trailing separator to be listable.
  if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) {
    return parts[0] + sep
  }
  return sep === '/' ? '/' + parts.join('/') : parts.join(sep)
}

export default function DualPaneBrowser(): React.JSX.Element {
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const {
    remoteEntries,
    remotePath,
    remoteEnvName,
    localEntries,
    localPath,
    selected,
    compareMode,
    diffMap,
    highlightedStatuses,
    mirrorNav,
    loadRemote,
    loadLocal,
    setSelected,
    setCompareMode,
    setDiffMap,
    setMirrorNav,
    toggleHighlightedStatus
  } = useFileStore()
  const { addJob } = useTransferStore()
  const showToast = useToastStore((s) => s.show)

  const [remoteLoading, setRemoteLoading] = useState(false)
  const [localLoading, setLocalLoading] = useState(false)
  const [localBackStack, setLocalBackStack] = useState<string[]>([])
  const [localForwardStack, setLocalForwardStack] = useState<string[]>([])
  const [remoteBackStack, setRemoteBackStack] = useState<string[]>([])
  const [remoteForwardStack, setRemoteForwardStack] = useState<string[]>([])
  const [pathsMatch, setPathsInSync] = useState(false)
  const [localMirrorPaths, setLocalMirrorPaths] = useState<string[]>([])
  const [remoteMirrorPaths, setRemoteMirrorPaths] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showAddEnv, setShowAddEnv] = useState(false)
  const [conflictCount, setConflictCount] = useState(0)
  const [overwrite, setOverwrite] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = Number(localStorage.getItem('dw.splitRatio'))
    return Number.isFinite(saved) && saved >= 0.2 && saved <= 0.8 ? saved : 0.5
  })
  const [dragging, setDragging] = useState(false)

  function handleDividerPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!containerRef.current) return
    e.preventDefault()
    const container = containerRef.current
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setDragging(true)

    function onMove(ev: PointerEvent): void {
      const rect = container.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      const clamped = Math.min(0.8, Math.max(0.2, ratio))
      setSplitRatio(clamped)
    }
    function onUp(): void {
      target.releasePointerCapture(e.pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      setDragging(false)
      setSplitRatio((r) => {
        localStorage.setItem('dw.splitRatio', String(r))
        return r
      })
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  useEffect(() => {
    if (!activeEnv) return
    // If the store already has entries loaded for this env, don't reload on re-mount —
    // tab switches should preserve the user's current folder.
    if (remoteEnvName === activeEnv.name && remoteEntries.length > 0) return

    let cancelled = false
    setRemoteLoading(true)
    void (async () => {
      const paneResult = await window.dw.settings.getPaneState(activeEnv.name)
      if (cancelled) return
      const savedRemote = paneResult.data?.remotePath ?? '/'
      const resolvedLocal =
        paneResult.data?.localPath ?? activeEnv.localStartPath ?? (await window.dw.fs.homedir())
      await loadRemote(activeEnv.name, savedRemote)
      if (cancelled) return
      if (resolvedLocal && resolvedLocal !== useFileStore.getState().localPath) {
        setLocalLoading(true)
        const ok = await loadLocal(resolvedLocal, activeEnv.name)
        if (!ok && !cancelled) {
          const home = await window.dw.fs.homedir()
          if (home && home !== resolvedLocal) await loadLocal(home, activeEnv.name)
        }
        if (!cancelled) setLocalLoading(false)
      }
    })().finally(() => {
      if (!cancelled) setRemoteLoading(false)
    })
    return () => {
      cancelled = true
    }
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

  useEffect(() => {
    const localTail = getDwRelativeTail(localPath)
    const remoteTail = getDwRelativeTail(toDisplayRemotePath(remotePath))
    const tailsMatch = !!(localTail && remoteTail && localTail === remoteTail)
    setPathsInSync(tailsMatch)

    if (compareMode === 'off') {
      setDiffMap(new Map())
      return
    }
    if (compareMode === 'on' || tailsMatch) {
      setDiffMap(compareEntries(localEntries, remoteEntries))
    } else {
      setDiffMap(new Map())
    }
  }, [compareMode, localEntries, remoteEntries, localPath, remotePath, setDiffMap])

  const mirrorCandidateKeys = useMemo(() => {
    if (!pathsMatch || !mirrorNav) return null
    if (diffMap.size > 0) {
      const keys = new Set<string>()
      for (const [key, status] of diffMap) {
        if (status === 'identical' || status === 'different') keys.add(key)
      }
      return keys
    }
    // Compare is off — compute folder matches directly from entries
    const remoteKeys = new Set(remoteEntries.filter((e) => e.type === 'directory').map((e) => diffKey(e)))
    const keys = new Set<string>()
    for (const e of localEntries) {
      if (e.type === 'directory' && remoteKeys.has(diffKey(e))) keys.add(diffKey(e))
    }
    return keys
  }, [diffMap, pathsMatch, mirrorNav, localEntries, remoteEntries])

  // User-initiated navigation: push the current path onto back, clear forward.
  async function navigateLocalTo(path: string): Promise<void> {
    if (path === localPath) return
    setLocalBackStack((b) => [localPath, ...b])
    setLocalForwardStack([])
    setLocalLoading(true)
    await loadLocal(path)
    setLocalLoading(false)
  }

  // Back/forward use the history stacks rather than the parent path.
  async function goBackLocal(): Promise<void> {
    setLocalBackStack((b) => {
      if (b.length === 0) return b
      const [prev, ...rest] = b
      setLocalForwardStack((f) => [localPath, ...f])
      setLocalLoading(true)
      void loadLocal(prev).finally(() => setLocalLoading(false))
      return rest
    })
  }

  async function goForwardLocal(): Promise<void> {
    setLocalForwardStack((f) => {
      if (f.length === 0) return f
      const [next, ...rest] = f
      setLocalBackStack((b) => [localPath, ...b])
      setLocalLoading(true)
      void loadLocal(next).finally(() => setLocalLoading(false))
      return rest
    })
  }

  async function navigateRemoteTo(path: string): Promise<void> {
    if (!activeEnv || path === remotePath) return
    setRemoteBackStack((b) => [remotePath, ...b])
    setRemoteForwardStack([])
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, path)
    setRemoteLoading(false)
  }

  async function goBackRemote(): Promise<void> {
    if (!activeEnv) return
    setRemoteBackStack((b) => {
      if (b.length === 0) return b
      const [prev, ...rest] = b
      setRemoteForwardStack((f) => [remotePath, ...f])
      setRemoteLoading(true)
      void loadRemote(activeEnv.name, prev).finally(() => setRemoteLoading(false))
      return rest
    })
  }

  async function goForwardRemote(): Promise<void> {
    if (!activeEnv) return
    setRemoteForwardStack((f) => {
      if (f.length === 0) return f
      const [next, ...rest] = f
      setRemoteBackStack((b) => [remotePath, ...b])
      setRemoteLoading(true)
      void loadRemote(activeEnv.name, next).finally(() => setRemoteLoading(false))
      return rest
    })
  }

  async function navigateLocal(entry: FileEntry): Promise<void> {
    if (entry.type !== 'directory') return
    await navigateLocalTo(entry.path)
    if (activeEnv && mirrorCandidateKeys?.has(diffKey(entry))) {
      const remoteTarget = remotePath === '/' ? `/${entry.name}` : `${remotePath}/${entry.name}`
      await navigateRemoteTo(remoteTarget)
    }
  }

  async function navigateRemote(entry: FileEntry): Promise<void> {
    if (!activeEnv || entry.type !== 'directory') return
    await navigateRemoteTo(entry.path)
    if (mirrorCandidateKeys?.has(diffKey(entry))) {
      const sep = localPath.includes('\\') ? '\\' : '/'
      const localTarget = localPath ? `${localPath}${sep}${entry.name}` : entry.name
      await navigateLocalTo(localTarget)
    }
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

  async function handleDelete(paths: string[]): Promise<void> {
    if (!activeEnv || paths.length === 0) return
    setRemoteLoading(true)
    for (const p of paths) {
      const result = await window.dw.files.delete(activeEnv.name, p)
      if (!result.ok) {
        showToast(result.error ?? `Failed to delete ${p}`, 'error')
      }
    }
    await loadRemote(activeEnv.name, remotePath)
    setRemoteLoading(false)
    setSelected('remote', [])
  }

  async function handleRename(filePath: string, newName: string): Promise<void> {
    if (!activeEnv) return
    const result = await window.dw.files.rename(activeEnv.name, filePath, newName)
    if (!result.ok) {
      showToast(result.error ?? 'Rename failed', 'error')
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {activeEnv && (
        <CompareToolbar
          mode={compareMode}
          onModeChange={setCompareMode}
          diffMap={diffMap}
          highlightedStatuses={highlightedStatuses}
          onToggleStatus={toggleHighlightedStatus}
          mirrorNav={mirrorNav}
          onMirrorNavChange={setMirrorNav}
        />
      )}
    <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Local pane */}
      <div
        onMouseDown={(e) => {
          if (e.button === 3 && localBackStack.length > 0) { e.preventDefault(); void goBackLocal() }
          if (e.button === 4 && localForwardStack.length > 0) { e.preventDefault(); void goForwardLocal() }
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexBasis: `${splitRatio * 100}%`,
          flexGrow: 0,
          flexShrink: 0,
          overflow: 'hidden',
          background: 'var(--pane-bg)'
        }}
      >
        <PaneHeader
          path={localPath}
          label="Local"
          onNavigateUp={() => {
            void navigateLocalTo(localParentPath(localPath))
            if (mirrorNav && pathsMatch) void navigateRemoteTo(parentPath(remotePath))
          }}
          onRefresh={() => {
            void loadLocal(localPath)
            if (mirrorNav && pathsMatch && activeEnv) {
              setRemoteLoading(true)
              void loadRemote(activeEnv.name, remotePath).finally(() => setRemoteLoading(false))
            }
          }}
          onNavigateTo={(p) => {
            const steps = pathSegmentCount(localPath) - pathSegmentCount(p)
            void navigateLocalTo(p)
            if (mirrorNav && pathsMatch && steps > 0) {
              let remoteTarget = remotePath
              for (let i = 0; i < steps; i++) remoteTarget = parentPath(remoteTarget)
              void navigateRemoteTo(remoteTarget)
            }
          }}
          actions={
            localSelected.length > 1 ? (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{localSelected.length} selected</span>
            ) : undefined
          }
        />
        <FileList
          diffMap={diffMap}
          dropTarget
          entries={localEntries}
          highlightedStatuses={highlightedStatuses}
          loading={localLoading}
          onContextMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'local' })}
          onDoubleClick={(entry) => void navigateLocal(entry)}
          onDropOnPane={(paths) => void handleDownload(paths)}
          onSelect={(paths) => {
            setSelected('local', paths)
            if (mirrorNav && pathsMatch) {
              const names = new Set(paths.map((p) => p.split(/[\\/]/).pop() ?? ''))
              setRemoteMirrorPaths(remoteEntries.filter((e) => e.type === 'directory' && names.has(e.name)).map((e) => e.path))
            } else {
              setRemoteMirrorPaths([])
            }
            setLocalMirrorPaths([])
          }}
          pane="local"
          selected={localMirrorPaths.length > 0 ? [...localSelected, ...localMirrorPaths] : localSelected}
          syncCandidates={mirrorCandidateKeys ?? undefined}
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

      {/* Divider */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · Double-click to reset"
        onPointerDown={handleDividerPointerDown}
        onDoubleClick={() => {
          setSplitRatio(0.5)
          localStorage.setItem('dw.splitRatio', '0.5')
        }}
        style={{
          flex: '0 0 4px',
          cursor: 'col-resize',
          background: dragging ? 'var(--accent)' : 'var(--border)',
          transition: dragging ? 'none' : 'background 120ms ease',
          position: 'relative',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          if (!dragging) (e.currentTarget as HTMLElement).style.background = 'var(--border-strong)'
        }}
        onMouseLeave={(e) => {
          if (!dragging) (e.currentTarget as HTMLElement).style.background = 'var(--border)'
        }}
      />

      {/* Remote pane */}
      <div
        onMouseDown={(e) => {
          if (e.button === 3 && activeEnv && remoteBackStack.length > 0) { e.preventDefault(); void goBackRemote() }
          if (e.button === 4 && activeEnv && remoteForwardStack.length > 0) { e.preventDefault(); void goForwardRemote() }
        }}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--pane-bg)' }}
      >
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
              path={toDisplayRemotePath(remotePath)}
              label={envLabel(activeEnv)}
              sublabel={activeEnv.host}
              onNavigateUp={() => {
                void navigateRemoteTo(parentPath(remotePath))
                if (mirrorNav && pathsMatch) void navigateLocalTo(localParentPath(localPath))
              }}
              onRefresh={() => {
                setRemoteLoading(true)
                void loadRemote(activeEnv.name, remotePath).finally(() => setRemoteLoading(false))
                if (mirrorNav && pathsMatch) void loadLocal(localPath)
              }}
              onNavigateTo={(displayPath) => {
                const virtual = displayPath.replace(/^\/Files/, '') || '/'
                const steps = pathSegmentCount(remotePath) - pathSegmentCount(virtual)
                void navigateRemoteTo(virtual)
                if (mirrorNav && pathsMatch && steps > 0) {
                  let localTarget = localPath
                  for (let i = 0; i < steps; i++) localTarget = localParentPath(localTarget)
                  void navigateLocalTo(localTarget)
                }
              }}
              actions={
                remoteSelected.length > 1 ? (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{remoteSelected.length} selected</span>
                ) : undefined
              }
            />
            <FileList
              diffMap={diffMap}
              dropTarget
              entries={remoteEntries}
              highlightedStatuses={highlightedStatuses}
              loading={remoteLoading}
              onContextMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'remote' })}
              onDoubleClick={(entry) => void navigateRemote(entry)}
              onDropIntoDir={(paths, targetDir) => void handleUpload(paths, targetDir.path)}
              onDropOnPane={(paths) => void handleUpload(paths, remotePath)}
              onSelect={(paths) => {
                setSelected('remote', paths)
                if (mirrorNav && pathsMatch) {
                  const names = new Set(paths.map((p) => p.split('/').pop() ?? ''))
                  setLocalMirrorPaths(localEntries.filter((e) => e.type === 'directory' && names.has(e.name)).map((e) => e.path))
                } else {
                  setLocalMirrorPaths([])
                }
                setRemoteMirrorPaths([])
              }}
              pane="remote"
              selected={remoteMirrorPaths.length > 0 ? [...remoteSelected, ...remoteMirrorPaths] : remoteSelected}
              syncCandidates={mirrorCandidateKeys ?? undefined}
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
      </div>

      {/* Context menu */}
      {contextMenu && (() => {
        // When right-clicking an entry that's part of the current selection in the same pane,
        // act on the whole selection. Otherwise act on just the clicked entry.
        const selectionPaths = selected.pane === contextMenu.pane ? selected.paths : []
        const targetPaths =
          selectionPaths.includes(contextMenu.entry.path) && selectionPaths.length > 1
            ? selectionPaths
            : [contextMenu.entry.path]
        return (
          <ContextMenu
            entry={contextMenu.entry}
            targetCount={targetPaths.length}
            hasActiveEnv={!!activeEnv}
            onClose={() => setContextMenu(null)}
            onCopyPath={() =>
              void navigator.clipboard.writeText(
                contextMenu.pane === 'remote'
                  ? toDisplayRemotePath(contextMenu.entry.path)
                  : contextMenu.entry.path
              )
            }
            onDelete={() => void handleDelete(targetPaths)}
            onRename={(newName) => void handleRename(contextMenu.entry.path, newName)}
            onDownload={() => void handleDownload(targetPaths)}
            onReveal={() => void handleReveal(contextMenu.entry.path)}
            onUpload={() => void handleUpload(targetPaths, remotePath)}
            pane={contextMenu.pane}
            x={contextMenu.x}
            y={contextMenu.y}
          />
        )
      })()}
    </div>
  )
}
