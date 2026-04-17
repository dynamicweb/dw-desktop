import { useMemo, useState } from 'react'
import type { TransferJob } from '../../../shared/types'
import { useTransferStore } from '../stores/transferStore'

interface Batch {
  id: string
  direction: 'upload' | 'download'
  remotePath: string
  jobs: TransferJob[]
  activeCount: number
  doneCount: number
  errorCount: number
  totalCount: number
  transferred: number
  total: number
  status: 'queued' | 'active' | 'done' | 'error'
}

function groupBatches(jobs: TransferJob[]): Batch[] {
  const byBatch = new Map<string, Batch>()
  // Preserve insertion order: jobs are prepended in the store, so iterate in order.
  for (const job of jobs) {
    let b = byBatch.get(job.batchId)
    if (!b) {
      b = {
        id: job.batchId,
        direction: job.direction,
        remotePath: job.remotePath,
        jobs: [],
        activeCount: 0,
        doneCount: 0,
        errorCount: 0,
        totalCount: 0,
        transferred: 0,
        total: 0,
        status: 'queued'
      }
      byBatch.set(job.batchId, b)
    }
    b.jobs.push(job)
    b.totalCount++
    b.transferred += job.transferred
    b.total += job.total
    if (job.status === 'error') b.errorCount++
    else if (job.status === 'done') b.doneCount++
    else if (job.status === 'active' || job.status === 'queued') b.activeCount++
  }
  for (const b of byBatch.values()) {
    if (b.errorCount > 0 && b.activeCount === 0) b.status = 'error'
    else if (b.activeCount > 0) b.status = 'active'
    else if (b.doneCount === b.totalCount) b.status = 'done'
    else b.status = 'queued'
  }
  return Array.from(byBatch.values())
}

function pct(transferred: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((transferred / total) * 100)))
}

function DirectionPill({ direction }: { direction: 'upload' | 'download' }): React.JSX.Element {
  const color = direction === 'upload' ? 'var(--accent)' : 'var(--accent-cool)'
  const label = direction === 'upload' ? 'LOCAL \u2192 REMOTE' : 'REMOTE \u2192 LOCAL'
  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.05em',
        color,
        border: `1px solid ${color}`,
        padding: '1px 5px',
        borderRadius: 'var(--r-sm)',
        flexShrink: 0,
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </span>
  )
}

function ProgressBar({
  transferred,
  total,
  status,
  errored
}: {
  transferred: number
  total: number
  status: string
  errored: boolean
}): React.JSX.Element {
  const p = pct(transferred, total)
  return (
    <div
      style={{
        height: 4,
        background: errored ? 'rgba(184,53,40,0.2)' : 'var(--border-strong)',
        borderRadius: 'var(--r-full)',
        overflow: 'hidden'
      }}
    >
      <div
        className={status === 'active' && !errored ? 'transfer-bar-active' : undefined}
        style={{
          height: '100%',
          width: errored ? '100%' : `${p}%`,
          background: errored
            ? 'var(--danger)'
            : status === 'done'
              ? 'var(--success)'
              : 'var(--accent)',
          transition: 'width 300ms ease'
        }}
      />
    </div>
  )
}

