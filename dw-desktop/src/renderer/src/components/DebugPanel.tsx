import { useEffect, useRef, useState } from 'react'
import type { DebugEntry } from '../../../preload/index.d'

export default function DebugPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [selected, setSelected] = useState<DebugEntry | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.dw.debug.getAll().then((all) => setEntries(all as DebugEntry[]))
    const unsub = window.dw.on.debugEntry((entry) => {
      setEntries((prev) => [...prev, entry as DebugEntry])
    })
    return unsub
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  function statusColor(status?: number | string): string {
    if (!status) return 'var(--text-subtle)'
    const s = Number(status)
    if (s >= 200 && s < 300) return 'var(--success)'
    if (s >= 400) return 'var(--danger)'
    return 'var(--text-muted)'
  }

  function shortUrl(url: string): string {
    try {
      const u = new URL(url)
      return u.pathname + (u.search ? u.search.slice(0, 60) : '')
    } catch {
      return url.slice(0, 80)
    }
  }

  const monoBase: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10
  }

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        ...monoBase
      }}
    >
      {/* Request list */}
      <div
        style={{
          width: '55%',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            gap: 12
          }}
        >
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-subtle)' }}>
            Requests
          </span>
          <span style={{ color: 'var(--text-subtle)', fontSize: 10 }}>{entries.length}</span>
          <button
            type="button"
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'var(--text-subtle)',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
            onClick={() => setEntries([])}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')}
          >
            Clear
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {entries.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--text-subtle)', fontSize: 10 }}>No requests yet</div>
          )}
          {entries.map((entry, i) => (
            <div
              key={i}
              onClick={() => setSelected(entry)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: selected === entry ? 'var(--surface-hover)' : 'transparent',
                transition: 'background 80ms ease-out'
              }}
              onMouseEnter={(e) => {
                if (selected !== entry) (e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)'
              }}
              onMouseLeave={(e) => {
                if (selected !== entry) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <span style={{ fontSize: 9, color: 'var(--text-subtle)', flexShrink: 0, width: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.ts.slice(11, 19)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, width: 32 }}>
                {entry.method}
              </span>
              <span style={{ fontSize: 10, flexShrink: 0, width: 32, color: statusColor(entry.status) }}>
                {entry.status ?? '…'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shortUrl(entry.url)}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Detail pane */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-subtle)' }}>
            Detail
          </span>
        </div>
        {selected ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontSize: 9, color: 'var(--text-subtle)' }}>URL</p>
                <button
                  type="button"
                  style={{ fontSize: 9, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => void navigator.clipboard.writeText(selected.url)}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')}
                >
                  copy
                </button>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text)', wordBreak: 'break-all' }}>{selected.url}</p>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <p style={{ fontSize: 9, color: 'var(--text-subtle)', marginBottom: 4 }}>Method</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{selected.method}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, color: 'var(--text-subtle)', marginBottom: 4 }}>Status</p>
                <p style={{ fontSize: 10, color: statusColor(selected.status) }}>{selected.status ?? '—'}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, color: 'var(--text-subtle)', marginBottom: 4 }}>Time</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{selected.ts.slice(11, 23)}</p>
              </div>
            </div>
            {selected.body && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 9, color: 'var(--text-subtle)' }}>Response (truncated)</p>
                  <button
                    type="button"
                    style={{ fontSize: 9, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => void navigator.clipboard.writeText(selected.body!)}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')}
                  >
                    copy
                  </button>
                </div>
                <pre
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    background: 'var(--surface)',
                    borderRadius: 'var(--r-sm)',
                    padding: 8,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    border: '1px solid var(--border)'
                  }}
                >
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selected.body), null, 2).slice(0, 2000)
                    } catch {
                      return selected.body.slice(0, 2000)
                    }
                  })()}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: 'var(--text-subtle)'
            }}
          >
            Click a request to inspect
          </div>
        )}
      </div>
    </div>
  )
}
