import { ipcMain } from 'electron'
import { loadActivity, saveActivity } from '../activity'
import type { TransferJob } from '../../shared/types'

export function registerActivityHandlers(): void {
  ipcMain.handle('activity:load', (): TransferJob[] => loadActivity())

  // Fire-and-forget so the renderer can still flush it while the window closes.
  ipcMain.on('activity:save', (_event, jobs: TransferJob[]) => {
    try {
      saveActivity(jobs)
    } catch (error) {
      console.error('Could not save activity history:', error)
    }
  })
}
