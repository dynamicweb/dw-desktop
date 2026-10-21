import { ipcMain } from 'electron'
import {
  deleteSync,
  getPaneState,
  getSyncs,
  getTheme,
  saveSync,
  setPaneState,
  setTheme
} from '../config'
import type { IPCResult, PaneState, SavedSync, ThemeMode } from '../../shared/types'

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

  ipcMain.handle('settings:getSyncs', (_event, envName: string): IPCResult<SavedSync[]> => {
    return { ok: true, data: getSyncs(envName) }
  })

  ipcMain.handle(
    'settings:saveSync',
    (_event, payload: { envName: string; sync: SavedSync }): IPCResult => {
      saveSync(payload.envName, payload.sync)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'settings:deleteSync',
    (_event, payload: { envName: string; id: string }): IPCResult => {
      deleteSync(payload.envName, payload.id)
      return { ok: true }
    }
  )
}
