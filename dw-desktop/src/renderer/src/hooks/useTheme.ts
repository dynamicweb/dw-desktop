import { useCallback, useEffect, useState } from 'react'
import type { ThemeMode } from '../../../shared/types'

function applyTheme(mode: ThemeMode, osDark: boolean): void {
  const root = document.documentElement
  root.setAttribute('data-theme', mode)
  root.setAttribute('data-os-dark', String(osDark))
}

export function useTheme(): { theme: ThemeMode; setTheme: (t: ThemeMode) => void } {
  const [theme, setThemeState] = useState<ThemeMode>('auto')
  const [osDark, setOsDark] = useState<boolean>(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  // Load persisted theme on mount
  useEffect(() => {
    void window.dw.settings.getTheme().then((res) => {
      const loaded = res.data ?? 'auto'
      setThemeState(loaded)
      applyTheme(loaded, osDark)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep OS preference in sync
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => {
      setOsDark(e.matches)
      applyTheme(theme, e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Apply whenever theme or osDark changes
  useEffect(() => {
    applyTheme(theme, osDark)
  }, [theme, osDark])

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t)
    void window.dw.settings.setTheme(t)
  }, [])

  return { theme, setTheme }
}
