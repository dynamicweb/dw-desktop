import { nanoid } from 'nanoid'
import { useEffect, useMemo, useRef, useState } from 'react'
import { envLabel, type FileEntry } from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'
import { useFileStore } from '../stores/fileStore'
import { useToastStore } from '../stores/toastStore'
import { useTransferStore } from '../stores/transferStore'
import { compareEntries, countByStatus, diffKey, getDwRelativeTail } from '../utils/compareEntries'
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

// Last path segment, splitting on BOTH separators — a Windows path
// (C:\a\b.txt) has no '/', so splitting on '/' alone returns the whole string
// and never the file name.
function baseName(p: string): string {
  return p.split(/[/\\]/).pop() || p
}

function pathSegmentCount(p: string): number {
  return p.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean)
    .length
}

function localParentPath(path: string): string {
  if (!path) return ''
  // Windows drive root (C:\, C:/, or C:) → step up to the drives view.
  if (/^[A-Za-z]:[\\/]?$/.test(path)) return ''
  // Unix root has no parent.
  if (path === '/') return '/'

  // Prefer backslash as sep if present; otherwise forward slash.
  const sep = path.includes('\\') ? '\\' : '/'
  // Split on either separator so forward-slash Windows paths (D:/a/b) work too.
  const parts = path.split(/[/\\]/).filter(Boolean)
  parts.pop()

  if (parts.length === 0) {
    return sep === '/' ? '/' : ''
  }
  // Drive letter alone needs a trailing separator to be listable.
  if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) {
    return parts[0] + sep
  }
  // Detect Windows by drive letter — NOT by separator — so D:/a/b is handled correctly.
  const isWindows = /^[A-Za-z]:/.test(path)
  return isWindows ? parts.join(sep) : '/' + parts.join('/')
}

