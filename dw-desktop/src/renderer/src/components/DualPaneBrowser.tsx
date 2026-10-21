import { useEffect, useMemo, useRef, useState } from 'react'
import {
  envKind,
  envKindLabel,
  envLabel,
  type CompareMode,
  type DiffStatus,
  type FileEntry
} from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'
import { useFileStore } from '../stores/fileStore'
import { useToastStore } from '../stores/toastStore'
import { startDownload, startUpload } from '../stores/transferStore'
import { useUiStore } from '../stores/uiStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { compareEntries, countByStatus, diffKey, getDwRelativeTail } from '../utils/compareEntries'
import type { SortState } from '../utils/format'
import { fromDisplayRemotePath, toDisplayRemotePath, validateName } from '../utils/paths'
import ContextMenu from './ContextMenu'
import { PromptDialog } from './Dialog'
import FileList, { type Pane } from './FileList'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FolderPlusIcon,
  GlobeIcon,
  LinkIcon,
  MonitorIcon,
  PlusIcon,
  SearchIcon,
  SyncIcon,
  UnlinkIcon,
  UploadIcon
} from './Icons'
import PaneHeader from './PaneHeader'
import UploadConflictModal from './UploadConflictModal'

interface ContextMenuState {
  entry: FileEntry
  x: number
  y: number
  pane: Pane
}

interface PendingUpload {
  localPaths: string[]
  targetRemotePath: string
  conflictCount: number
  totalCount: number
}

type StatusFilter = 'all' | 'different' | 'local-only' | 'remote-only'

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
  return p.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean)
    .length
}

function localParentPath(path: string): string {
  if (!path) return ''
  // Windows drive root (C:\, C:/, or C:) → step up to the drives view.
  if (/^[A-Za-z]:[\\/]?$/.test(path)) return ''
  // Unix root has no parent.
  if (path === '/') return '/'
  const sep = path.includes('\\') ? '\\' : '/'
  // Split on either separator so forward-slash Windows paths (D:/a/b) work too.
  const parts = path.split(/[/\\]/).filter(Boolean)
  parts.pop()
  if (parts.length === 0) return sep === '/' ? '/' : ''
  // Drive letter alone needs a trailing separator to be listable.
  if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) return parts[0] + sep
  // Detect Windows by drive letter — NOT by separator — so D:/a/b is handled correctly.
  const isWindows = /^[A-Za-z]:/.test(path)
  return isWindows ? parts.join(sep) : '/' + parts.join('/')
}

const SORT_KEY = 'dw.sort'

function loadSort(): SortState {
  try {
    const parsed = JSON.parse(localStorage.getItem(SORT_KEY) ?? '') as SortState
    if (['name', 'size', 'modified'].includes(parsed.key)) return parsed
  } catch {
    // default below
  }
  return { key: 'name', dir: 'asc' }
}

const COMPARE_OPTIONS: { value: CompareMode; label: string }[] = [
  { value: 'auto', label: 'Compare matching folders' },
  { value: 'on', label: 'Compare any folders' },
  { value: 'off', label: 'Don’t compare' }
]

