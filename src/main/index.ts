import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, powerSaveBlocker, screen, shell } from 'electron'
import { IPC } from '@shared/ipc'

let settingsWindow: BrowserWindow | null = null
let showWindow: BrowserWindow | null = null
let powerBlockId: number | null = null

const preload = join(__dirname, '../preload/index.js')

function loadPage(win: BrowserWindow, page: 'settings' | 'show'): void {
  if (!app.isPackaged) {
    // Warnungen und Fehler der Fenster im Terminal zeigen.
    win.webContents.on('console-message', ({ level, message }) => {
      if (level === 'warning' || level === 'error') console.log(`[${page}:${level}] ${message}`)
    })
  }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(`${devUrl}/${page}/index.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
  }
}

function createSettingsWindow(): void {
  settingsWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: 'PhotoPresenter',
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true }
  })
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  settingsWindow.on('closed', () => {
    settingsWindow = null
    if (!showWindow) app.quit()
  })
  loadPage(settingsWindow, 'settings')
}

function startShow(): void {
  if (showWindow) {
    showWindow.focus()
    return
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  showWindow = new BrowserWindow({
    ...display.bounds,
    fullscreen: true,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })
  showWindow.once('ready-to-show', () => showWindow?.show())
  showWindow.on('closed', () => {
    showWindow = null
    if (powerBlockId !== null) powerSaveBlocker.stop(powerBlockId)
    powerBlockId = null
    if (!settingsWindow) app.quit()
  })
  powerBlockId = powerSaveBlocker.start('prevent-display-sleep')
  loadPage(showWindow, 'show')
}

function stopShow(): void {
  showWindow?.close()
}

app.whenReady().then(() => {
  ipcMain.handle(IPC.startShow, () => startShow())
  ipcMain.handle(IPC.stopShow, () => stopShow())
  ipcMain.handle(IPC.appVersion, () => app.getVersion())

  // `--show` startet direkt die Diashow (z. B. für Autostart als Bilderrahmen).
  if (process.argv.includes('--show')) startShow()
  else createSettingsWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