export default function DualPaneBrowser(): React.JSX.Element {
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const {
    remoteEntries,
    remotePath,
    remoteEnvName,
    remoteError,
    remoteTotalCount,
    remoteHasMore,
    remoteLoadedAll,
    localEntries,
    localPath,
    selected,
    compareMode,
    diffMap,
    highlightedStatuses,
    mirrorNav,
    loadRemote,
    loadAllRemote,
    refreshRemote,
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
  const [filterActive, setFilterActive] = useState(false)
  const [localMirrorPaths, setLocalMirrorPaths] = useState<string[]>([])
  const [remoteMirrorPaths, setRemoteMirrorPaths] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showAddEnv, setShowAddEnv] = useState(false)
  const [conflictCount, setConflictCount] = useState(0)
  const [overwrite, setOverwrite] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [pendingUpload, setPendingUpload] = useState<{
    localPaths: string[]
    targetRemotePath: string
    conflicts: number
    total: number
  } | null>(null)

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
      const connected = await loadRemote(activeEnv.name, savedRemote)
      if (cancelled) return
      if (!connected) {
        showToast(
          `Couldn't connect to ${envLabel(activeEnv)}: ${useFileStore.getState().remoteError ?? 'unknown error'}`,
          'error'
        )
      }
      const norm = (p: string): string => p.replace(/\\/g, '/')
      if (resolvedLocal && norm(resolvedLocal) !== norm(useFileStore.getState().localPath)) {
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
    const conflicts = selected.paths.filter((p) => remoteNames.has(baseName(p)))
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
    // A partial remote listing (only the first page loaded) would produce
    // misleading diffs — every unloaded remote file makes its local counterpart
    // look "local-only". Suppress comparison until the folder is fully loaded;
    // the remote-pane banner tells the user why and offers "Load all".
    if (remoteHasMore) {
      setDiffMap(new Map())
      return
    }
    // 'auto' = match-only: compare only when the two panes' folder paths line up.
    // 'on' = compare whatever is in the panes regardless of paths (comparing
    // different folder structures is a valid use case; it just surfaces more
    // local-only/remote-only entries). Folder-path matching otherwise gates only
    // mirror navigation, not comparison.
    if (compareMode === 'auto' && !tailsMatch) {
      setDiffMap(new Map())
      return
    }
    setDiffMap(compareEntries(localEntries, remoteEntries))
  }, [compareMode, localEntries, remoteEntries, localPath, remotePath, remoteHasMore, setDiffMap])

  const mirrorActiveRef = useRef(false)
  useEffect(() => {
    if (localLoading || remoteLoading) return
    const active = mirrorNav && pathsMatch
    if (active && !mirrorActiveRef.current) {
      setLocalBackStack([])
      setLocalForwardStack([])
      setRemoteBackStack([])
      setRemoteForwardStack([])
    }
    mirrorActiveRef.current = active
  }, [mirrorNav, pathsMatch, localLoading, remoteLoading])

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
    const remoteKeys = new Set(
      remoteEntries.filter((e) => e.type === 'directory').map((e) => diffKey(e))
    )
    const keys = new Set<string>()
    for (const e of localEntries) {
      if (e.type === 'directory' && remoteKeys.has(diffKey(e))) keys.add(diffKey(e))
    }
    return keys
  }, [diffMap, pathsMatch, mirrorNav, localEntries, remoteEntries])

  // User-initiated navigation: push the current path onto back, clear forward.
  const normLocal = (p: string): string => p.replace(/\\/g, '/')

  async function navigateLocalTo(path: string): Promise<boolean> {
    if (normLocal(path) === normLocal(localPath)) return true
    setLocalBackStack((b) =>
      normLocal(b[0] ?? '') === normLocal(localPath) ? b : [localPath, ...b]
    )
    setLocalForwardStack([])
    setLocalLoading(true)
    const ok = await loadLocal(path)
    setLocalLoading(false)
    return ok
  }

  // Back/forward use the history stacks rather than the parent path.
  async function goBackLocal(): Promise<void> {
    if (localBackStack.length === 0) return
    const [prev, ...rest] = localBackStack
    setLocalBackStack(rest)
    setLocalForwardStack((f) =>
      normLocal(f[0] ?? '') === normLocal(localPath) ? f : [localPath, ...f]
    )
    setLocalLoading(true)
    await loadLocal(prev)
    setLocalLoading(false)
  }

  async function goForwardLocal(): Promise<void> {
    if (localForwardStack.length === 0) return
    const [next, ...rest] = localForwardStack
    setLocalForwardStack(rest)
    setLocalBackStack((b) =>
      normLocal(b[0] ?? '') === normLocal(localPath) ? b : [localPath, ...b]
    )
    setLocalLoading(true)
    await loadLocal(next)
    setLocalLoading(false)
  }

  async function navigateRemoteTo(path: string): Promise<void> {
    if (!activeEnv || path === remotePath) return
    setRemoteBackStack((b) => (b[0] === remotePath ? b : [remotePath, ...b]))
    setRemoteForwardStack([])
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, path)
    setRemoteLoading(false)
  }

  async function goBackRemote(): Promise<void> {
    if (!activeEnv || remoteBackStack.length === 0) return
    const [prev, ...rest] = remoteBackStack
    setRemoteBackStack(rest)
    setRemoteForwardStack((f) => (f[0] === remotePath ? f : [remotePath, ...f]))
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, prev)
    setRemoteLoading(false)
  }

  async function goForwardRemote(): Promise<void> {
    if (!activeEnv || remoteForwardStack.length === 0) return
    const [next, ...rest] = remoteForwardStack
    setRemoteForwardStack(rest)
    setRemoteBackStack((b) => (b[0] === remotePath ? b : [remotePath, ...b]))
    setRemoteLoading(true)
    await loadRemote(activeEnv.name, next)
    setRemoteLoading(false)
  }

  function matchRemoteToLocal(): void {
    if (localLoading || remoteLoading) return
    // Navigate remote to match local's /Files/… path — extract original-cased segments
    const norm = localPath.replace(/\\/g, '/')
    const parts = norm.split('/')
    const filesIdx = parts.findIndex((s) => s.toLowerCase() === 'files')
    if (filesIdx === -1) return
    const relParts = parts.slice(filesIdx + 1).filter(Boolean)
    void navigateRemoteTo(relParts.length > 0 ? '/' + relParts.join('/') : '/')
  }

  function getLocalFilesBase(): { base: string; sep: string } | null {
    // Try current localPath first, then fall back to localStartPath from env settings
    for (const candidate of [localPath, activeEnv?.localStartPath ?? '']) {
      if (!candidate) continue
      const norm = candidate.replace(/\\/g, '/')
      const parts = norm.split('/')
      const idx = parts.findIndex((s) => s.toLowerCase() === 'files')
      const sep = candidate.includes('\\') ? '\\' : '/'
      let base: string
      if (idx !== -1) {
        base = parts.slice(0, idx + 1).join('/')
      } else if (candidate === (activeEnv?.localStartPath ?? '')) {
        // localStartPath doesn't include a Files segment — treat it as the parent and append Files
        base = norm.replace(/\/$/, '') + '/Files'
      } else {
        continue
      }
      return { base: sep === '\\' ? base.replace(/\//g, '\\') : base, sep }
    }
    return null
  }

  function getFilesRelativeParts(p: string): string[] | null {
    const norm = p.replace(/\\/g, '/')
    const parts = norm.split('/')
    const idx = parts.findIndex((s) => s.toLowerCase() === 'files')
    if (idx === -1) return null
    return parts.slice(idx + 1).filter(Boolean)
  }

  function matchLocalToRemote(): void {
    if (localLoading || remoteLoading) return
    const filesBase = getLocalFilesBase()
    if (!filesBase) return
    const { base, sep } = filesBase
    const relParts = remotePath.split('/').filter(Boolean)
    const newLocal = base + (relParts.length > 0 ? sep + relParts.join(sep) : '')
    const fallback = activeEnv?.localStartPath ?? base
    void (async () => {
      const ok = await navigateLocalTo(newLocal)
      if (!ok && normLocal(newLocal) !== normLocal(fallback)) {
        void navigateLocalTo(fallback)
      }
    })()
  }

  async function navigateLocal(entry: FileEntry): Promise<void> {
    if (entry.type !== 'directory') return
    const isMirror = !!(activeEnv && mirrorCandidateKeys?.has(diffKey(entry)))
    await navigateLocalTo(entry.path)
    if (isMirror) {
      // Use the actual remote folder name to handle case differences (e.g. Scripts vs scripts)
      const remoteMatch = remoteEntries.find(
        (e) => e.type === 'directory' && e.name.toLowerCase() === entry.name.toLowerCase()
      )
      const name = remoteMatch?.name ?? entry.name
      const remoteTarget = remotePath === '/' ? `/${name}` : `${remotePath}/${name}`
      await navigateRemoteTo(remoteTarget)
    }
  }

  async function navigateRemote(entry: FileEntry): Promise<void> {
    if (!activeEnv || entry.type !== 'directory') return
    const isMirror = mirrorCandidateKeys?.has(diffKey(entry)) ?? false
    await navigateRemoteTo(entry.path)
    if (isMirror) {
      // Use the actual local folder name to handle case differences
      const localMatch = localEntries.find(
        (e) => e.type === 'directory' && e.name.toLowerCase() === entry.name.toLowerCase()
      )
      const sep = localPath.includes('\\') ? '\\' : '/'
      const name = localMatch?.name ?? entry.name
      const localTarget = localPath ? `${localPath}${sep}${name}` : name
      await navigateLocalTo(localTarget)
    }
  }

  function startUpload(
    localPaths: string[],
    targetRemotePath: string,
    overwriteFiles: boolean
  ): void {
    if (!activeEnv) return
    const batchId = nanoid()
    for (const p of localPaths) {
      const jobId = nanoid()
      addJob({
        id: jobId,
        batchId,
        direction: 'upload',
        label: baseName(p),
        remotePath: targetRemotePath,
        localPath: p,
        status: 'queued',
        transferred: 0,
        total: 1
      })
      window.dw.files.upload(activeEnv.name, [p], targetRemotePath, overwriteFiles, jobId)
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
    // We can only detect name conflicts when dropping into the folder currently
    // shown in the remote pane AND it's fully loaded. Otherwise (a subfolder
    // drop, or a partially-loaded folder) we can't see what's there \u2014 default to
    // overwrite so updates land instead of being silently skipped.
    const canDetect = targetRemotePath === remotePath && !remoteHasMore
    if (canDetect) {
      const remoteNames = new Set(remoteEntries.map((e) => e.name))
      const conflicts = localPaths.filter((p) => remoteNames.has(baseName(p)))
      if (conflicts.length > 0) {
        // Ask before overwriting \u2014 most uploads mean to update, so Replace is the
        // default, but skipping (and cancelling) stays available.
        setPendingUpload({
          localPaths,
          targetRemotePath,
          conflicts: conflicts.length,
          total: localPaths.length
        })
        return
      }
      startUpload(localPaths, targetRemotePath, false) // nothing to overwrite
      return
    }
    startUpload(localPaths, targetRemotePath, true)
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

  const isLoading = localLoading || remoteLoading
  const mirrorActive = mirrorNav && pathsMatch
  const stableMirrorActiveRef = useRef(mirrorActive)
  if (!isLoading) stableMirrorActiveRef.current = mirrorActive
  const stableMirrorActive = isLoading ? stableMirrorActiveRef.current : mirrorActive

  const localOnFiles = !!getDwRelativeTail(localPath)
  const remoteOnFiles =
    !!getDwRelativeTail(toDisplayRemotePath(remotePath)) &&
    (!!getDwRelativeTail(localPath) || !!activeEnv?.localStartPath)

  const [matchLocalExists, setMatchLocalExists] = useState(true)
  useEffect(() => {
    if (!remoteOnFiles) {
      setMatchLocalExists(true)
      return
    }
    const filesBase = getLocalFilesBase()
    if (!filesBase) {
      setMatchLocalExists(false)
      return
    }
    const { base, sep } = filesBase
    const relParts = remotePath.split('/').filter(Boolean)
    const target = base + (relParts.length > 0 ? sep + relParts.join(sep) : '')
    let cancelled = false
    void window.dw.fs.list(target).then((r) => {
      if (!cancelled) setMatchLocalExists(r.ok)
    })
    return () => {
      cancelled = true
    }
  }, [remotePath, localPath, activeEnv?.name, remoteOnFiles])

  const diffCounts = countByStatus(diffMap)
  const localFilterStatuses = highlightedStatuses.filter(
    (s) => s !== 'remote-only' && diffCounts[s] > 0
  )
  const remoteFilterStatuses = highlightedStatuses.filter(
    (s) => s !== 'local-only' && diffCounts[s] > 0
  )
  const visibleLocalEntries =
    filterActive && diffMap.size > 0 && localFilterStatuses.length > 0
      ? localEntries.filter((e) => {
          const s = diffMap.get(diffKey(e))
          return s !== undefined && localFilterStatuses.includes(s)
        })
      : localEntries
  const visibleRemoteEntries =
    filterActive && diffMap.size > 0 && remoteFilterStatuses.length > 0
      ? remoteEntries.filter((e) => {
          const s = diffMap.get(diffKey(e))
          return s !== undefined && remoteFilterStatuses.includes(s)
        })
      : remoteEntries

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
          pathsMatch={pathsMatch}
          filterActive={filterActive}
          onFilterChange={setFilterActive}
          localOnFiles={localOnFiles}
          remoteOnFiles={remoteOnFiles}
          matchLocalPathExists={matchLocalExists}
          onMatchRemoteToLocal={matchRemoteToLocal}
          onMatchLocalToRemote={matchLocalToRemote}
          isLoading={localLoading || remoteLoading}
          rightSlot={
            remoteHasMore || remoteLoadedAll ? (
              remoteHasMore ? (
                <>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0
                    }}
                    title={`Uploads here overwrite matching files${compareMode !== 'off' ? '. Compare is paused until all items load.' : '.'}`}
                  >
                    Showing first {remoteEntries.length.toLocaleString()} of{' '}
                    {remoteTotalCount.toLocaleString()} ·{' '}
                    <span style={{ color: 'var(--warning)' }}>uploads overwrite</span>
                    {compareMode !== 'off' ? ' · compare paused' : ''}
                  </span>
                  <button
                    type="button"
                    className="toolbar-btn"
                    disabled={loadingAll}
                    onClick={() => {
                      setLoadingAll(true)
                      void loadAllRemote().finally(() => setLoadingAll(false))
                    }}
                    style={{
                      flexShrink: 0,
                      height: 22,
                      padding: '0 8px',
                      fontSize: 10,
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text)',
                      cursor: loadingAll ? 'default' : 'pointer',
                      opacity: loadingAll ? 0.6 : 1,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {loadingAll ? 'Loading…' : `Load all ${remoteTotalCount.toLocaleString()}`}
                  </button>
                </>
              ) : (
                <>
                  <span
                    style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                    title="Large folders may be slow to render."
                  >
                    Showing all {remoteTotalCount.toLocaleString()} items
                  </span>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => {
                      setRemoteLoading(true)
                      void loadRemote(activeEnv.name, remotePath).finally(() =>
                        setRemoteLoading(false)
                      )
                    }}
                    style={{
                      flexShrink: 0,
                      height: 22,
                      padding: '0 8px',
                      fontSize: 10,
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Show first page only
                  </button>
                </>
              )
            ) : null
          }
        />
      )}
      <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Local pane */}
        <div
          onMouseDown={(e) => {
            if (e.button === 3) {
              e.preventDefault()
              void goBackLocal()
              if (mirrorNav && pathsMatch) void goBackRemote()
            }
            if (e.button === 4 && localForwardStack.length > 0) {
              e.preventDefault()
              void goForwardLocal()
              if (mirrorNav && pathsMatch) void goForwardRemote()
            }
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
            mirrorActive={stableMirrorActive}
            mirrorAccent="var(--accent)"
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
              const localTarget = p === '' || p === '/' ? '' : p
              void navigateLocalTo(localTarget)
              if (mirrorNav) {
                const relParts = getFilesRelativeParts(localTarget)
                if (relParts !== null) {
                  void navigateRemoteTo(relParts.length > 0 ? '/' + relParts.join('/') : '/')
                }
              }
            }}
            actions={
              localSelected.length > 1 ? (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {localSelected.length} selected
                </span>
              ) : undefined
            }
          />
          <FileList
            diffMap={diffMap}
            dropTarget
            entries={visibleLocalEntries}
            highlightedStatuses={highlightedStatuses}
            loading={localLoading}
            onContextMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'local' })}
            onDoubleClick={(entry) => void navigateLocal(entry)}
            onDropOnPane={(paths) => void handleDownload(paths)}
            onSelect={(paths) => {
              setSelected('local', paths)
              if (mirrorNav && pathsMatch) {
                const names = new Set(
                  paths.map((p) => (p.split(/[\\/]/).pop() ?? '').toLowerCase())
                )
                setRemoteMirrorPaths(
                  remoteEntries
                    .filter((e) => e.type === 'directory' && names.has(e.name.toLowerCase()))
                    .map((e) => e.path)
                )
              } else {
                setRemoteMirrorPaths([])
              }
              setLocalMirrorPaths([])
            }}
            pane="local"
            selected={
              localMirrorPaths.length > 0 ? [...localSelected, ...localMirrorPaths] : localSelected
            }
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
              const osPaths = Array.from(e.dataTransfer.files).map((f) =>
                window.dw.fs.getPathForFile(f)
              )
              if (osPaths.length > 0) {
                void handleUpload(osPaths.filter(Boolean), remotePath)
              }
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')
            }
          >
            Drop files here or{' '}
            <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
              click to browse
            </span>
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
            if (!dragging)
              (e.currentTarget as HTMLElement).style.background = 'var(--border-strong)'
          }}
          onMouseLeave={(e) => {
            if (!dragging) (e.currentTarget as HTMLElement).style.background = 'var(--border)'
          }}
        />

        {/* Remote pane */}
        <div
          onMouseDown={(e) => {
            if (e.button === 3 && activeEnv) {
              e.preventDefault()
              void goBackRemote()
              if (mirrorNav && pathsMatch) void goBackLocal()
            }
            if (e.button === 4 && activeEnv && remoteForwardStack.length > 0) {
              e.preventDefault()
              void goForwardRemote()
              if (mirrorNav && pathsMatch) void goForwardLocal()
            }
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
            background: 'var(--pane-bg)'
          }}
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
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = 'var(--accent)')
                  }
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
                mirrorActive={stableMirrorActive}
                upDisabled={remotePath === '/'}
                onNavigateUp={() => {
                  void navigateRemoteTo(parentPath(remotePath))
                  if (mirrorNav && pathsMatch) void navigateLocalTo(localParentPath(localPath))
                }}
                onRefresh={() => {
                  setRemoteLoading(true)
                  void refreshRemote().finally(() => setRemoteLoading(false))
                  if (mirrorNav && pathsMatch) void loadLocal(localPath)
                }}
                onNavigateTo={(displayPath) => {
                  const virtual = displayPath.replace(/^\/Files/, '') || '/'
                  void navigateRemoteTo(virtual)
                  if (mirrorNav) {
                    const filesBase = getLocalFilesBase()
                    if (filesBase) {
                      const { base, sep } = filesBase
                      const relParts = virtual.split('/').filter(Boolean)
                      void navigateLocalTo(
                        base + (relParts.length > 0 ? sep + relParts.join(sep) : '')
                      )
                    } else if (pathsMatch) {
                      const steps = pathSegmentCount(remotePath) - pathSegmentCount(virtual)
                      if (steps > 0) {
                        let localTarget = localPath
                        for (let i = 0; i < steps; i++) localTarget = localParentPath(localTarget)
                        void navigateLocalTo(localTarget)
                      }
                    }
                  }
                }}
                actions={
                  remoteSelected.length > 1 ? (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {remoteSelected.length} selected
                    </span>
                  ) : undefined
                }
              />
              {remoteError && !remoteLoading && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '8px 12px',
                    background: 'var(--danger-surface, rgba(220, 53, 69, 0.08))',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--danger)',
                    fontSize: 11,
                    lineHeight: 1.4
                  }}
                >
                  <span style={{ flexShrink: 0, fontWeight: 600 }}>⚠</span>
                  <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                    Couldn’t load remote files. {remoteError}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRemoteLoading(true)
                      void refreshRemote().finally(() => setRemoteLoading(false))
                    }}
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      padding: '1px 8px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text)',
                      cursor: 'pointer'
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
              <FileList
                diffMap={diffMap}
                dropTarget
                entries={visibleRemoteEntries}
                highlightedStatuses={highlightedStatuses}
                loading={remoteLoading}
                onContextMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'remote' })}
                onDoubleClick={(entry) => void navigateRemote(entry)}
                onDropIntoDir={(paths, targetDir) => void handleUpload(paths, targetDir.path)}
                onDropOnPane={(paths) => void handleUpload(paths, remotePath)}
                onSelect={(paths) => {
                  setSelected('remote', paths)
                  if (mirrorNav && pathsMatch) {
                    const names = new Set(
                      paths.map((p) => (p.split('/').pop() ?? '').toLowerCase())
                    )
                    setLocalMirrorPaths(
                      localEntries
                        .filter((e) => e.type === 'directory' && names.has(e.name.toLowerCase()))
                        .map((e) => e.path)
                    )
                  } else {
                    setLocalMirrorPaths([])
                  }
                  setRemoteMirrorPaths([])
                }}
                pane="remote"
                selected={
                  remoteMirrorPaths.length > 0
                    ? [...remoteSelected, ...remoteMirrorPaths]
                    : remoteSelected
                }
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
      {contextMenu &&
        (() => {
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

      {pendingUpload && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setPendingUpload(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              padding: 20,
              width: 440,
              maxWidth: '90%',
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)'
            }}
          >
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 8px' }}>
              {pendingUpload.conflicts} of {pendingUpload.total}{' '}
              {pendingUpload.total === 1 ? 'file' : 'files'} already{' '}
              {pendingUpload.conflicts === 1 ? 'exists' : 'exist'} in this folder.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Replace the existing {pendingUpload.conflicts === 1 ? 'file' : 'files'}, or skip and
              upload only new files?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPendingUpload(null)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-strong)',
                  background: 'transparent',
                  color: 'var(--text-subtle)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = pendingUpload
                  setPendingUpload(null)
                  startUpload(p.localPaths, p.targetRemotePath, false)
                }}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-raised)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                Skip existing
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const p = pendingUpload
                  setPendingUpload(null)
                  startUpload(p.localPaths, p.targetRemotePath, true)
                }}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--accent)',
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Replace all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
