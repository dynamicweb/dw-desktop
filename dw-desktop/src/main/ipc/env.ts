import { ipcMain } from 'electron'
import { addEnv, getActiveEnv, getEnvs, removeEnv, setActiveEnv, updateEnv } from '../config'
import { deleteAllCredentials } from '../credentials'
import type { IPCResult, StoredEnv } from '../../shared/types'

export function registerEnvHandlers(): void {
  ipcMain.handle('env:list', (): IPCResult<StoredEnv[]> => {
    return { ok: true, data: getEnvs() }
  })

  ipcMain.handle('env:add', (_event, env: StoredEnv): IPCResult => {
    addEnv(env)
    return { ok: true }
  })

  ipcMain.handle('env:remove', async (_event, name: string): Promise<IPCResult> => {
    removeEnv(name)
    await deleteAllCredentials(name)
    return { ok: true }
  })

  ipcMain.handle('env:update', (_event, env: StoredEnv): IPCResult => {
    updateEnv(env)
    return { ok: true }
  })

  ipcMain.handle('env:setActive', (_event, name: string): IPCResult => {
    setActiveEnv(name)
    return { ok: true }
  })

  ipcMain.handle('env:getActive', (): IPCResult<StoredEnv> => {
    const env = getActiveEnv()
    if (!env) return { ok: true, data: undefined }
    return { ok: true, data: env }
  })
}
