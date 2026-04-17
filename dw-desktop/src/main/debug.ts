import { BrowserWindow, ipcMain } from 'electron'

export interface DebugEntry {
  ts: string
  method: string
  url: string
  status?: number | string
  body?: string
}

const entries: DebugEntry[] = []

export function debugLog(method: string, url: string, status?: number | string, body?: string): void {
  const entry: DebugEntry = { ts: new Date().toISOString(), method, url, status, body }
  entries.push(entry)
  // Broadcast to all windows (guard for test environment)
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('debug:entry', entry)
    }
  } catch {
    // BrowserWindow not available (e.g. in test environment)
  }
}

export function registerDebugHandlers(): void {
  ipcMain.handle('debug:getAll', () => entries)
}
