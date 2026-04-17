import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { initializeConfig } from './config'
import { registerDebugHandlers } from './debug'
import { registerEnvHandlers } from './ipc/env'
import { registerAuthHandlers } from './ipc/auth'
import { registerFileHandlers } from './ipc/files'
import { registerSettingsHandlers } from './ipc/settings'

if (process.platform === 'linux' && process.env['ELECTRON_ENABLE_LINUX_GPU'] !== '1') {
  app.disableHardwareAcceleration()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    minWidth: 800,
    height: 700,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    title: 'Truvio Commerce Cloud',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 12 },
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      defaultFontSize: 16,
      defaultMonospaceFontSize: 13,
      minimumFontSize: 10
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('updater:available', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('updater:downloaded', info)
  })

  ipcMain.on('updater:installNow', () => {
    autoUpdater.quitAndInstall()
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('dk.dynamicweb.dw-desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await initializeConfig()
  registerDebugHandlers()
  registerEnvHandlers()
  registerAuthHandlers()
  registerFileHandlers()
  registerSettingsHandlers()

  createWindow()

  if (!is.dev) {
    setupAutoUpdater()
    autoUpdater.checkForUpdates()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
