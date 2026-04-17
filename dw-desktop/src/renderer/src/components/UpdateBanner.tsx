import { useEffect, useState } from 'react'

type State = 'idle' | 'available' | 'downloaded'

export default function UpdateBanner(): React.JSX.Element | null {
  const [state, setState] = useState<State>('idle')
  const [version, setVersion] = useState('')

  useEffect(() => {
    const offAvailable = window.dw.on.updaterAvailable((info) => {
      setVersion(info.version)
      setState('available')
    })
    const offDownloaded = window.dw.on.updaterDownloaded((info) => {
      setVersion(info.version)
      setState('downloaded')
    })
    return () => {
      offAvailable()
      offDownloaded()
    }
  }, [])

  if (state === 'idle') return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        background: 'var(--accent)',
        color: '#fff',
        fontSize: 12,
        fontFamily: 'var(--font-ui)',
        flexShrink: 0,
        gap: 12
      }}
    >
      <span>
        {state === 'available'
          ? `v${version} is downloading…`
          : `v${version} is ready — restart to update`}
      </span>
      {state === 'downloaded' && (
        <button
          type="button"
          onClick={() => window.dw.updater.installNow()}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: 5,
            color: '#fff',
            fontSize: 11,
            fontFamily: 'var(--font-ui)',
            padding: '2px 10px',
            cursor: 'pointer'
          }}
        >
          Restart now
        </button>
      )}
    </div>
  )
}
