import { useMemo } from 'react'
import { useEnvStore } from '../stores/envStore'
import { useTransferStore } from '../stores/transferStore'
import { useUiStore } from '../stores/uiStore'
import { groupBatches, type Batch } from '../utils/batches'
import { AlertIcon, DownloadIcon, SyncIcon, UploadIcon } from './Icons'
import { envLabel } from '../../../shared/types'

function folderName(path: string): string {
  const name = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop()
  return name || 'the root folder'
}

/** Says "missing permission" when that is why every failed job failed. */
function failureText(failed: Batch[]): string {
  const errors = failed.flatMap((b) => b.jobs.filter((j) => j.status === 'error'))
  const permission = errors.length > 0 && errors.every((j) => j.errorKind === 'permission')
  if (!permission) {
    return failed.length === 1 ? 'A transfer failed' : `${failed.length} transfers failed`
  }
  if (failed.length > 1) return `${failed.length} transfers failed: missing permission`
  const b = failed[0]
  if (b.isSync) return 'Sync items failed: missing permission'
  if (b.direction === 'upload') return `No permission to upload to ${folderName(b.remotePath)}`
  if (b.direction === 'download') return `No permission to download ${b.jobs[0].label}`
  return `No permission to delete ${b.jobs[0].label}`
}

/**
 * Floating progress pill (bottom right) while transfers run, or after one failed
 * until Activity has been opened. Clicking it opens Activity.
 */
export default function TransferPill(): React.JSX.Element | null {
  const jobs = useTransferStore((s) => s.jobs)
  const envs = useEnvStore((s) => s.envs)
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const seenAt = useUiStore((s) => s.activitySeenAt)

  const batches = useMemo(() => groupBatches(jobs), [jobs])
  if (view === 'activity') return null

  const active = batches.filter((b) => b.status === 'active')
  const failed = batches.filter((b) => b.status === 'error' && b.startedAt > seenAt)
  if (active.length === 0 && failed.length === 0) return null

  const env = (name: string): string => {
    const e = envs.find((x) => x.name === name)
    return e ? envLabel(e) : name
  }

  let icon: React.ReactNode
  let text: React.ReactNode
  let progress: number | null = null
  if (active.length > 0) {
    const b = active[0]
    const finished = b.totalCount - b.activeCount
    icon = b.isSync ? (
      <SyncIcon size={15} />
    ) : b.direction === 'download' ? (
      <DownloadIcon size={15} />
    ) : (
      <UploadIcon size={15} />
    )
    const what = b.totalCount === 1 ? b.jobs[0].label : `${finished} of ${b.totalCount} items`
    text = (
      <>
        {b.isSync ? 'Syncing' : b.direction === 'download' ? 'Downloading' : 'Uploading'} {what}{' '}
        {b.isSync ? 'with' : b.direction === 'download' ? 'from' : 'to'}{' '}
        <b style={{ fontWeight: 500 }}>{env(b.envName)}</b>
        {active.length > 1 ? ` · +${active.length - 1} more` : ''}
      </>
    )
    progress = b.progress
  } else {
    icon = <AlertIcon size={15} />
    text = <span style={{ color: 'var(--danger)' }}>{failureText(failed)}</span>
  }

  return (
    <button
      type="button"
      onClick={() => setView('activity')}
      style={{
        position: 'fixed',
        right: 28,
        bottom: 28,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px 10px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-full)',
        boxShadow: 'var(--shadow-pop)',
        color: 'var(--text)',
        fontSize: 13,
        textAlign: 'left'
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--surface-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 320 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {text}
        </span>
        {progress !== null && (
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
              style={{
                display: 'block',
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width 300ms ease'
              }}
            />
          </span>
        )}
      </span>
      <span style={{ color: 'var(--text-muted)' }}>View</span>
    </button>
  )
}
