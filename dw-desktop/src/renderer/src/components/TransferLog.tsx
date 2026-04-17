import { useTransferStore } from '../stores/transferStore'

export default function TransferLog(): React.JSX.Element {
  const jobs = useTransferStore((s) => s.jobs)
  const clearDone = useTransferStore((s) => s.clearDone)

  const completed = jobs.filter((j) => j.status === 'done' || j.status === 'error')

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
                {['Dir', 'Filename', 'Remote path', 'Local path', 'Status'].map((h) => (
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
                  <td style={{ padding: '6px 16px' }}>
                    <span style={{ color: job.direction === 'upload' ? 'var(--accent)' : 'var(--accent-cool)' }}>
                      {job.direction === 'upload' ? '↑' : '↓'}
                    </span>
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
                  <td style={{ padding: '6px 8px' }}>
                    {job.status === 'done' ? (
                      <span style={{ color: 'var(--success)' }}>✓ done</span>
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
