import { useMemo, useState } from 'react'
import { envKind, envKindLabel, envLabel, type TransferJob } from '../../../shared/types'
import { useEnvStore } from '../stores/envStore'
import {
  canCancel,
  canRetry,
  cancelBatch,
  cancelJob,
  retryBatch,
  useTransferStore
} from '../stores/transferStore'
import { groupBatches, type Batch } from '../utils/batches'
import DebugPanel from './DebugPanel'
import {
  AlertIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon
} from './Icons'

function timeLabel(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`
  const d = new Date(ms)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function jobState(job: TransferJob): { text: string; color: string } {
  switch (job.status) {
    case 'done':
      return { text: 'Done', color: 'var(--success)' }
    case 'skipped':
      return { text: 'Skipped', color: 'var(--text-subtle)' }
    case 'cancelled':
      return { text: 'Cancelled', color: 'var(--text-subtle)' }
    case 'error':
      return { text: 'Failed', color: 'var(--danger)' }
    case 'queued':
      return { text: 'Waiting', color: 'var(--text-subtle)' }
    case 'active': {
      const pct = job.total > 1 ? ` · ${Math.round((job.transferred / job.total) * 100)}%` : ''
      const verb =
        job.direction === 'download'
          ? 'Downloading'
          : job.direction === 'delete'
            ? 'Deleting'
            : 'Uploading'
      return { text: `${verb}${pct}`, color: 'var(--text)' }
    }
  }
}

function BatchIcon({ batch }: { batch: Batch }): React.JSX.Element {
  const failed = batch.status === 'error'
  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        flexShrink: 0,
        background: failed ? 'var(--chip-danger-bg)' : 'var(--surface-raised)',
        color: failed ? 'var(--chip-danger-fg)' : 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {failed ? (
        <AlertIcon />
      ) : batch.isSync ? (
        <SyncIcon />
      ) : batch.direction === 'download' ? (
        <DownloadIcon />
      ) : batch.direction === 'delete' ? (
        <TrashIcon />
      ) : (
        <UploadIcon />
      )}
    </span>
  )
}

function BatchCard({
  batch,
  expanded,
  onToggle
}: {
  batch: Batch
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const env = useEnvStore((s) => s.envs.find((e) => e.name === batch.envName))
  const kind = env ? envKind(env) : 'development'
  const finished = batch.totalCount - batch.activeCount
  const retryable = batch.jobs.some(canRetry)
  const cancellable = batch.jobs.some(canCancel)

  const summary: string[] = []
  if (batch.status === 'active') summary.push(`${finished} of ${batch.totalCount}`)
  else {
    if (batch.doneCount) summary.push(`${batch.doneCount} done`)
    if (batch.skippedCount) summary.push(`${batch.skippedCount} skipped`)
    if (batch.cancelledCount) summary.push(`${batch.cancelledCount} cancelled`)
  }
  const firstError = batch.jobs.find((j) => j.status === 'error')?.error

  return (
    <section
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px'
        }}
      >
        <BatchIcon batch={batch} />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            flex: 1,
            minWidth: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            padding: 0
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
            {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
            {batch.title}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
              · {env ? envLabel(env) : batch.envName}
            </span>
            {kind !== 'development' && (
              <span
                style={{
                  fontWeight: 400,
                  color: kind === 'production' ? 'var(--chip-danger-fg)' : 'var(--chip-changed-fg)'
                }}
              >
                {envKindLabel(kind)}
              </span>
            )}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: 'var(--text-muted)',
              paddingLeft: 20
            }}
          >
            {batch.status === 'active' && (
              <span
                style={{
                  width: 200,
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
                    width: `${Math.round(batch.progress * 100)}%`,
                    height: '100%',
                    background: 'var(--accent)'
                  }}
                />
              </span>
            )}
            {summary.join(' · ')}
            {batch.errorCount > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                {summary.length ? '· ' : ''}
                {batch.errorCount} failed
              </span>
            )}
            <span>· {timeLabel(batch.startedAt)}</span>
          </span>
        </button>
        {batch.status === 'active' && cancellable && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => cancelBatch(batch.id)}
          >
            {batch.totalCount > 1 ? 'Cancel all' : 'Cancel'}
          </button>
        )}
        {batch.status !== 'active' && retryable && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void retryBatch(batch.id)}
          >
            Retry failed
          </button>
        )}
      </div>
      {!expanded && batch.status === 'error' && firstError && (
        <p
          style={{
            padding: '0 16px 12px 60px',
            fontSize: 12,
            color: 'var(--danger)',
            wordBreak: 'break-word'
          }}
        >
          {firstError}
        </p>
      )}
      {expanded &&
        batch.jobs.map((job) => {
          const state = jobState(job)
          return (
            <div
              key={job.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 12,
                minHeight: 40,
                padding: '6px 16px 6px 60px',
                borderTop: '1px solid var(--border)'
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={job.label}
                >
                  {job.label}
                </span>
                {job.error && (
                  <span style={{ fontSize: 12, color: 'var(--danger)', wordBreak: 'break-word' }}>
                    {job.error}
                  </span>
                )}
                {job.skippedNames && job.skippedNames.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                    Already on the server, not replaced: {job.skippedNames.slice(0, 5).join(', ')}
                    {job.skippedNames.length > 5 ? ` and ${job.skippedNames.length - 5} more` : ''}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: state.color, whiteSpace: 'nowrap' }}>
                  {state.text}
                </span>
                {batch.totalCount > 1 && canCancel(job) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Cancel ${job.label}`}
                    onClick={() => cancelJob(job.id)}
                  >
                    Cancel
                  </button>
                )}
              </span>
            </div>
          )
        })}
    </section>
  )
}