export default function DualPaneBrowser(): React.JSX.Element {
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const {
    remoteEntries,
    remotePath,
    remoteEnvName,
    remoteError,
    localEntries,
    localPath,
    selected,
    compareMode,
    diffMap,
    mirrorNav,
    loadRemote,
    refreshRemote,
    loadLocal,
    setSelected,
    setCompareMode,
    setDiffMap,
    setMirrorNav
  } = useFileStore()
  const showToast = useToastStore((s) => s.show)
  const { openAddEnv, startSync, remoteRequest } = useUiStore()
  const { pinned, togglePin, addRecent } = useWorkspaceStore()

  const [remoteLoading, setRemoteLoading] = useState(false)
  const [localLoading, setLocalLoading] = useState(false)
  const [localBackStack, setLocalBackStack] = useState<string[]>([])
  const [localForwardStack, setLocalForwardStack] = useState<string[]>([])
  const [remoteBackStack, setRemoteBackStack] = useState<string[]>([])
  const [remoteForwardStack, setRemoteForwardStack] = useState<string[]>([])
  const [pathsMatch, setPathsInSync] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSortState] = useState<SortState>(loadSort)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [moveTargets, setMoveTargets] = useState<string[] | null>(null)

  const production = !!activeEnv && envKind(activeEnv) === 'production'

  function setSort(s: SortState): void {
    setSortState(s)
    localStorage.setItem(SORT_KEY, JSON.stringify(s))
  }

  // ── Pane split ──────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = Number(localStorage.getItem('dw.splitRatio'))
    return Number.isFinite(saved) && saved >= 0.2 && saved <= 0.8 ? saved : 0.5
  })

  function handleDividerPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!containerRef.current) return
    e.preventDefault()
    const container = containerRef.current
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    function onMove(ev: PointerEvent): void {
      const rect = container.getBoundingClientRect()
      setSplitRatio(Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width)))
    }
    function onUp(): void {
      target.releasePointerCapture(e.pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      setSplitRatio((r) => {
        localStorage.setItem('dw.splitRatio', String(r))
        return r
      })
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  // ── Initial load per environment ────────────────────────────────────────────
  useEffect(() => {
    if (!activeEnv) return
    // Coming back to Browse keeps the current folder rather than reloading.
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

  // Remember visited server folders for the sidebar's Recent list.
  useEffect(() => {
    if (activeEnv && remoteEnvName === activeEnv.name && !remoteError) addRecent(remotePath)
  }, [remotePath, remoteEnvName, remoteError])

  // ── Compare ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const localTail = getDwRelativeTail(localPath)
    const remoteTail = getDwRelativeTail(toDisplayRemotePath(remotePath))
    const tailsMatch = !!(localTail && remoteTail && localTail === remoteTail)
    setPathsInSync(tailsMatch)
    // 'auto' compares only when the two panes show the same /Files/… folder;
    // 'on' compares whatever is in the panes.
    if (compareMode === 'off' || (compareMode === 'auto' && !tailsMatch)) {
      setDiffMap(new Map())
      return
    }
    setDiffMap(compareEntries(localEntries, remoteEntries))
  }, [compareMode, localEntries, remoteEntries, localPath, remotePath, setDiffMap])

  // A filter that no longer matches anything falls back to showing everything.
  const counts = countByStatus(diffMap)
  const activeFilter: StatusFilter =
    statusFilter !== 'all' && counts[statusFilter] > 0 ? statusFilter : 'all'

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

  // Folders present on both sides, which linked navigation follows.
  const mirrorCandidateKeys = useMemo(() => {
    if (!pathsMatch || !mirrorNav) return null
    const remoteKeys = new Set(remoteEntries.filter((e) => e.type === 'directory').map(diffKey))
    const keys = new Set<string>()
    for (const e of localEntries) {
      if (e.type === 'directory' && remoteKeys.has(diffKey(e))) keys.add(diffKey(e))
    }
    return keys
  }, [pathsMatch, mirrorNav, localEntries, remoteEntries])

  // ── Navigation ─────────────────────────────────────────────────────────────
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

  function getLocalFilesBase(): { base: string; sep: string } | null {
    // Try the current local folder first, then the environment's start folder.
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
        // A start folder without a Files segment is treated as the parent of Files.
        base = norm.replace(/\/$/, '') + '/Files'
      } else {
        continue
      }
      return { base: sep === '\\' ? base.replace(/\//g, '\\') : base, sep }
    }
    return null
  }

  function getFilesRelativeParts(p: string): string[] | null {
    const parts = p.replace(/\\/g, '/').split('/')
    const idx = parts.findIndex((s) => s.toLowerCase() === 'files')
    if (idx === -1) return null
    return parts.slice(idx + 1).filter(Boolean)
  }

  function localPathForRemote(virtual: string): string | null {
    const filesBase = getLocalFilesBase()
    if (!filesBase) return null
    const relParts = virtual.split('/').filter(Boolean)
    return (
      filesBase.base + (relParts.length > 0 ? filesBase.sep + relParts.join(filesBase.sep) : '')
    )
  }

  function matchRemoteToLocal(): void {
    if (localLoading || remoteLoading) return
    const relParts = getFilesRelativeParts(localPath)
    if (relParts === null) return
    void navigateRemoteTo(relParts.length > 0 ? '/' + relParts.join('/') : '/')
  }

  function matchLocalToRemote(): void {
    if (localLoading || remoteLoading) return
    const target = localPathForRemote(remotePath)
    if (!target) return
    const fallback = activeEnv?.localStartPath ?? getLocalFilesBase()?.base ?? ''
    void (async () => {
      const ok = await navigateLocalTo(target)
      if (!ok && fallback && normLocal(target) !== normLocal(fallback))
        void navigateLocalTo(fallback)
    })()
  }

  /** Opens a remote folder by path; with linked folders the local pane follows. */
  function jumpRemote(virtual: string): void {
    void navigateRemoteTo(virtual)
    if (!mirrorNav) return
    const target = localPathForRemote(virtual)
    if (target) {
      void navigateLocalTo(target)
    } else if (pathsMatch) {
      const steps = pathSegmentCount(remotePath) - pathSegmentCount(virtual)
      let localTarget = localPath
      for (let i = 0; i < steps; i++) localTarget = localParentPath(localTarget)
      if (steps > 0) void navigateLocalTo(localTarget)
    }
  }

  // Sidebar pinned / recent folders.
  useEffect(() => {
    if (remoteRequest && activeEnv) jumpRemote(remoteRequest.path)
  }, [remoteRequest?.nonce])

  async function openLocal(entry: FileEntry): Promise<void> {
    if (entry.type !== 'directory') return
    const isMirror = !!(activeEnv && mirrorCandidateKeys?.has(diffKey(entry)))
    await navigateLocalTo(entry.path)
    if (isMirror) {
      // Use the remote folder's own casing (e.g. Scripts vs scripts).
      const remoteMatch = remoteEntries.find(
        (e) => e.type === 'directory' && e.name.toLowerCase() === entry.name.toLowerCase()
      )
      const name = remoteMatch?.name ?? entry.name
      await navigateRemoteTo(remotePath === '/' ? `/${name}` : `${remotePath}/${name}`)
    }
  }

  async function openRemote(entry: FileEntry): Promise<void> {
    if (!activeEnv || entry.type !== 'directory') return
    const isMirror = mirrorCandidateKeys?.has(diffKey(entry)) ?? false
    await navigateRemoteTo(entry.path)
    if (isMirror) {
      const localMatch = localEntries.find(
        (e) => e.type === 'directory' && e.name.toLowerCase() === entry.name.toLowerCase()
      )
      const sep = localPath.includes('\\') ? '\\' : '/'
      const name = localMatch?.name ?? entry.name
      await navigateLocalTo(localPath ? `${localPath}${sep}${name}` : name)
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleUpload(localPaths: string[], targetRemotePath: string): Promise<void> {
    if (!activeEnv || localPaths.length === 0) return
    if (targetRemotePath === '/' || targetRemotePath === '') {
      showToast(
        'Uploads to the top of /Files aren’t allowed. Open a folder (Files, Images, Templates…) first.',
        'warning'
      )
      return
    }
    // Ask before replacing: if any of the files already exist on the server, let
    // the user pick replace / upload missing / cancel. If the check itself fails,
    // upload without replacing — errors surface per job.
    const check = await window.dw.files.checkConflicts(activeEnv.name, localPaths, targetRemotePath)
    if (check.ok && check.data && check.data.conflicts.length > 0) {
      setPendingUpload({
        localPaths,
        targetRemotePath,
        conflictCount: check.data.conflicts.length,
        totalCount: check.data.totalFiles
      })
      return
    }
    startUpload(activeEnv.name, localPaths, targetRemotePath, false)
  }

  function handleDownload(remotePaths: string[], targetLocalDir = localPath): void {
    if (!activeEnv || remotePaths.length === 0) return
    if (!targetLocalDir) {
      showToast('Open a folder on this computer to download into.', 'warning')
      return
    }
    void startDownload(activeEnv.name, remotePaths, targetLocalDir)
  }

  async function handleDelete(paths: string[]): Promise<void> {
    if (!activeEnv || paths.length === 0) return
    setRemoteLoading(true)
    for (const p of paths) {
      const result = await window.dw.files.delete(activeEnv.name, p)
      if (!result.ok) showToast(result.error ?? `Failed to delete ${p}`, 'error')
    }
    await refreshRemote()
    setRemoteLoading(false)
    setSelected('remote', [])
  }

  async function handleRename(filePath: string, newName: string): Promise<void> {
    if (!activeEnv) return
    const result = await window.dw.files.rename(activeEnv.name, filePath, newName)
    if (!result.ok) showToast(result.error ?? 'Rename failed', 'error')
    setRemoteLoading(true)
    await refreshRemote()
    setRemoteLoading(false)
  }

  // Returns an error message for the dialog, or null when everything moved.
  async function handleMove(paths: string[], targetDir: string): Promise<string | null> {
    if (!activeEnv) return 'No environment selected.'
    let firstError: string | null = null
    for (const p of paths) {
      const result = await window.dw.files.move(activeEnv.name, p, targetDir)
      if (!result.ok && !firstError) firstError = result.error ?? `Couldn’t move ${p}`
    }
    setRemoteLoading(true)
    await refreshRemote()
    setRemoteLoading(false)
    if (!firstError) {
      setSelected('remote', [])
      const n = paths.length
      showToast(
        `Moved ${n === 1 ? '1 item' : `${n} items`} to ${toDisplayRemotePath(targetDir)}`,
        'success'
      )
    }
    return firstError
  }

  async function handleCreateFolder(name: string): Promise<string | null> {
    if (!activeEnv) return 'No environment selected.'
    const result = await window.dw.files.createDirectory(activeEnv.name, remotePath, name)
    if (!result.ok) return result.error ?? 'Could not create the folder.'
    setShowNewFolder(false)
    setRemoteLoading(true)
    await refreshRemote()
    setRemoteLoading(false)
    return null
  }

  async function handleReveal(path: string): Promise<void> {
    const result = await window.dw.fs.reveal(path)
    if (!result.ok)
      showToast(result.error ?? 'Could not open the file in your file manager.', 'error')
  }

  async function handleOpenDialog(): Promise<void> {
    const result = await window.dw.fs.openDialog(['openFile', 'multiSelections'])
    if (result.ok && result.data && result.data.paths.length > 0) {
      void handleUpload(result.data.paths, remotePath)
    }
  }

  // ── Derived view state ─────────────────────────────────────────────────────
  const localSelected = selected.pane === 'local' ? selected.paths : []
  const remoteSelected = selected.pane === 'remote' ? selected.paths : []
  const isLoading = localLoading || remoteLoading
  const localOnFiles = !!getDwRelativeTail(localPath)
  const remoteOnFiles = !!getDwRelativeTail(toDisplayRemotePath(remotePath))

  function visible(entries: FileEntry[], pane: Pane): FileEntry[] {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (activeFilter === 'all') return true
      const s: DiffStatus | undefined = diffMap.get(diffKey(e))
      if (activeFilter === 'local-only' && pane === 'remote') return false
      if (activeFilter === 'remote-only' && pane === 'local') return false
      return s === activeFilter
    })
  }

  const filters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'different', label: `Changed · ${counts.different}` },
    { value: 'local-only', label: `Not on server · ${counts['local-only']}` },
    { value: 'remote-only', label: `Only on server · ${counts['remote-only']}` }
  ].filter((f) => f.value === 'all' || counts[f.value as DiffStatus] > 0) as {
    value: StatusFilter
    label: string
  }[]

  // Linked-folders indicator text and match buttons.
  let linkLabel: string
  if (!mirrorNav) linkLabel = 'Link folders'
  else if (pathsMatch) linkLabel = 'Folders linked'
  else linkLabel = 'Linked — open matching /Files folders to navigate together'
  const showMatch = mirrorNav && !pathsMatch && !isLoading && (localOnFiles || remoteOnFiles)
  const canMatchLocal = remoteOnFiles && !!getLocalFilesBase()

  const remoteLabel = activeEnv ? (
    <>
      {envLabel(activeEnv)}
      {envKind(activeEnv) !== 'development' && (
        <>
          {' · '}
          <span
            style={{
              color: production ? 'var(--chip-danger-fg)' : 'var(--chip-changed-fg)',
              fontWeight: 500
            }}
          >
            {envKindLabel(envKind(activeEnv))}
          </span>
        </>
      )}
    </>
  ) : null

  // Each pane: a label above a bordered box holding the path bar and the list.
  const paneStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0
  }
  const paneLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    height: 20,
    padding: '0 4px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  }
  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    background: 'var(--pane-bg)',
    overflow: 'hidden'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          padding: '18px 24px 10px'
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', flex: 1 }}>Browse</h1>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 38,
            width: 240,
            padding: '0 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-full)',
            color: 'var(--text-subtle)'
          }}
        >
          <SearchIcon />
          <input
            type="search"
            placeholder="Filter this folder"
            aria-label="Filter this folder"
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
        {activeEnv && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => startSync({ localPath, remotePath })}
            title="Compare these two folders and sync them"
          >
            <SyncIcon />
            Sync folder
          </button>
        )}
      </header>

      {activeEnv && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            padding: '2px 24px 12px'
          }}
        >
          {diffMap.size > 0 &&
            filters.map((f) => (
              <button
                key={f.value}
                type="button"
                className="pill"
                aria-pressed={activeFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          <select
            aria-label="Compare"
            value={compareMode}
            onChange={(e) => setCompareMode(e.target.value as CompareMode)}
            style={{
              height: 32,
              padding: '0 10px',
              border: 'none',
              borderRadius: 'var(--r-full)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 13
            }}
          >
            {COMPARE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          {showMatch && (
            <>
              <button
                type="button"
                className="icon-btn"
                disabled={!localOnFiles}
                onClick={matchRemoteToLocal}
                title="Open the matching server folder"
                aria-label="Open the matching server folder"
              >
                <ArrowRightIcon />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={!canMatchLocal}
                onClick={matchLocalToRemote}
                title="Open the matching folder on this computer"
                aria-label="Open the matching folder on this computer"
              >
                <ArrowLeftIcon />
              </button>
            </>
          )}
          <button
            type="button"
            className="pill"
            aria-pressed={mirrorNav && pathsMatch}
            onClick={() => setMirrorNav(!mirrorNav)}
            title={
              mirrorNav
                ? 'Stop navigating the panes together'
                : 'Navigate both panes together when their folders match'
            }
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            {mirrorNav ? <LinkIcon size={14} /> : <UnlinkIcon size={14} />}
            {linkLabel}
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, display: 'flex', padding: '0 16px 16px' }}
      >
        {/* Local pane */}
        <section
          aria-label="This computer"
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
          style={{ ...paneStyle, flexBasis: `${splitRatio * 100}%`, flexGrow: 0, flexShrink: 0 }}
        >
          <div style={paneLabelStyle}>
            <MonitorIcon size={15} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              This computer
              {localSelected.length > 1 && (
                <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>
                  {' '}
                  · {localSelected.length} selected
                </span>
              )}
            </span>
          </div>
          <div style={cardStyle}>
            <PaneHeader
              path={localPath}
              onNavigateUp={() => {
                void navigateLocalTo(localParentPath(localPath))
                if (mirrorNav && pathsMatch) void navigateRemoteTo(parentPath(remotePath))
              }}
              onRefresh={() => {
                void loadLocal(localPath)
                if (mirrorNav && pathsMatch && activeEnv) {
                  setRemoteLoading(true)
                  void refreshRemote().finally(() => setRemoteLoading(false))
                }
              }}
              onNavigateTo={(p) => {
                const localTarget = p === '' || p === '/' ? '' : p
                void navigateLocalTo(localTarget)
                if (mirrorNav) {
                  const relParts = getFilesRelativeParts(localTarget)
                  if (relParts !== null)
                    void navigateRemoteTo(relParts.length > 0 ? '/' + relParts.join('/') : '/')
                }
              }}
            />
            <FileList
              pane="local"
              entries={visible(localEntries, 'local')}
              loading={localLoading}
              selected={localSelected}
              onSelect={(paths) => setSelected('local', paths)}
              onOpen={(entry) => void openLocal(entry)}
              onMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'local' })}
              onDropOnPane={(paths, source) => source === 'remote' && handleDownload(paths)}
              onDropIntoDir={(paths, source, dir) =>
                source === 'remote' && handleDownload(paths, dir.path)
              }
              diffMap={diffMap}
              sort={sort}
              onSortChange={setSort}
              emptyText={query ? 'Nothing matches the filter' : 'This folder is empty'}
            />
          </div>
        </section>

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
          style={{ flex: '0 0 12px', cursor: 'col-resize' }}
        />

        {/* Remote pane */}
        <section
          aria-label="Server"
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
          style={{ ...paneStyle, flex: 1 }}
        >
          <div style={paneLabelStyle}>
            <GlobeIcon size={15} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeEnv ? remoteLabel : 'Server'}
              {activeEnv && remoteSelected.length > 1 && (
                <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>
                  {' '}
                  · {remoteSelected.length} selected
                </span>
              )}
            </span>
          </div>
          <div style={cardStyle}>
            {!activeEnv ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  padding: 24,
                  textAlign: 'center'
                }}
              >
                <GlobeIcon size={28} style={{ color: 'var(--text-subtle)' }} />
                <p style={{ fontSize: 16, fontWeight: 500 }}>No environment connected</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320 }}>
                  Add a Dynamicweb site to browse its files next to the ones on this computer.
                </p>
                <button type="button" className="btn btn-primary" onClick={openAddEnv}>
                  <PlusIcon />
                  Add environment
                </button>
              </div>
            ) : (
              <>
                <PaneHeader
                  path={toDisplayRemotePath(remotePath)}
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
                  onNavigateTo={(displayPath) =>
                    jumpRemote(displayPath.replace(/^\/Files/i, '') || '/')
                  }
                  actions={
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Upload files"
                        title="Upload files…"
                        onClick={() => void handleOpenDialog()}
                      >
                        <UploadIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="New folder"
                        title="New folder"
                        onClick={() => setShowNewFolder(true)}
                      >
                        <FolderPlusIcon />
                      </button>
                    </>
                  }
                />
                {remoteError && !remoteLoading && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      margin: '10px 10px 0',
                      padding: '10px 12px',
                      borderRadius: 'var(--r-md)',
                      background: 'var(--notice-danger-bg)',
                      color: 'var(--notice-danger-fg)',
                      fontSize: 13,
                      lineHeight: 1.45
                    }}
                  >
                    <AlertIcon style={{ marginTop: 2 }} />
                    <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                      Couldn’t load server files. {remoteError}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setRemoteLoading(true)
                        void refreshRemote().finally(() => setRemoteLoading(false))
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
                <FileList
                  pane="remote"
                  entries={visible(remoteEntries, 'remote')}
                  loading={remoteLoading}
                  selected={remoteSelected}
                  onSelect={(paths) => setSelected('remote', paths)}
                  onOpen={(entry) => void openRemote(entry)}
                  onMenu={(entry, x, y) => setContextMenu({ entry, x, y, pane: 'remote' })}
                  onDropOnPane={(paths, source) =>
                    source === 'local' && void handleUpload(paths, remotePath)
                  }
                  onDropIntoDir={(paths, source, dir) => {
                    if (source === 'local') void handleUpload(paths, dir.path)
                    else
                      void handleMove(paths, dir.path).then((err) => err && showToast(err, 'error'))
                  }}
                  onDropFiles={(files, dir) => void handleUpload(files, dir?.path ?? remotePath)}
                  diffMap={diffMap}
                  sort={sort}
                  onSortChange={setSort}
                  emptyText={
                    query
                      ? 'Nothing matches the filter'
                      : 'This folder is empty — drop files here to upload'
                  }
                />
              </>
            )}
          </div>
        </section>
      </div>

      {showNewFolder && activeEnv && (
        <PromptDialog
          title="New folder"
          description={
            <>
              Create a folder in{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>
                {toDisplayRemotePath(remotePath)}
              </span>
            </>
          }
          label="Folder name"
          submitLabel="Create"
          busyLabel="Creating…"
          validate={validateName}
          onSubmit={handleCreateFolder}
          onCancel={() => setShowNewFolder(false)}
        />
      )}

      {moveTargets && activeEnv && (
        <PromptDialog
          title={
            moveTargets.length === 1
              ? `Move “${moveTargets[0].split('/').pop()}”`
              : `Move ${moveTargets.length} items`
          }
          description="Type the server folder to move to. Items keep their names; nothing is replaced."
          label="Destination folder"
          initialValue={toDisplayRemotePath(remotePath)}
          mono
          submitLabel="Move"
          busyLabel="Moving…"
          validate={(v) =>
            fromDisplayRemotePath(v) === null ? 'Destination must be inside /Files' : null
          }
          onSubmit={async (v) => {
            const err = await handleMove(moveTargets, fromDisplayRemotePath(v) ?? '/')
            if (!err) setMoveTargets(null)
            return err
          }}
          onCancel={() => setMoveTargets(null)}
        />
      )}

      {pendingUpload && activeEnv && (
        <UploadConflictModal
          conflictCount={pendingUpload.conflictCount}
          totalCount={pendingUpload.totalCount}
          targetPath={toDisplayRemotePath(pendingUpload.targetRemotePath)}
          production={production}
          onReplace={() => {
            startUpload(
              activeEnv.name,
              pendingUpload.localPaths,
              pendingUpload.targetRemotePath,
              true
            )
            setPendingUpload(null)
          }}
          onSkip={() => {
            startUpload(
              activeEnv.name,
              pendingUpload.localPaths,
              pendingUpload.targetRemotePath,
              false
            )
            setPendingUpload(null)
          }}
          onCancel={() => setPendingUpload(null)}
        />
      )}

      {contextMenu &&
        (() => {
          // A right-click on part of the selection acts on the whole selection.
          const selectionPaths = selected.pane === contextMenu.pane ? selected.paths : []
          const targetPaths =
            selectionPaths.includes(contextMenu.entry.path) && selectionPaths.length > 1
              ? selectionPaths
              : [contextMenu.entry.path]
          const entryPath = contextMenu.entry.path
          return (
            <ContextMenu
              entry={contextMenu.entry}
              targetCount={targetPaths.length}
              hasActiveEnv={!!activeEnv}
              pinned={pinned.some((p) => p.toLowerCase() === entryPath.toLowerCase())}
              onClose={() => setContextMenu(null)}
              onCopyPath={() =>
                void navigator.clipboard.writeText(
                  contextMenu.pane === 'remote' ? toDisplayRemotePath(entryPath) : entryPath
                )
              }
              onDelete={() => void handleDelete(targetPaths)}
              onRename={(newName) => void handleRename(entryPath, newName)}
              onMove={() => setMoveTargets(targetPaths)}
              onTogglePin={() => togglePin(entryPath)}
              onDownload={() => handleDownload(targetPaths)}
              onReveal={() => void handleReveal(entryPath)}
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
