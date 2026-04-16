import { useState } from 'react'
import { useTransferStore } from '../stores/transferStore'

function formatProgress(transferred: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((transferred / total) * 100)))
}

export default function TransferQueue(): React.JSX.Element {
  const jobs = useTransferStore((s) => s.jobs)
  const clearDone = useTransferStore((s) => s.clearDone)
  const [expanded, setExpanded] = useState(true)

  const activeCount = jobs.filter((j) => j.status === 'active' || j.status === 'queued').length
  const doneCount = jobs.filter((j) => j.status === 'done').length

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
        {activeCount > 0 && (
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
            {activeCount}
          </span>
        )}
        {doneCount > 0 && (
          <span
            style={{
              fontSize: 10,
              background: 'var(--surface-raised)',
              color: 'var(--text-muted)',
              borderRadius: 'var(--r-full)',
              padding: '1px 6px'
            }}
          >
            {doneCount}
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
        <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && jobs.length > 0 && (
        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
          {jobs.map((job) => {
            const pct = formatProgress(job.transferred, job.total)
            return (
              <div key={job.id} style={{ borderTop: '1px solid var(--border)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '5px 12px'
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      flexShrink: 0,
                      color: job.error ? 'var(--danger)' : job.direction === 'upload' ? 'var(--accent)' : 'var(--accent-cool)'
                    }}
                  >
                    {job.direction === 'upload' ? '↑' : '↓'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: job.error ? 'var(--danger)' : 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {job.label}
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
                      {job.remotePath}
                    </div>
                  </div>
                  <div style={{ width: 70, flexShrink: 0 }}>
                    <div
                      style={{
                        height: 4,
                        background: job.error ? 'rgba(184,53,40,0.2)' : 'var(--border-strong)',
                        borderRadius: 'var(--r-full)',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        className={job.status === 'active' && !job.error ? 'transfer-bar-active' : undefined}
                        style={{
                          height: '100%',
                          width: job.error ? '100%' : `${pct}%`,
                          background: job.error ? 'var(--danger)' : job.status === 'done' ? 'var(--success)' : 'var(--accent)',
                          transition: 'width 300ms ease'
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: job.error ? 'var(--danger)' : 'var(--text-muted)',
                      width: 32,
                      textAlign: 'right',
                      flexShrink: 0
                    }}
                  >
                    {job.error ? '✕' : job.status === 'done' ? '✓' : `${pct}%`}
                  </span>
                </div>
                {job.error && (
                  <div
                    style={{
                      padding: '4px 12px 6px 37px',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--danger)',
                      background: 'rgba(184,53,40,0.06)',
                      borderTop: '1px solid rgba(184,53,40,0.15)',
                      lineHeight: 1.4,
                      wordBreak: 'break-all'
                    }}
                  >
                    {job.error}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {expanded && jobs.length === 0 && (
        <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-subtle)' }}>
          No transfers
        </div>
      )}
    </section>
  )
}
