import { useEffect, useRef, useState } from 'react'
import type { DebugEntry } from '../../../preload/index.d'

function JsonView({ text }: { text: string }): React.JSX.Element {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { /* not json */ }

  if (parsed === undefined) {
    return <span style={{ color: 'var(--text-muted)' }}>{text.slice(0, 2000)}</span>
  }

  const pretty = JSON.stringify(parsed, null, 2).slice(0, 4000)
  const tokens: React.ReactNode[] = []
  // Tokenise with a single regex pass
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = re.exec(pretty)) !== null) {
    if (match.index > last) tokens.push(<span key={i++} style={{ color: 'var(--text-subtle)' }}>{pretty.slice(last, match.index)}</span>)
    if (match[1] !== undefined) {
      // string — key if followed by colon, value otherwise
      if (match[2]) {
        tokens.push(<span key={i++} style={{ color: 'var(--accent-cool)' }}>{match[1]}</span>)
        tokens.push(<span key={i++} style={{ color: 'var(--text-subtle)' }}>{match[2]}</span>)
      } else {
        tokens.push(<span key={i++} style={{ color: 'var(--text)' }}>{match[1]}</span>)
      }
    } else if (match[3] !== undefined) {
      const color = match[3] === 'null' ? 'var(--text-subtle)' : 'var(--accent)'
      tokens.push(<span key={i++} style={{ color }}>{match[3]}</span>)
    } else if (match[4] !== undefined) {
      tokens.push(<span key={i++} style={{ color: 'var(--warning)' }}>{match[4]}</span>)
    }
    last = match.index + match[0].length
  }
  if (last < pretty.length) tokens.push(<span key={i++} style={{ color: 'var(--text-subtle)' }}>{pretty.slice(last)}</span>)

  return <>{tokens}</>
}

export default function DebugPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [selected, setSelected] = useState<DebugEntry | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.dw.debug.getAll().then((all) => setEntries(all as DebugEntry[]))
    const unsub = window.dw.on.debugEntry((entry) => {
      setEntries((prev) => {
        const e = entry as DebugEntry
        // Response update: same object reference mutated — find by ts+url and replace
        const idx = prev.findIndex((p) => p.ts === e.ts && p.url === e.url && p.method === e.method)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = e
          return next
        }
        return [...prev, e]
      })
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
            onClick={() => {
              setEntries([])
              setSelected(null)
              void window.dw.debug.clear()
            }}
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
              {(() => {
                const isPost = entry.method === 'POST'
                const color = isPost ? 'var(--accent)' : 'var(--accent-cool)'
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
                      flexShrink: 0
                    }}
                  >
                    {entry.method}
                  </span>
                )
              })()}
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
                {(() => {
                  const isPost = selected.method === 'POST'
                  const color = isPost ? 'var(--accent)' : 'var(--accent-cool)'
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
                      {selected.method}
                    </span>
                  )
                })()}
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
            {[
              { label: 'Request body', text: selected.requestBody },
              { label: 'Response', text: selected.responseBody }
            ].map(({ label, text }) => text ? (
              <div key={label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 9, color: 'var(--text-subtle)' }}>{label}</p>
                  <button
                    type="button"
                    style={{ fontSize: 9, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => void navigator.clipboard.writeText(text)}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)')}
                  >
                    copy
                  </button>
                </div>
                <pre
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--surface)',
                    borderRadius: 'var(--r-sm)',
                    padding: 8,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    border: '1px solid var(--border)',
                    margin: 0
                  }}
                >
                  <JsonView text={text} />
                </pre>
              </div>
            ) : null)}
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
