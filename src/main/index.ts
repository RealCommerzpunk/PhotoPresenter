import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, screen, shell } from 'electron'
import type { PhotoFaces } from '@shared/faces'
import { IPC, type EmbedResult, type FaceModel, type RelBox, type ShowOptions } from '@shared/ipc'
import type { ShowCommand, ShowStatus, RemoteState } from '@shared/remote'
import { REMOTE_KEYS } from '@shared/remote'
import { EFFECT_LABELS, PAN_OTHERS, TRANSITION_LABELS, type Settings } from '@shared/settings'
import { FaceStore } from './faces'
import { handlePhotoProtocol, listPhotos, registerPhotoScheme } from './photos'
import { RemoteServer } from './remote'
import { loadSettings, photoFolder, updateSettings } from './settings'

registerPhotoScheme()

// Nur in der Entwicklung: eigener Datenordner (Einstellungen, Gesichtsindex) für Tests,
// damit Testläufe nie die echten Daten des Nutzers überschreiben.
if (!app.isPackaged && process.env['PP_USER_DATA']) {
  app.setPath('userData', process.env['PP_USER_DATA'])
}

let settingsWindow: BrowserWindow | null = null
let showWindow: BrowserWindow | null = null
let indexerWindow: BrowserWindow | null = null
let powerBlockId: number | null = null
let faceStore: FaceStore
let showStatus: ShowStatus = { running: false, paused: false, label: '' }

/** Fernbedienung: Zustand für die Handy-Seite. */
function remoteState(): RemoteState {
  const s = loadSettings()
  const settings = Object.fromEntries(REMOTE_KEYS.map((k) => [k, s[k]])) as RemoteState['settings']
  return {
    version: app.getVersion(),
    show: showStatus,
    settings,
    persons: s.persons.map((p) => ({ id: p.id, name: p.name })),
    labels: { transitions: TRANSITION_LABELS, panOthers: PAN_OTHERS, effects: EFFECT_LABELS }
  }
}

function showCommand(cmd: ShowCommand): void {
  if (cmd === 'start') startShow()
  else if (cmd === 'stop') stopShow()
  else showWindow?.webContents.send(IPC.showCommand, cmd)
}

const remote = new RemoteServer({
  state: remoteState,
  applySettings: (patch) => setSettings(patch),
  command: showCommand
})

/** Sendet an alle sichtbaren Fenster (nicht an das Analyse-Fenster). */
function broadcast(channel: string, value: unknown): void {
  for (const win of [settingsWindow, showWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, value)
  }
}

const preload = join(__dirname, '../preload/index.js')

