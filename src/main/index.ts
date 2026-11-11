import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, screen, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { Settings } from '@shared/settings'
import { handlePhotoProtocol, listPhotos, registerPhotoScheme } from './photos'
import { loadSettings, updateSettings } from './settings'

registerPhotoScheme()

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
  captureForTests(settingsWindow, 'settings')
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
  captureForTests(showWindow, 'show')
}

/**
 * Nur für Tests in der Entwicklung: Ist PP_CAPTURE_DIR gesetzt, wird alle 2 s ein Bild
 * des Fensters gespeichert (nur das eigene Fenster, nie der Bildschirm).
 */
function captureForTests(win: BrowserWindow, prefix: string): void {
  const dir = process.env['PP_CAPTURE_DIR']
  if (app.isPackaged || !dir) return
  let n = 0
  const timer = setInterval(async () => {
    if (win.isDestroyed()) return clearInterval(timer)
    const image = await win.webContents.capturePage()
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, `${prefix}${String(++n).padStart(2, '0')}.jpg`),
      image.resize({ width: 960 }).toJPEG(80)
    )
  }, 2000)
}

function stopShow(): void {
  showWindow?.close()
}

async function pickFolder(): Promise<string | null> {
  const parent = settingsWindow ?? BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: 'Fotoordner wählen',
    defaultPath: loadSettings().photoFolder || app.getPath('pictures'),
    properties: ['openDirectory']
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

function setSettings(patch: Partial<Settings>): Settings {
  const next = updateSettings(patch)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.settingsChanged, next)
  }
  return next
}

app.whenReady().then(() => {
  handlePhotoProtocol()
  ipcMain.handle(IPC.startShow, () => startShow())
  ipcMain.handle(IPC.stopShow, () => stopShow())
  ipcMain.handle(IPC.appVersion, () => app.getVersion())
  ipcMain.handle(IPC.getSettings, () => loadSettings())
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => setSettings(patch))
  ipcMain.handle(IPC.pickFolder, () => pickFolder())
  ipcMain.handle(IPC.listPhotos, () => listPhotos())

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
