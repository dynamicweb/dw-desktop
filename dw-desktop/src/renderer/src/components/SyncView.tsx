import { nanoid } from 'nanoid'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  envKind,
  envKindLabel,
  envLabel,
  type ExcludedEntry,
  type SyncAction,
  type SyncDirection,
  type SyncItem,
  type IPCResult,
  type SyncPlan,
  type SyncPlanProgress,
  type TransferJob
} from '../../../shared/types'
import { DEFAULT_EXCLUDES, countPatterns, patternLines } from '../../../shared/exclude'
import { useEnvStore } from '../stores/envStore'
import { useFileStore } from '../stores/fileStore'
import { useToastStore } from '../stores/toastStore'
import { useTransferStore } from '../stores/transferStore'
import { useUiStore } from '../stores/uiStore'
import { folderName, useWorkspaceStore } from '../stores/workspaceStore'
import { PromptDialog } from './Dialog'
import { fromDisplayRemotePath, toDisplayRemotePath } from '../utils/paths'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon
} from './Icons'

type Resolution = 'local' | 'remote'

const CHIP: Record<SyncAction, { bg: string; fg: string; label: string }> = {
  upload: { bg: 'var(--chip-new-bg)', fg: 'var(--chip-new-fg)', label: 'Upload' },
  download: { bg: 'var(--chip-new-bg)', fg: 'var(--chip-new-fg)', label: 'Download' },
  replace: { bg: 'var(--chip-changed-bg)', fg: 'var(--chip-changed-fg)', label: 'Replace' },
  delete: { bg: 'var(--chip-danger-bg)', fg: 'var(--chip-danger-fg)', label: 'Delete' },
  conflict: { bg: 'var(--chip-danger-bg)', fg: 'var(--chip-danger-fg)', label: 'Conflict' },
  skip: { bg: 'var(--chip-neutral-bg)', fg: 'var(--chip-neutral-fg)', label: 'Skip' }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function joinLocal(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${sep}${rel.split('/').join(sep)}`
}

function joinRemote(root: string, rel: string): string {
  return root === '/' ? `/${rel}` : `${root}/${rel}`
}

function parentOf(path: string, sep: string): string {
  const i = path.lastIndexOf(sep)
  return i <= 0 ? (sep === '/' ? '/' : path) : path.slice(0, i)
}

const SIDE_LABEL: Record<ExcludedEntry['side'], string> = {
  local: 'This computer',
  remote: 'Server',
  both: 'Both'
}

/** What the exclude rules left out of a plan, collapsed by default. */
function ExcludedList({
  plan,
  open,
  onToggle
}: {
  plan: SyncPlan
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  const sources = [
    plan.gitignores > 0 &&
      `${plan.gitignores} .gitignore ${plan.gitignores === 1 ? 'file' : 'files'}`,
    plan.dwignore && '.dwignore'
  ].filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          Excluded ({plan.excluded.length})
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
          Not transferred and not deleted
          {sources.length > 0 && ` · rules from ${sources.join(' and ')}`}
        </span>
      </div>
      {open && (
        <div
          role="table"
          aria-label="Excluded"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden'
          }}
        >
          {plan.excluded.map((x, i) => (
            <div
              key={x.path}
              role="row"
              style={{
                minHeight: 36,
                display: 'grid',
                gridTemplateColumns: '104px minmax(0, 1fr) 230px',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                fontSize: 12,
                color: 'var(--text-muted)'
              }}
            >
              <span>{SIDE_LABEL[x.side]}</span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text)'
                }}
              >
                {x.type === 'directory' && (
                  <FolderIcon size={14} style={{ color: 'var(--text-muted)' }} />
                )}
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={x.path}
                >
                  {x.path}
                  {x.type === 'directory' ? '/' : ''}
                </span>
              </span>
              <span
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={x.rule}
              >
                {x.rule}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type PlanPhase = SyncPlanProgress['phase']

const PHASES: { phase: PlanPhase; label: string }[] = [
  { phase: 'local', label: 'Listing this computer' },
  { phase: 'remote', label: 'Listing the server' },
  { phase: 'compare', label: 'Comparing files on both sides' },
  { phase: 'conflicts', label: 'Checking for changes since the last sync' }
]

// After this long comparing content, suggest the quicker comparison by size and date.
const SLOW_PREVIEW_S = 20

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * What a running preview is doing, step by step, and where it stopped if it failed.
 * The conflict check only happens for a folder synced before, so it is shown once reached.
 */
function PreviewProgress({
  steps,
  latest,
  elapsed,
  running,
  error,
  compareContent
}: {
  steps: Partial<Record<PlanPhase, SyncPlanProgress>>
  latest: SyncPlanProgress | null
  elapsed: number
  running: boolean
  error: string | null
  compareContent: boolean
}): React.JSX.Element {
  const at = latest ? PHASES.findIndex((p) => p.phase === latest.phase) : -1
  const shown = PHASES.filter((p) => p.phase !== 'conflicts' || steps.conflicts)
  const slow = running && compareContent && latest?.phase === 'compare' && elapsed >= SLOW_PREVIEW_S
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontSize: 13
      }}
    >
      {shown.map(({ phase, label }, i) => {
        const p = steps[phase]
        const state =
          i < at ? 'done' : i === at ? (running ? 'active' : error ? 'failed' : 'done') : 'pending'
        const counted = phase === 'compare' || phase === 'conflicts'
        let count = ''
        if (!p || (state === 'failed' && p.done === 0)) count = ''
        else if (counted) count = `${p.done.toLocaleString()} of ${(p.total ?? 0).toLocaleString()}`
        else count = `${p.done.toLocaleString()} ${p.done === 1 ? 'item' : 'items'}`
        return (
          <div key={phase} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 16,
                  display: 'flex',
                  justifyContent: 'center',
                  color:
                    state === 'failed'
                      ? 'var(--danger)'
                      : state === 'done'
                        ? 'var(--success)'
                        : 'var(--text-subtle)'
                }}
              >
                {state === 'done' ? (
                  <CheckIcon size={14} />
                ) : state === 'failed' ? (
                  <AlertIcon size={14} />
                ) : (
                  <span
                    className={state === 'active' ? 'transfer-bar-active' : undefined}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 'var(--r-full)',
                      background: state === 'active' ? 'var(--accent)' : 'var(--border)'
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  flex: 1,
                  color: state === 'pending' ? 'var(--text-subtle)' : 'var(--text)',
                  fontWeight: state === 'active' ? 500 : 400
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{count}</span>
            </div>
            {state === 'active' && counted && !!p?.total && (
              <span
                style={{
                  marginLeft: 26,
                  height: 4,
                  borderRadius: 'var(--r-full)',
                  background: 'var(--border)',
                  overflow: 'hidden'
                }}
              >
                <span
                  className="transfer-bar-active"
                  style={{
                    display: 'block',
                    width: `${Math.round((p.done / p.total) * 100)}%`,
                    height: '100%',
                    background: 'var(--accent)'
                  }}
                />
              </span>
            )}
            {state !== 'done' && state !== 'pending' && p?.current && (
              <span
                title={p.current}
                style={{
                  marginLeft: 26,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {p.current}
              </span>
            )}
          </div>
        )
      })}

      {latest && latest.failed > 0 && (
        <span style={{ fontSize: 12, color: 'var(--chip-changed-fg)' }}>
          {latest.failed} {latest.failed === 1 ? 'file' : 'files'} couldn’t be compared so far. They
          will be listed in the preview and left out of the sync.
        </span>
      )}
      {slow && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Comparing content reads every file that has the same size on both sides. For a quicker
          preview by size and date, untick “Compare content”.
        </span>
      )}
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--notice-danger-bg)',
            color: 'var(--notice-danger-fg)',
            lineHeight: 1.45
          }}
        >
          <AlertIcon style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{error}</span>
        </div>
      )}
      {(running || latest) && (
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
          {running ? 'Running for' : 'Stopped after'} {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  )
}

export default function SyncView(): React.JSX.Element {
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const browseLocal = useFileStore((s) => s.localPath)
  const browseRemote = useFileStore((s) => s.remotePath)
  const { syncDraft, setView, openAddEnv } = useUiStore()
  const { saveSync, syncs } = useWorkspaceStore()
  const showToast = useToastStore((s) => s.show)

  const [localPath, setLocalPath] = useState('')
  const [remotePath, setRemotePath] = useState('/')
  const [direction, setDirection] = useState<SyncDirection>('push')
  const [compareContent, setCompareContent] = useState(true)
  const [deleteExtra, setDeleteExtra] = useState(false)
  const [useDefaultExcludes, setUseDefaultExcludes] = useState(true)
  const [useGitignore, setUseGitignore] = useState(false)
  const [excludeText, setExcludeText] = useState('')
  const [showPatterns, setShowPatterns] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [gitignoreFound, setGitignoreFound] = useState(false)
  const [savedId, setSavedId] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncPlanProgress | null>(null)
  const [steps, setSteps] = useState<Partial<Record<PlanPhase, SyncPlanProgress>>>({})
  const [elapsed, setElapsed] = useState(0)
  const [include, setInclude] = useState<Map<string, boolean>>(new Map())
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map())
  const [editingRemote, setEditingRemote] = useState(false)
  const [savingName, setSavingName] = useState(false)
  // Bumped whenever the inputs change, so a preview that was still running when they
  // did is thrown away instead of bringing back a plan for the old options.
  const revision = useRef(0)
  // The preview running in the main process, if any; stopped there, not just ignored here.
  const previewing = useRef<string | null>(null)
  const previewStarted = useRef(0)

  // Prefill from a draft (Browse's "Sync folder" or a saved sync), else Browse's folders.
  useEffect(() => {
    const d = syncDraft
    setLocalPath(d?.localPath ?? browseLocal)
    setRemotePath(d?.remotePath ?? browseRemote)
    setDirection(d?.direction ?? 'push')
    setCompareContent(d?.compareContent ?? true)
    setDeleteExtra(d?.deleteExtra ?? false)
    setUseDefaultExcludes(d?.useDefaultExcludes ?? true)
    setUseGitignore(d?.useGitignore ?? false)
    setExcludeText((d?.exclude ?? []).join('\n'))
    setShowPatterns((d?.exclude ?? []).length > 0)
    setSavedId(d?.savedId)
    setName(d?.name ?? '')
    if (previewing.current) window.dw.sync.cancelPlan(previewing.current)
    previewing.current = null
    revision.current++
    setPlan(null)
    setPlanning(false)
    setError(null)
    setProgress(null)
    setSteps({})
  }, [syncDraft, activeEnv?.name])

  useEffect(
    () =>
      window.dw.on.syncPlanProgress((p) => {
        if (p.previewId !== previewing.current) return
        setProgress(p)
        setSteps((s) => ({ ...s, [p.phase]: p }))
      }),
    []
  )

  // Leaving the Sync screen stops a preview that is still running.
  useEffect(
    () => () => {
      if (previewing.current) window.dw.sync.cancelPlan(previewing.current)
    },
    []
  )

  useEffect(() => {
    if (!planning) return
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - previewStarted.current) / 1000)),
      1000
    )
    return () => clearInterval(timer)
  }, [planning])

  // The .gitignore option is only offered where one applies (or it is already on).
  useEffect(() => {
    let current = true
    void window.dw.sync.inspectLocal(localPath).then((r) => {
      if (current) setGitignoreFound(!!r.data?.gitignore)
    })
    return () => {
      current = false
    }
  }, [localPath])

  // Any change to what would be compared invalidates the preview, and stops one that
  // is still running.
  function invalidate(): void {
    if (previewing.current) window.dw.sync.cancelPlan(previewing.current)
    previewing.current = null
    revision.current++
    setPlan(null)
    setPlanning(false)
    setError(null)
    setProgress(null)
    setSteps({})
  }

  const push = direction === 'push'
  const production = !!activeEnv && envKind(activeEnv) === 'production'
  const displayName = name || folderName(remotePath)
  const exclude = patternLines(excludeText)
  const patternCount = countPatterns(exclude)

  async function preview(): Promise<void> {
    if (!activeEnv || !localPath) return
    const started = ++revision.current
    const previewId = nanoid()
    previewing.current = previewId
    previewStarted.current = Date.now()
    setElapsed(0)
    setProgress(null)
    setSteps({})
    setPlanning(true)
    setError(null)
    let result: IPCResult<SyncPlan>
    try {
      result = await window.dw.sync.plan(
        {
          envName: activeEnv.name,
          localPath,
          remotePath,
          direction,
          compareContent,
          deleteExtra,
          useDefaultExcludes,
          useGitignore,
          exclude
        },
        previewId
      )
    } catch (err) {
      result = { ok: false, error: (err as Error).message }
    }
    if (previewing.current === previewId) previewing.current = null
    if (started !== revision.current) return
    setPlanning(false)
    setElapsed(Math.floor((Date.now() - previewStarted.current) / 1000))
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Couldn’t compare the folders.')
      setPlan(null)
      return
    }
    setPlan(result.data)
    setShowExcluded(false)
    setInclude(new Map(result.data.items.map((i) => [i.path, i.include && i.action !== 'skip'])))
    setResolutions(new Map())
  }

  const counts = useMemo(() => {
    const c: Record<SyncAction, number> = {
      upload: 0,
      download: 0,
      replace: 0,
      delete: 0,
      conflict: 0,
      skip: 0
    }
    for (const i of plan?.items ?? []) c[i.action]++
    return c
  }, [plan])

  const selected = (plan?.items ?? []).filter((i) => include.get(i.path))
  const uncompared = (plan?.items ?? []).filter((i) => i.error).length
  const unresolved = (plan?.items ?? []).filter(
    (i) => i.action === 'conflict' && !resolutions.get(i.path)
  )
  const selectedBytes = selected
    .filter((i) => i.type === 'file' && i.action !== 'delete')
    .reduce((sum, i) => sum + (i.size ?? 0), 0)

  function toggle(item: SyncItem, on: boolean): void {
    setInclude((m) => new Map(m).set(item.path, on))
  }

  function resolve(item: SyncItem, r: Resolution): void {
    setResolutions((m) => new Map(m).set(item.path, r))
    toggle(item, true)
  }

  function run(): void {
    if (!activeEnv || !plan || selected.length === 0) return
    // Jobs describe what the plan will do, so they come from the request it was built
    // for, never from controls that may have changed since.
    const { localPath, remotePath, envName } = plan.request
    const push = plan.request.direction === 'push'
    const batchId = nanoid()
    const title = `${push ? 'Deploy' : 'Get'} ${displayName}`
    const localSep = localPath.includes('\\') ? '\\' : '/'
    const now = Date.now()
    const jobs: TransferJob[] = selected.map((item) => {
      const deleting = item.action === 'delete'
      // A retry from Activity keeps the run's guards: a planned replace or delete of a
      // server file only goes ahead while the server still has the version this
      // preview saw, and a new file never overwrites one that appeared since. A
      // resolved conflict was the user's call, so it overwrites.
      const guarded =
        push && item.type === 'file' && (item.action === 'replace' || item.action === 'delete')
      const localAbs = joinLocal(localPath, item.path)
      const remoteItem = joinRemote(remotePath, item.path)
      // Fields follow the retry convention in transferStore: upload = local file →
      // remote folder; download = remote item → local folder; delete = remote path
      // (a local delete keeps localPath set, which marks it as not retryable).
      return {
        id: nanoid(),
        batchId,
        envName,
        batchTitle: title,
        fromSync: true,
        // Retrying a folder item recreates the folder only, never its whole subtree.
        directoryOnly: item.type === 'directory' && !deleting,
        direction: deleting ? 'delete' : push ? 'upload' : 'download',
        label: item.type === 'directory' ? `${item.path}/` : item.path,
        remotePath: deleting || !push ? remoteItem : parentOf(remoteItem, '/'),
        localPath: deleting
          ? push
            ? ''
            : localAbs
          : push
            ? localAbs
            : parentOf(localAbs, localSep),
        overwrite: item.action !== 'upload',
        ifMatch: guarded ? (item.remoteETag ?? null) : null,
        status: 'queued',
        transferred: 0,
        total: item.size || 1,
        startedAt: now
      }
    })
    useTransferStore.getState().addJobs(jobs)
    window.dw.sync.run(
      plan.id,
      selected.map((item, i) => ({
        jobId: jobs[i].id,
        path: item.path,
        resolution: resolutions.get(item.path)
      }))
    )
    if (savedId) {
      const saved = syncs.find((s) => s.id === savedId)
      if (saved) void saveSync({ ...saved, lastRunAt: new Date().toISOString() })
    }
    setPlan(null)
    setView('activity')
  }

  async function save(nameToSave: string): Promise<string | null> {
    if (!activeEnv) return 'No environment selected.'
    const id = savedId ?? nanoid()
    await saveSync({
      id,
      name: nameToSave,
      localPath,
      remotePath,
      direction,
      compareContent,
      deleteExtra,
      useDefaultExcludes,
      useGitignore,
      exclude,
      lastRunAt: syncs.find((s) => s.id === id)?.lastRunAt
    })
    setSavedId(id)
    setName(nameToSave)
    setSavingName(false)
    showToast(`Saved “${nameToSave}”`, 'success')
    return null
  }

  if (!activeEnv) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14
        }}
      >
        <p style={{ fontSize: 16, fontWeight: 500 }}>Choose an environment to sync with</p>
        <button type="button" className="btn btn-primary" onClick={openAddEnv}>
          Add environment
        </button>
      </div>
    )
  }

  const card: React.CSSProperties = {
    flex: '1 1 280px',
    minWidth: 0,
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 10
  }
  const pathText: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }
  const kind = envKind(activeEnv)
  const sourceCard = (
    <div style={card}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>This computer</span>
        <span style={pathText} title={localPath}>
          {localPath || 'Choose a folder'}
        </span>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          const r = await window.dw.fs.openDialog(['openDirectory'])
          if (r.ok && r.data?.paths[0]) {
            setLocalPath(r.data.paths[0])
            invalidate()
          }
        }}
      >
        Change…
      </button>
    </div>
  )
  const serverCard = (
    <div style={card}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
          {envLabel(activeEnv)}
          {kind !== 'development' && (
            <>
              {' · '}
              <span
                style={{
                  color: kind === 'production' ? 'var(--chip-danger-fg)' : 'var(--chip-changed-fg)',
                  fontWeight: 500
                }}
              >
                {envKindLabel(kind)}
              </span>
            </>
          )}
        </span>
        <span style={pathText}>{toDisplayRemotePath(remotePath)}</span>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingRemote(true)}>
        Change…
      </button>
    </div>
  )

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Sync {displayName}</h1>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSavingName(true)}
            >
              {savedId ? 'Rename saved sync' : 'Save this sync'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 10 }}>
            {push ? sourceCard : serverCard}
            <span
              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
              aria-label={push ? 'to' : 'to'}
            >
              <ArrowRightIcon size={20} />
            </span>
            {push ? serverCard : sourceCard}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
            <div role="radiogroup" aria-label="Direction" className="segmented">
              <button
                type="button"
                role="radio"
                aria-checked={push}
                onClick={() => {
                  setDirection('push')
                  invalidate()
                }}
              >
                Deploy to server
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!push}
                onClick={() => {
                  setDirection('pull')
                  invalidate()
                }}
              >
                Get from server
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={deleteExtra}
                onChange={(e) => {
                  setDeleteExtra(e.target.checked)
                  invalidate()
                }}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              {push
                ? 'Delete server files that aren’t on this computer'
                : 'Move local files that aren’t on the server to the trash'}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={compareContent}
                onChange={(e) => {
                  setCompareContent(e.target.checked)
                  invalidate()
                }}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              Compare content, not just size and date
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                title={DEFAULT_EXCLUDES.join('   ')}
              >
                <input
                  type="checkbox"
                  checked={useDefaultExcludes}
                  onChange={(e) => {
                    setUseDefaultExcludes(e.target.checked)
                    invalidate()
                  }}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                Skip common junk files (.git, node_modules, .DS_Store…)
              </label>
              {(gitignoreFound || useGitignore) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={useGitignore}
                    onChange={(e) => {
                      setUseGitignore(e.target.checked)
                      invalidate()
                    }}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  Skip files listed in .gitignore
                </label>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={showPatterns}
                onClick={() => setShowPatterns((v) => !v)}
              >
                {showPatterns ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                Exclude patterns{patternCount > 0 ? ` (${patternCount})` : ''}
              </button>
            </div>
            {showPatterns && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  className="input"
                  aria-label="Exclude patterns"
                  rows={4}
                  spellCheck={false}
                  value={excludeText}
                  placeholder={
                    'One pattern per line, for example:\n*.scss\n/drafts/\nDesigns/**/*.map'
                  }
                  onChange={(e) => {
                    setExcludeText(e.target.value)
                    invalidate()
                  }}
                  style={{
                    height: 'auto',
                    padding: '8px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    resize: 'vertical'
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.45 }}>
                  Same syntax as .gitignore; start a line with ! to include something the other
                  rules leave out. A .dwignore file in the local folder is read too. Excluded files
                  are neither transferred nor deleted, on either side.
                </span>
              </div>
            )}
          </div>

          {production && push && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 14,
                background: 'var(--notice-danger-bg)',
                color: 'var(--notice-danger-fg)',
                fontSize: 13,
                lineHeight: 1.45
              }}
            >
              <AlertIcon style={{ marginTop: 2 }} />
              <span>
                This writes to a <b style={{ fontWeight: 600 }}>production</b> site. Files changed
                on the server since your last sync are listed as conflicts and won’t be overwritten
                unless you choose to.
              </span>
            </div>
          )}

          {!plan && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!localPath || planning}
                onClick={() => void preview()}
              >
                {planning ? 'Comparing…' : error ? 'Try again' : 'Preview changes'}
              </button>
              {planning && (
                <button type="button" className="btn btn-ghost" onClick={invalidate}>
                  Cancel
                </button>
              )}
              {!error && !planning && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Nothing is transferred until you review the list and confirm.
                </span>
              )}
            </div>
          )}

          {!plan && (planning || error) && (
            <PreviewProgress
              steps={steps}
              latest={progress}
              elapsed={elapsed}
              running={planning}
              error={error}
              compareContent={compareContent}
            />
          )}

          {plan && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {counts.upload + counts.download > 0 && (
                  <span
                    className="chip"
                    style={{
                      height: 26,
                      padding: '0 12px',
                      fontSize: 12,
                      background: 'var(--chip-new-bg)',
                      color: 'var(--chip-new-fg)'
                    }}
                  >
                    {counts.upload + counts.download} new
                  </span>
                )}
                {counts.replace > 0 && (
                  <span
                    className="chip"
                    style={{
                      height: 26,
                      padding: '0 12px',
                      fontSize: 12,
                      background: 'var(--chip-changed-bg)',
                      color: 'var(--chip-changed-fg)'
                    }}
                  >
                    {counts.replace} to replace
                  </span>
                )}
                {counts.delete > 0 && (
                  <span
                    className="chip"
                    style={{
                      height: 26,
                      padding: '0 12px',
                      fontSize: 12,
                      background: 'var(--chip-danger-bg)',
                      color: 'var(--chip-danger-fg)'
                    }}
                  >
                    {counts.delete} to delete
                  </span>
                )}
                {counts.conflict > 0 && (
                  <span
                    className="chip"
                    style={{
                      height: 26,
                      padding: '0 12px',
                      fontSize: 12,
                      background: 'var(--chip-danger-bg)',
                      color: 'var(--chip-danger-fg)'
                    }}
                  >
                    {counts.conflict} {counts.conflict === 1 ? 'conflict' : 'conflicts'}
                  </span>
                )}
                {counts.skip > 0 && (
                  <span
                    className="chip"
                    style={{
                      height: 26,
                      padding: '0 12px',
                      fontSize: 12,
                      background: 'var(--chip-neutral-bg)',
                      color: 'var(--chip-neutral-fg)'
                    }}
                  >
                    {counts.skip} skipped
                  </span>
                )}
                <span
                  className="chip"
                  style={{
                    height: 26,
                    padding: '0 12px',
                    fontSize: 12,
                    background: 'var(--chip-neutral-bg)',
                    color: 'var(--chip-neutral-fg)'
                  }}
                >
                  {plan.unchanged} unchanged
                </span>
                {plan.excluded.length > 0 && (
                  <span
                    className="chip"
                    style={{
                      height: 26,
                      padding: '0 12px',
                      fontSize: 12,
                      background: 'var(--chip-neutral-bg)',
                      color: 'var(--chip-neutral-fg)'
                    }}
                  >
                    {plan.excluded.length} excluded
                  </span>
                )}
              </div>

              {uncompared > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 14,
                    background: 'var(--chip-changed-bg)',
                    color: 'var(--chip-changed-fg)',
                    fontSize: 13,
                    lineHeight: 1.45
                  }}
                >
                  <AlertIcon style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>
                    {uncompared} {uncompared === 1 ? 'file' : 'files'} couldn’t be compared, so{' '}
                    {uncompared === 1 ? 'it is' : 'they are'} left out of this sync. The reason is
                    shown next to each; preview again to retry.
                  </span>
                </div>
              )}

              {plan.items.length === 0 ? (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--text-muted)'
                  }}
                >
                  The folders are already in sync.
                </div>
              ) : (
                <div
                  role="table"
                  aria-label="Planned changes"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    role="row"
                    style={{
                      height: 36,
                      display: 'grid',
                      gridTemplateColumns: '36px 104px minmax(0, 1fr) 80px 230px',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0 12px',
                      fontSize: 12,
                      color: 'var(--text-subtle)',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    <span />
                    <span>Action</span>
                    <span>File</span>
                    <span style={{ textAlign: 'right' }}>Size</span>
                    <span>Why</span>
                  </div>
                  {plan.items.map((item) => {
                    const chip = CHIP[item.action]
                    const resolution = resolutions.get(item.path)
                    const informational = item.action === 'skip'
                    return (
                      <div
                        key={item.path}
                        role="row"
                        style={{
                          minHeight: 44,
                          display: 'grid',
                          gridTemplateColumns: '36px 104px minmax(0, 1fr) 80px 230px',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 12px',
                          borderBottom: '1px solid var(--border)',
                          opacity: informational ? 0.75 : 1
                        }}
                      >
                        {informational ? (
                          <span />
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`Include ${item.path}`}
                            checked={!!include.get(item.path)}
                            disabled={item.action === 'conflict' && !resolution}
                            onChange={(e) => toggle(item, e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                          />
                        )}
                        <span>
                          <span className="chip" style={{ background: chip.bg, color: chip.fg }}>
                            {item.action === 'upload' || item.action === 'download'
                              ? push
                                ? 'Upload'
                                : 'Download'
                              : chip.label}
                          </span>
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            minWidth: 0
                          }}
                        >
                          {item.type === 'directory' && (
                            <FolderIcon size={14} style={{ color: 'var(--text-muted)' }} />
                          )}
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={item.path}
                          >
                            {item.path}
                          </span>
                        </span>
                        <span
                          style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}
                        >
                          {item.type === 'file' && item.size !== undefined
                            ? formatBytes(item.size)
                            : ''}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            color: 'var(--text-muted)'
                          }}
                        >
                          {item.reason}
                          {item.error && (
                            <span
                              title={item.error}
                              style={{
                                width: '100%',
                                color: 'var(--danger)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {item.error}
                            </span>
                          )}
                          {item.action === 'conflict' && (
                            <span style={{ display: 'flex', gap: 4 }}>
                              {(['local', 'remote'] as Resolution[]).map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  className="btn btn-secondary"
                                  aria-pressed={resolution === r}
                                  onClick={() => resolve(item, r)}
                                  style={{
                                    height: 24,
                                    padding: '0 9px',
                                    fontSize: 11,
                                    background: resolution === r ? 'var(--accent)' : undefined,
                                    color: resolution === r ? 'var(--accent-contrast)' : undefined,
                                    borderColor: resolution === r ? 'var(--accent)' : undefined
                                  }}
                                >
                                  {r === 'local' ? 'Keep mine' : 'Keep server’s'}
                                </button>
                              ))}
                            </span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {plan.excluded.length > 0 && (
                <ExcludedList
                  plan={plan}
                  open={showExcluded}
                  onToggle={() => setShowExcluded((v) => !v)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {plan && plan.items.length > 0 && (
        <footer
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            padding: '14px 32px',
            borderTop: '1px solid var(--border)'
          }}
        >
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>
            {selected.length} {selected.length === 1 ? 'item' : 'items'}
            {selectedBytes > 0 && ` · ${formatBytes(selectedBytes)}`} will be{' '}
            {push ? 'sent to' : 'downloaded from'}{' '}
            <b style={{ fontWeight: 500, color: 'var(--text)' }}>{envLabel(activeEnv)}</b>
            {unresolved.length > 0 &&
              ` · ${unresolved.length} ${unresolved.length === 1 ? 'conflict needs' : 'conflicts need'} a choice`}
          </span>
          <button type="button" className="btn btn-ghost" onClick={invalidate}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.length === 0}
            onClick={run}
          >
            {push ? <ArrowRightIcon /> : <ArrowLeftIcon />}
            {push ? 'Deploy' : 'Get'} {selected.length} {selected.length === 1 ? 'item' : 'items'}
          </button>
        </footer>
      )}

      {editingRemote && (
        <PromptDialog
          title="Server folder"
          description="Type the folder on the server to sync with."
          label="Server folder"
          initialValue={toDisplayRemotePath(remotePath)}
          mono
          submitLabel="Use folder"
          busyLabel="Checking…"
          validate={(v) =>
            fromDisplayRemotePath(v) === null ? 'The folder must be inside /Files' : null
          }
          onSubmit={async (v) => {
            setRemotePath(fromDisplayRemotePath(v) ?? '/')
            invalidate()
            setEditingRemote(false)
            return null
          }}
          onCancel={() => setEditingRemote(false)}
        />
      )}

      {savingName && (
        <PromptDialog
          title={savedId ? 'Rename saved sync' : 'Save this sync'}
          description="Saved syncs appear in the sidebar and keep the folders, direction and options."
          label="Name"
          initialValue={displayName}
          submitLabel="Save"
          busyLabel="Saving…"
          onSubmit={save}
          onCancel={() => setSavingName(false)}
        />
      )}
    </div>
  )
}