function loadPage(win: BrowserWindow, page: 'settings' | 'show' | 'indexer', hash = ''): void {
  if (!app.isPackaged) {
    // Warnungen und Fehler der Fenster im Terminal zeigen.
    win.webContents.on('console-message', ({ level, message }) => {
      const log =
        level === 'warning' || level === 'error' || (page === 'indexer' && level === 'info')
      if (log) console.log(`[${page}:${level}] ${message}`)
    })
  }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(`${devUrl}/${page}/index.html${hash ? '#' + hash : ''}`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`), { hash })
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
  // Für Tests in der Entwicklung: Startseite über PP_SETTINGS_PAGE wählen.
  const page = !app.isPackaged ? (process.env['PP_SETTINGS_PAGE'] ?? '') : ''
  loadPage(settingsWindow, 'settings', page)
  captureForTests(settingsWindow, 'settings')
}

function startShow(options: ShowOptions = {}): void {
  if (showWindow) {
    showWindow.focus()
    return
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width } = display.workAreaSize
  const placement = options.windowed
    ? {
        // Auch bei sehr breiten (zusammengeschalteten) Bildschirmen handlich bleiben.
        width: Math.round(Math.min(1280, width * 0.55)),
        height: Math.round(Math.min(1280, width * 0.55) * (9 / 16)),
        title: 'PhotoPresenter – Vorschau',
        autoHideMenuBar: true
      }
    : { ...display.bounds, fullscreen: true, frame: false }
  showWindow = new BrowserWindow({
    ...placement,
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
    showStatus = { running: false, paused: false, label: '' }
    remote.broadcast()
    if (!settingsWindow) app.quit()
  })
  showStatus = { running: true, paused: false, label: '' }
  remote.broadcast()
  powerBlockId = powerSaveBlocker.start('prevent-display-sleep')
  // Für Tests in der Entwicklung: Frame-Messung mit PP_PERF=1.
  loadPage(showWindow, 'show', !app.isPackaged && process.env['PP_PERF'] ? 'perf' : '')
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

/** Unsichtbares Fenster, das die Fotos im Hintergrund nach Gesichtern durchsucht. */
function createIndexerWindow(): void {
  indexerWindow = new BrowserWindow({
    show: false,
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  indexerWindow.on('closed', () => (indexerWindow = null))
  loadPage(indexerWindow, 'indexer')
}

function stopShow(): void {
  showWindow?.close()
}

async function pickFolder(): Promise<string | null> {
  const parent = settingsWindow ?? BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: 'Fotoordner wählen',
    defaultPath: photoFolder() || app.getPath('pictures'),
    properties: ['openDirectory']
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

function setSettings(patch: Partial<Settings>): Settings {
  const prev = loadSettings()
  const next = updateSettings(patch)
  broadcast(IPC.settingsChanged, next)
  if (next.photoFolder !== prev.photoFolder || next.includeSubfolders !== prev.includeSubfolders) {
    void faceStore.rescan()
  }
  if (next.remoteEnabled !== prev.remoteEnabled || next.remotePort !== prev.remotePort) {
    void (next.remoteEnabled ? remote.start(next.remotePort) : remote.stop())
  }
  remote.broadcast()
  return next
}

app.whenReady().then(() => {
  handlePhotoProtocol()
  ipcMain.handle(IPC.startShow, (_e, options?: ShowOptions) => startShow(options))
  ipcMain.handle(IPC.stopShow, () => stopShow())
  ipcMain.handle(IPC.appVersion, () => app.getVersion())
  ipcMain.handle(IPC.getSettings, () => loadSettings())
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => setSettings(patch))
  ipcMain.handle(IPC.pickFolder, () => pickFolder())
  ipcMain.handle(IPC.listPhotos, () => listPhotos())
  ipcMain.on(IPC.showStatus, (_e, status: ShowStatus) => {
    showStatus = { ...status, running: showWindow !== null }
    remote.broadcast()
  })
  ipcMain.handle(IPC.remoteInfo, () => remote.info(loadSettings().remoteEnabled))
  ipcMain.handle(IPC.sendShowCommand, (_e, cmd: ShowCommand) => showCommand(cmd))
  if (loadSettings().remoteEnabled) void remote.start(loadSettings().remotePort)

  faceStore = new FaceStore(
    (status) => broadcast(IPC.faceStatusChanged, status),
    () => indexerWindow?.webContents.send(IPC.faceWake),
    () => showWindow !== null,
    (patch) => setSettings(patch),
    (request) => indexerWindow?.webContents.send(IPC.embedRequest, request)
  )
  ipcMain.handle(IPC.faceModel, (_e, model: FaceModel) => faceStore.model(model))
  ipcMain.handle(IPC.faceJob, () => faceStore.nextJob())
  ipcMain.handle(IPC.faceResult, (_e, name: string, result: PhotoFaces | null, error?: string) =>
    faceStore.storeResult(name, result, error)
  )
  ipcMain.handle(IPC.faceStatus, () => faceStore.status())
  ipcMain.handle(IPC.getFaces, (_e, name: string) => faceStore.getFaces(name))
  ipcMain.handle(IPC.listFaces, (_e, personId?: string, photo?: string) =>
    faceStore.listFaces(personId, photo)
  )
  ipcMain.handle(IPC.toggleNegative, (_e, personId: string, photo: string, face: number) =>
    faceStore.toggleNegative(personId, photo, face)
  )
  ipcMain.handle(
    IPC.markFace,
    (_e, personId: string, photo: string, box: RelBox, negative: boolean) =>
      faceStore.markFace(personId, photo, box, negative)
  )
  ipcMain.handle(
    IPC.embedResult,
    (_e, requestId: number, result: EmbedResult | null, error?: string) =>
      faceStore.handleEmbedResult(requestId, result, error)
  )
  ipcMain.handle(IPC.toggleSample, (_e, personId: string, photo: string, face: number) =>
    faceStore.toggleSample(personId, photo, face)
  )
  ipcMain.handle(IPC.focusPhotos, () => faceStore.focusPhotos())
  ipcMain.handle(IPC.reindexFaces, () => faceStore.reindex())
  createIndexerWindow()
  void faceStore.rescan()

  // Nur für Tests in der Entwicklung: Handy-Seite der Fernbedienung in iPhone-Größe öffnen.
  if (!app.isPackaged && process.env['PP_REMOTE_PREVIEW']) {
    setTimeout(() => {
      const phone = new BrowserWindow({ width: 390, height: 844, title: 'Fernbedienung (Test)' })
      phone.webContents.on('console-message', ({ level, message }) => {
        if (level === 'warning' || level === 'error') console.log(`[remote:${level}] ${message}`)
      })
      void phone.loadURL(`http://127.0.0.1:${loadSettings().remotePort}/`)
      captureForTests(phone, 'remote')
    }, 1500)
  }

  // `--show` startet direkt die Diashow (z. B. für Autostart als Bilderrahmen).
  // Für Tests in der Entwicklung: PP_SHOW_WINDOWED=1 öffnet die Show als Fenster-Vorschau.
  const windowed = !app.isPackaged && !!process.env['PP_SHOW_WINDOWED']
  if (process.argv.includes('--show')) startShow({ windowed })
  else createSettingsWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow()
  })
})

app.on('before-quit', () => {
  faceStore?.flush()
  void remote.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
