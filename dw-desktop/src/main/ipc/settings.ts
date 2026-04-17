import { ipcMain } from 'electron'
import { getPaneState, getTheme, setPaneState, setTheme } from '../config'
import type { IPCResult, PaneState, ThemeMode } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getTheme', (): IPCResult<ThemeMode> => {
    return { ok: true, data: getTheme() }
  })

  ipcMain.handle('settings:setTheme', (_event, theme: ThemeMode): IPCResult => {
    setTheme(theme)
    return { ok: true }
  })

  ipcMain.handle('settings:getPaneState', (_event, envName: string): IPCResult<PaneState> => {
    return { ok: true, data: getPaneState(envName) }
  })

  ipcMain.handle(
    'settings:setPaneState',
    (_event, payload: { envName: string; patch: PaneState }): IPCResult => {
      setPaneState(payload.envName, payload.patch)
      return { ok: true }
    }
  )
}
