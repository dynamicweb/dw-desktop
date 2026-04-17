import { ipcMain } from 'electron'
import { getTheme, setTheme } from '../config'
import type { IPCResult, ThemeMode } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getTheme', (): IPCResult<ThemeMode> => {
    return { ok: true, data: getTheme() }
  })

  ipcMain.handle('settings:setTheme', (_event, theme: ThemeMode): IPCResult => {
    setTheme(theme)
    return { ok: true }
  })
}
