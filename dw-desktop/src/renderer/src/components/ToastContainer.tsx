import { useToastStore, type ToastTone } from '../stores/toastStore'
import { CloseIcon } from './Icons'

function toneDotColor(tone: ToastTone): string {
  switch (tone) {
    case 'error':
      return 'var(--danger)'
    case 'warning':
      return 'var(--warning)'
    case 'success':
      return 'var(--success)'
    default:
      return 'var(--text-subtle)'
  }
}

export default function ToastContainer(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
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
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="popover"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 10px 10px 14px',
            borderRadius: 14,
            fontSize: 13,
            lineHeight: 1.45,
            minWidth: 260,
            maxWidth: 380,
            color: 'var(--text)'
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 'var(--r-full)',
              background: toneDotColor(t.tone),
              marginTop: 6,
              flexShrink: 0
            }}
          />
          <span style={{ flex: 1, wordBreak: 'break-word' }}>{t.message}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            style={{ width: 24, height: 24 }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
