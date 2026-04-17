import { BrowserWindow, ipcMain } from 'electron'

export interface DebugEntry {
  ts: string
  method: string
  url: string
  status?: number | string
  requestBody?: string
  responseBody?: string
}

const entries: DebugEntry[] = []

function broadcast(entry: DebugEntry): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('debug:entry', entry)
    }
  } catch {
    // BrowserWindow not available (e.g. in test environment)
  }
}

export function debugRequest(method: string, url: string, requestBody?: string): DebugEntry {
  const entry: DebugEntry = { ts: new Date().toISOString(), method, url, requestBody }
  entries.push(entry)
  broadcast(entry)
  return entry
}

export function debugResponse(entry: DebugEntry, status: number, responseBody?: string): void {
  entry.status = status
  entry.responseBody = responseBody
  broadcast(entry)
}

export function registerDebugHandlers(): void {
  ipcMain.handle('debug:getAll', () => entries)
}
