import { useEffect, useState } from 'react'

interface DialogProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
  width?: number
}

/** Centered modal card on a dimmed backdrop. Escape and a backdrop click close it. */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 420
}: DialogProps): React.JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: '90vw',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-pop)',
          padding: '20px 22px 18px'
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{title}</h2>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>{children}</div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            marginTop: 18
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  )
}

interface PromptDialogProps {
  title: string
  description: React.ReactNode
  label: string
  initialValue?: string
  placeholder?: string
  submitLabel: string
  busyLabel: string
  mono?: boolean
  /** Returns a message when the value can't be submitted as typed. */
  validate?: (value: string) => string | null
  /** Resolves to an error message, or null on success (the dialog then closes). */
  onSubmit: (value: string) => Promise<string | null>
  onCancel: () => void
}

/** A dialog asking for one value (a folder name, a destination path). */
export function PromptDialog({
  title,
  description,
  label,
  initialValue = '',
  placeholder,
  submitLabel,
  busyLabel,
  mono,
  validate,
  onSubmit,
  onCancel
}: PromptDialogProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const trimmed = value.trim()
  const validationError = trimmed ? (validate?.(trimmed) ?? null) : null
  const canSubmit = trimmed.length > 0 && !validationError && !busy
  const error = validationError ?? serverError

  async function submit(): Promise<void> {
    if (!canSubmit) return
    setBusy(true)
    const result = await onSubmit(trimmed)
    setBusy(false)
    setServerError(result)
  }

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {busy ? busyLabel : submitLabel}
          </button>
        </>
      }
    >
      <p style={{ marginBottom: 12 }}>{description}</p>
      <input
        autoFocus
        className="input"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setServerError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
        style={{
          width: '100%',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: mono ? 13 : 14,
          borderColor: error ? 'var(--danger)' : undefined
        }}
      />
      <div style={{ minHeight: 18, fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
        {error}
      </div>
    </Dialog>
  )
}