export default function ActivityView(): React.JSX.Element {
  const jobs = useTransferStore((s) => s.jobs)
  const clearDone = useTransferStore((s) => s.clearDone)
  const activeEnv = useEnvStore((s) => s.activeEnv)
  const [tab, setTab] = useState<'transfers' | 'requests'>('transfers')
  const [scope, setScope] = useState<'env' | 'all'>('env')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const batches = useMemo(() => groupBatches(jobs), [jobs])
  const shown = batches.filter((b) => scope === 'all' || !activeEnv || b.envName === activeEnv.name)
  const current = shown.filter((b) => b.status === 'active' || b.status === 'error')
  const earlier = shown.filter((b) => b.status !== 'active' && b.status !== 'error')

  function toggle(id: string): void {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '24px 32px 0',
          maxWidth: 1000,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Activity</h1>
          {tab === 'transfers' && (
            <>
              <select
                aria-label="Which environments"
                value={scope}
                onChange={(e) => setScope(e.target.value as 'env' | 'all')}
                className="select select-outline"
              >
                <option value="env">
                  {activeEnv ? `${envLabel(activeEnv)} only` : 'This environment'}
                </option>
                <option value="all">All environments</option>
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearDone}>
                Clear finished
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="pill"
            aria-pressed={tab === 'transfers'}
            onClick={() => setTab('transfers')}
          >
            Transfers
          </button>
          <button
            type="button"
            className="pill"
            aria-pressed={tab === 'requests'}
            onClick={() => setTab('requests')}
          >
            Server requests
          </button>
        </div>
      </div>

      {tab === 'requests' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: '16px 32px 24px' }}>
          <DebugPanel />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div
            style={{
              maxWidth: 1000,
              margin: '0 auto',
              padding: '16px 32px 40px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
          >
            {shown.length === 0 && (
              <p style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                Nothing here yet. Uploads, downloads and syncs show up here and are kept for 30
                days.
              </p>
            )}
            {current.map((b) => (
              <BatchCard
                key={b.id}
                batch={b}
                expanded={b.status === 'active' ? !open.has(b.id) : open.has(b.id)}
                onToggle={() => toggle(b.id)}
              />
            ))}
            {earlier.length > 0 && (
              <div
                style={{ marginTop: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-subtle)' }}
              >
                Earlier
              </div>
            )}
            {earlier.map((b) => (
              <BatchCard
                key={b.id}
                batch={b}
                expanded={open.has(b.id)}
                onToggle={() => toggle(b.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