export default function TransferQueue(): React.JSX.Element {
  const jobs = useTransferStore((s) => s.jobs)
  const clearDone = useTransferStore((s) => s.clearDone)
  const [expanded, setExpanded] = useState(true)
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set())

  const batches = useMemo(() => groupBatches(jobs), [jobs])

  const activeBatchCount = batches.filter(
    (b) => b.status === 'active' || b.status === 'queued'
  ).length
  const doneBatchCount = batches.filter((b) => b.status === 'done').length

  function toggleBatch(id: string): void {
    setOpenBatches((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          cursor: 'pointer',
          transition: 'background 80ms ease-out'
        }}
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-subtle)',
            marginRight: 12
          }}
        >
          Transfers
        </span>
        {activeBatchCount > 0 && (
          <span
            style={{
              fontSize: 10,
              background: 'var(--success)',
              color: '#fff',
              borderRadius: 'var(--r-full)',
              padding: '1px 6px',
              marginRight: 4
            }}
          >
            {activeBatchCount}
          </span>
        )}
        {doneBatchCount > 0 && (
          <span
            style={{
              fontSize: 10,
              background: 'var(--surface-raised)',
              color: 'var(--text-muted)',
              borderRadius: 'var(--r-full)',
              padding: '1px 6px'
            }}
          >
            {doneBatchCount}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={{
            fontSize: 10,
            color: 'var(--text-subtle)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginRight: 8,
            transition: 'color 80ms ease-out'
          }}
          onClick={(e) => { e.stopPropagation(); clearDone() }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')}
        >
          Clear done
        </button>
        <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{expanded ? '\u25BE' : '\u25B8'}</span>
      </div>

      {expanded && batches.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {batches.map((batch) => {
            const isOpen = openBatches.has(batch.id)
            const errored = batch.status === 'error'
            const singleFile = batch.totalCount === 1
            const job0 = batch.jobs[0]
            const parentLabel = singleFile
              ? job0.label
              : `${batch.totalCount} files`
            const statusLine = singleFile
              ? batch.remotePath
              : `${batch.doneCount}/${batch.totalCount} \u00b7 ${batch.remotePath}`
            const canToggle = !singleFile

            return (
              <div key={batch.id} style={{ borderTop: '1px solid var(--border)' }}>
                <div
                  onClick={canToggle ? () => toggleBatch(batch.id) : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 12px',
                    cursor: canToggle ? 'pointer' : 'default',
                    transition: 'background 80ms ease-out'
                  }}
                  onMouseEnter={(e) => {
                    if (canToggle)
                      (e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)'
                  }}
                  onMouseLeave={(e) => {
                    if (canToggle)
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      fontSize: 10,
                      color: 'var(--text-subtle)',
                      flexShrink: 0,
                      textAlign: 'center'
                    }}
                  >
                    {canToggle ? (isOpen ? '\u25BE' : '\u25B8') : ''}
                  </span>
                  <DirectionPill direction={batch.direction} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: errored ? 'var(--danger)' : 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {parentLabel}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-subtle)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {statusLine}
                    </div>
                  </div>
                  <div style={{ width: 70, flexShrink: 0 }}>
                    <ProgressBar
                      errored={errored}
                      status={batch.status}
                      total={batch.total}
                      transferred={batch.transferred}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: errored ? 'var(--danger)' : 'var(--text-muted)',
                      width: 44,
                      textAlign: 'right',
                      flexShrink: 0
                    }}
                  >
                    {errored
                      ? `\u2715 ${batch.errorCount}`
                      : batch.status === 'done'
                        ? '\u2713 done'
                        : `${pct(batch.transferred, batch.total)}%`}
                  </span>
                </div>

                {/* Expanded children */}
                {canToggle && isOpen && (
                  <div style={{ background: 'var(--surface-raised)' }}>
                    {batch.jobs.map((job) => {
                      const jobErrored = job.status === 'error'
                      return (
                        <div
                          key={job.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '3px 12px 3px 38px',
                            fontSize: 11
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 'var(--r-full)',
                              background: jobErrored
                                ? 'var(--danger)'
                                : job.status === 'done'
                                  ? 'var(--success)'
                                  : 'var(--accent)',
                              flexShrink: 0
                            }}
                          />
                          <span
                            style={{
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: jobErrored ? 'var(--danger)' : 'var(--text)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11
                            }}
                          >
                            {job.label}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: jobErrored ? 'var(--danger)' : 'var(--text-muted)',
                              flexShrink: 0
                            }}
                          >
                            {jobErrored
                              ? '\u2715 error'
                              : job.status === 'done'
                                ? '\u2713'
                                : job.status === 'active'
                                  ? `${pct(job.transferred, job.total)}%`
                                  : 'queued'}
                          </span>
                        </div>
                      )
                    })}
                    {/* Per-batch error detail — show first error verbatim */}
                    {batch.errorCount > 0 && (
                      <div
                        style={{
                          padding: '4px 12px 6px 38px',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--danger)',
                          background: 'rgba(184,53,40,0.06)',
                          borderTop: '1px solid rgba(184,53,40,0.15)',
                          lineHeight: 1.4,
                          wordBreak: 'break-all'
                        }}
                      >
                        {batch.jobs.find((j) => j.error)?.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Single-file error inline (no expansion needed) */}
                {singleFile && errored && job0.error && (
                  <div
                    style={{
                      padding: '4px 12px 6px 38px',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--danger)',
                      background: 'rgba(184,53,40,0.06)',
                      borderTop: '1px solid rgba(184,53,40,0.15)',
                      lineHeight: 1.4,
                      wordBreak: 'break-all'
                    }}
                  >
                    {job0.error}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {expanded && batches.length === 0 && (
        <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-subtle)' }}>
          No transfers
        </div>
      )}
    </section>
  )
}
