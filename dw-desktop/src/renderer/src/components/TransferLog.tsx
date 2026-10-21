import { useTransferStore } from '../stores/transferStore'

export default function TransferLog(): React.JSX.Element {
  const jobs = useTransferStore((s) => s.jobs)
  const clearDone = useTransferStore((s) => s.clearDone)

  const completed = jobs.filter(
    (j) => j.status === 'done' || j.status === 'error' || j.status === 'skipped'
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
          {completed.length} transfers this session
        </span>
        <button
          type="button"
          style={{
            fontSize: 11,
            color: 'var(--text-subtle)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 80ms ease-out'
          }}
          onClick={clearDone}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')}
        >
          Clear history
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {completed.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: 13,
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              color: 'var(--text-subtle)'
            }}
          >
            No completed transfers yet
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Direction', 'Filename', 'Remote path', 'Local path', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 8px',
                      textAlign: 'left',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: 'var(--text-subtle)',
                      fontWeight: 500
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {completed.map((job) => (
                <tr
                  key={job.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 80ms ease-out' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                  <td style={{ padding: '6px 16px', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const color = job.direction === 'upload' ? 'var(--accent)' : 'var(--accent-cool)'
                      const label = job.direction === 'upload' ? 'LOCAL \u2192 REMOTE' : 'REMOTE \u2192 LOCAL'
                      return (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.05em',
                            color,
                            border: `1px solid ${color}`,
                            padding: '1px 5px',
                            borderRadius: 'var(--r-sm)'
                          }}
                        >
                          {label}
                        </span>
                      )
                    })()}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      color: 'var(--text)',
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {job.label}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-subtle)',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {job.remotePath}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-subtle)',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {job.localPath}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {job.status === 'done' ? (
                      <span style={{ color: 'var(--success)' }}>✓ done</span>
                    ) : job.status === 'skipped' ? (
                      <span
                        style={{ color: 'var(--warning)' }}
                        title={
                          job.skippedNames && job.skippedNames.length > 0
                            ? `Already exists on remote — not overwritten:\n${job.skippedNames.join('\n')}`
                            : 'Already exists on remote — not overwritten'
                        }
                      >
                        ⤼ skipped (exists)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--danger)' }}>{job.error ?? 'error'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
