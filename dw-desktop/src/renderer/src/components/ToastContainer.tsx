import { useToastStore, type ToastTone } from '../stores/toastStore'

function toneStyle(tone: ToastTone): React.CSSProperties {
  switch (tone) {
    case 'error':
      return {
        borderColor: 'var(--danger)',
        background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))',
        color: 'var(--text)'
      }
    case 'warning':
      return {
        borderColor: 'var(--warning)',
        background: 'color-mix(in srgb, var(--warning) 10%, var(--surface))',
        color: 'var(--text)'
      }
    case 'success':
      return {
        borderColor: 'var(--success)',
        background: 'color-mix(in srgb, var(--success) 10%, var(--surface))',
        color: 'var(--text)'
      }
    default:
      return {
        borderColor: 'var(--border-strong)',
        background: 'var(--surface)',
        color: 'var(--text)'
      }
  }
}

function toneDotColor(tone: ToastTone): string {
  switch (tone) {
    case 'error': return 'var(--danger)'
    case 'warning': return 'var(--warning)'
    case 'success': return 'var(--success)'
    default: return 'var(--accent-cool)'
  }
}

export default function ToastContainer(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div
      style={{
        position: 'fixed',
        top: 48,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        pointerEvents: 'none'
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '8px 12px',
            border: '1px solid',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            lineHeight: 1.4,
            minWidth: 240,
            maxWidth: 360,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            ...toneStyle(t.tone)
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 'var(--r-full)',
              background: toneDotColor(t.tone),
              marginTop: 6,
              flexShrink: 0
            }}
          />
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 0
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
