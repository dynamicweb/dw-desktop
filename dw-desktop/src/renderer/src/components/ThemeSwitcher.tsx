import type { ThemeMode } from '../../../shared/types'

interface ThemeSwitcherProps {
  theme: ThemeMode
  onChange: (t: ThemeMode) => void
}

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'auto',  label: 'Auto'  },
  { value: 'dark',  label: 'Dark'  }
]

export default function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--r-sm)',
        overflow: 'hidden',
        height: 22
      }}
    >
      {OPTIONS.map(({ value, label }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            style={{
              padding: '0 8px',
              height: '100%',
              fontSize: 10,
              fontFamily: 'var(--font-ui)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              border: 'none',
              borderRight: value !== 'dark' ? '1px solid var(--border-strong)' : 'none',
              background: active ? 'var(--accent)' : 'var(--surface-raised)',
              color: active ? '#fff' : 'var(--text-subtle)',
              transition: 'background 80ms ease-out, color 80ms ease-out'
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
