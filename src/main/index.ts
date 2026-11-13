import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerSaveBlocker,
  screen,
  session,
  shell
} from 'electron'
import type { PhotoFaces } from '@shared/faces'
import { areaBounds } from '@shared/display'
import {
  IPC,
  type DisplayInfo,
  type EmbedResult,
  type ExportResult,
  type FaceModel,
  type PhotoList,
  type RelBox,
  type ShowOptions
} from '@shared/ipc'
import type { QueueOp, RemoteState, ShowCommand, ShowNotice, ShowStatus } from '@shared/remote'
import { REMOTE_KEYS } from '@shared/remote'
import {
  EFFECT_LABELS,
  PAN_OTHERS,
  TRANSITION_LABELS,
  WORLD_FORMATION_LABELS,
  type Settings
} from '@shared/settings'
import { FaceStore } from './faces'
import { photoInfo } from './photoInfo'
import { handlePhotoProtocol, listPhotos, registerPhotoScheme } from './photos'
import { QueueStore } from './queue'
import { exportPackage } from './exportPackage'
import { cleanDuplicates } from './dupesClean'
import { dataLocation, setupDataLocation } from './portable'
import { RemoteServer } from './remote'
import { iconPath, iconPng } from './resources'
import { loadSettings, photoFolder, updateSettings } from './settings'
import { ThumbCache } from './thumbs'

registerPhotoScheme()

// Datenordner: portabel neben dem Programm oder im Benutzerordner; in der Entwicklung
// PP_USER_DATA, damit Testläufe nie die echten Daten des Nutzers überschreiben.
setupDataLocation()

let settingsWindow: BrowserWindow | null = null
let showWindow: BrowserWindow | null = null
let indexerWindow: BrowserWindow | null = null
let remoteWindow: BrowserWindow | null = null
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
    queue: queue.get(),
    settings,
    persons: s.persons.map((p) => ({ id: p.id, name: p.name })),
    labels: {
      transitions: TRANSITION_LABELS,
      panOthers: PAN_OTHERS,
      effects: EFFECT_LABELS,
      formations: WORLD_FORMATION_LABELS
    }
  }
}

function showCommand(cmd: ShowCommand, arg?: string): void {
  if (cmd === 'start') startShow()
  else if (cmd === 'stop') stopShow()
  else if (showWindow) showWindow.webContents.send(IPC.showCommand, { cmd, arg })
  else if (cmd !== 'qr') notify({ text: 'Die Show läuft nicht – erst starten', kind: 'warn' })
}

/** Rückmeldung an die Fernbedienung. */
function notify(notice: ShowNotice): void {
  remote.notify(notice)
}

/** Manuelle Reihenfolge aus der Galerie der Fernbedienung. */
const queue = new QueueStore((q) => {
  if (showWindow && !showWindow.isDestroyed()) showWindow.webContents.send(IPC.queueChanged, q)
  remote.broadcast()
})

function applyQueueOp(op: QueueOp): void {
  // Die Anfrage kommt vom Handy: nur bekannte Befehle mit passenden Werten.
  if (op?.op === 'add' && typeof op.name === 'string') {
    queue.apply({ op: 'add', name: op.name })
    if (!showWindow) notify({ text: 'Vorgemerkt – läuft, sobald die Show startet', kind: 'ok' })
  } else if (op?.op === 'remove' && typeof op.id === 'string') queue.apply(op)
  else if (op?.op === 'move' && typeof op.id === 'string' && typeof op.to === 'number')
    queue.apply(op)
  else if (op?.op === 'clear') queue.apply(op)
}

const thumbs = new ThumbCache(
  () => join(app.getPath('userData'), 'thumbs'),
  (request) => {
    if (!indexerWindow || indexerWindow.isDestroyed()) return false
    indexerWindow.webContents.send(IPC.thumbRequest, request)
    return true
  }
)

/** Fotoliste für Show und Galerie: bei „Doppelte überspringen“ ohne die schwächeren Fassungen. */
async function showPhotos(): Promise<PhotoList> {
  const list = await listPhotos()
  const duplicates = faceStore?.duplicateNames() ?? []
  if (!loadSettings().dupesSkip || !duplicates.length) return { ...list, duplicates }
  const skip = new Set(duplicates)
  return { ...list, files: list.files.filter((f) => !skip.has(f)), duplicates }
}

const remote = new RemoteServer({
  state: remoteState,
  applySettings: (patch) => setSettings(patch),
  command: showCommand,
  photos: async () => (await showPhotos()).files,
  thumb: (name) => thumbs.get(name),
  queue: applyQueueOp,
  icon: iconPng
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
    icon: iconPath(),
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
  // Für Tests in der Entwicklung: PP_SETTINGS_SCROLL=<Kartentitel> scrollt zu dieser Karte.
  const scrollTo = !app.isPackaged ? process.env['PP_SETTINGS_SCROLL'] : undefined
  if (scrollTo) {
    const win = settingsWindow
    setInterval(() => {
      if (win.isDestroyed()) return
      void win.webContents
        .executeJavaScript(
          `[...document.querySelectorAll('h3, h2')].find(h => h.textContent.trim().toLowerCase() === ${JSON.stringify(scrollTo.toLowerCase())})?.scrollIntoView({ block: 'start' })`
        )
        .catch(() => undefined)
    }, 1500)
  }
}

function startShow(options: ShowOptions = {}): void {
  if (showWindow) {
    showWindow.focus()
    return
  }
  const { showArea } = loadSettings()
  const display = showDisplay()
  const area = areaBounds(display.bounds, showArea)
  const work = display.workArea
  let placement: Electron.BrowserWindowConstructorOptions
  if (options.windowed) {
    // Vorschau im Seitenverhältnis des gewählten Bereichs, handlich auch bei sehr breiten Bildschirmen.
    let width = Math.round(Math.min(1280, work.width * 0.55))
    let height = Math.round(Math.min(work.height * 0.8, (width * area.height) / area.width))
    width = Math.round((height * area.width) / area.height)
    // Nur Entwicklung: feste Größe für Aufnahmen, z. B. PP_SHOW_SIZE=1280x720
    const fixed = !app.isPackaged && /^(\d+)x(\d+)$/.exec(process.env['PP_SHOW_SIZE'] ?? '')
    if (fixed) {
      width = Number(fixed[1])
      height = Number(fixed[2])
    }
    placement = {
      width,
      height,
      useContentSize: !!fixed,
      x: Math.round(work.x + (work.width - width) / 2),
      y: Math.round(work.y + (work.height - height) / 2),
      title: 'PhotoPresenter – Vorschau',
      autoHideMenuBar: true
    }
  } else if (showArea === 'full') {
    placement = { ...display.bounds, fullscreen: true, frame: false }
  } else {
    // Nur ein Teil des Bildschirms: randloses Fenster genau über diesem Bereich.
    placement = {
      ...area,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true
    }
  }
  showWindow = new BrowserWindow({
    icon: iconPath(),
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
  showWindow.once('ready-to-show', () => {
    if (!showWindow) return
    // Teilbereich: über der Taskleiste bleiben und die Lage sicher festnageln.
    if (!options.windowed && showArea !== 'full') {
      showWindow.setAlwaysOnTop(true, 'screen-saver')
      showWindow.setBounds(area)
    }
    showWindow.show()
  })
  showWindow.on('closed', () => {
    showWindow = null
    if (powerBlockId !== null) powerSaveBlocker.stop(powerBlockId)
    powerBlockId = null
    showStatus = { running: false, paused: false, label: '' }
    queue.stopped()
    remote.broadcast()
    if (!settingsWindow) app.quit()
  })
  showStatus = { running: true, paused: false, label: '' }
  remote.broadcast()
  powerBlockId = powerSaveBlocker.start('prevent-display-sleep')
  // Für Tests in der Entwicklung: Frame-Messung mit PP_PERF=1.
  loadPage(showWindow, 'show', !app.isPackaged && process.env['PP_PERF'] ? 'perf' : '')
  captureForTests(showWindow, 'show')
  commandsForTests()
}

/** Weitergabe-Paket: Zielordner wählen, dann Programm, Fotos und Daten dorthin kopieren. */
async function createPackage(target?: string): Promise<ExportResult | null> {
  if (target) return runExport(target)
  const options: Electron.OpenDialogOptions = {
    title: 'Wohin soll das Paket? (z. B. USB-Stick)',
    defaultPath: app.getPath('desktop'),
    properties: ['openDirectory', 'createDirectory']
  }
  const picked = settingsWindow
    ? await dialog.showOpenDialog(settingsWindow, options)
    : await dialog.showOpenDialog(options)
  const parent = picked.canceled ? undefined : picked.filePaths[0]
  return parent ? runExport(parent) : null
}

function runExport(parent: string): Promise<ExportResult> {
  faceStore.flush()
  return exportPackage(
    parent,
    loadSettings(),
    (file) => faceStore.exportTo(file),
    (p) => settingsWindow?.webContents.send(IPC.exportProgress, p)
  )
}

/** Bildschirme von links nach rechts (bzw. oben nach unten), so nummeriert wie in den Einstellungen. */
function sortedDisplays(): Electron.Display[] {
  return screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
}

/** Bildschirm für die Show: der gewählte, sonst (oder wenn er fehlt) der mit der Maus. */
function showDisplay(): Electron.Display {
  const wanted = loadSettings().showDisplay
  const found = wanted ? screen.getAllDisplays().find((d) => String(d.id) === wanted) : undefined
  return found ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return sortedDisplays().map((d, i) => ({
    id: String(d.id),
    number: i + 1,
    label: d.label || `Bildschirm ${i + 1}`,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    primary: d.id === primary
  }))
}

/** Auf jedem Bildschirm 3 Sekunden lang groß seine Nummer zeigen. */
function identifyDisplays(): void {
  for (const [i, d] of sortedDisplays().entries()) {
    const w = 360
    const h = 260
    const win = new BrowserWindow({
      x: Math.round(d.bounds.x + (d.bounds.width - w) / 2),
      y: Math.round(d.bounds.y + (d.bounds.height - h) / 2),
      width: w,
      height: h,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
    })
    const size = `${Math.round(d.size.width * d.scaleFactor)} × ${Math.round(d.size.height * d.scaleFactor)}`
    const html =
      `<html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;` +
      `justify-content:center;background:rgba(15,17,25,.9);color:#fff;font-family:system-ui,sans-serif;` +
      `border-radius:24px;border:3px solid #818cf8;box-sizing:border-box">` +
      `<div style="font-size:120px;font-weight:700;line-height:1">${i + 1}</div>` +
      `<div style="font-size:18px;opacity:.75;margin-top:10px">${size}</div></body></html>`
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    win.once('ready-to-show', () => win.showInactive())
    setTimeout(() => !win.isDestroyed() && win.close(), 3000)
  }
}

/**
 * Nur für Tests in der Entwicklung: PP_TEST_COMMANDS="8:say:Hallo;8:effect:hearts;20:freeze"
 * schickt Befehle nach so vielen Sekunden an die Show (wie von der Fernbedienung);
 * "8:key:i" drückt eine Taste im Show-Fenster, "8:queue:foto.jpg" reiht ein Foto ein.
 */
function commandsForTests(): void {
  const list = process.env['PP_TEST_COMMANDS']
  if (app.isPackaged || !list) return
  for (const entry of list.split(';')) {
    const [sec, cmd, ...rest] = entry.split(':')
    const arg = rest.join(':') || undefined
    setTimeout(
      () => {
        if (cmd === 'key' && arg) {
          showWindow?.webContents.sendInputEvent({ type: 'keyDown', keyCode: arg })
          showWindow?.webContents.sendInputEvent({ type: 'char', keyCode: arg })
          showWindow?.webContents.sendInputEvent({ type: 'keyUp', keyCode: arg })
        } else if (cmd === 'queue' && arg) applyQueueOp({ op: 'add', name: arg })
        else if (cmd === 'drag' && arg && remoteWindow) {
          // "8:drag:x1,y1,x2,y2": im Fernbedienungs-Fenster gedrückt halten und ziehen
          const [x1, y1, x2, y2] = arg.split(',').map(Number)
          const wc = remoteWindow.webContents
          wc.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 })
          setTimeout(() => {
            for (let i = 1; i <= 10; i++) {
              const x = Math.round(x1 + ((x2 - x1) * i) / 10)
              const y = Math.round(y1 + ((y2 - y1) * i) / 10)
              setTimeout(
                () => wc.sendInputEvent({ type: 'mouseMove', x, y, button: 'left' }),
                i * 40
              )
            }
            setTimeout(
              () =>
                wc.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 }),
              600
            )
          }, 600)
        } else showCommand(cmd as ShowCommand, arg)
      },
      Number(sec) * 1000
    )
  }
}

/**
 * Nur für Tests in der Entwicklung: Ist PP_CAPTURE_DIR gesetzt, wird alle 2 s ein Bild
 * des Fensters gespeichert (nur das eigene Fenster, nie der Bildschirm).
 */
function captureForTests(win: BrowserWindow, prefix: string): void {
  const dir = process.env['PP_CAPTURE_DIR']
  if (app.isPackaged || !dir) return
  let n = 0
  const timer = setInterval(
    async () => {
      if (win.isDestroyed()) return clearInterval(timer)
      try {
        const image = await win.webContents.capturePage()
        await mkdir(dir, { recursive: true })
        await writeFile(
          join(dir, `${prefix}${String(++n).padStart(2, '0')}.jpg`),
          image.resize({ width: Number(process.env['PP_CAPTURE_WIDTH']) || 960 }).toJPEG(88)
        )
      } catch {
        // Fenster gerade verdeckt oder im Aufbau: diese Aufnahme auslassen.
      }
    },
    Number(process.env['PP_CAPTURE_MS']) || 2000
  )
}

/** Sitzung des Fernbedienungs-Fensters: Anfragen gehen direkt an den Server-Code, ohne Netzwerk. */
const REMOTE_HOST = 'http://fernbedienung.local'
let remoteSession: Electron.Session | null = null
function remoteWindowSession(): Electron.Session {
  if (!remoteSession) {
    remoteSession = session.fromPartition('fernbedienung')
    remoteSession.protocol.handle('http', (request) => remote.fetch(request))
  }
  return remoteSession
}

/**
 * Fernbedienung als eigenes Fenster auf diesem Rechner (Taste R in der Show): am liebsten auf
 * einem anderen Bildschirm als die Show, sonst rechts oben darüber. Erneut R schließt es.
 * Braucht weder Netzwerk noch freien Port (läuft auch bei ausgeschalteter Handy-Fernbedienung).
 */
function toggleRemoteWindow(hash = ''): { ok: boolean; error?: string } {
  if (remoteWindow && !remoteWindow.isDestroyed()) {
    remoteWindow.close()
    return { ok: true }
  }
  const showDisplay = showWindow
    ? screen.getDisplayMatching(showWindow.getBounds())
    : screen.getPrimaryDisplay()
  const other = screen.getAllDisplays().find((d) => d.id !== showDisplay.id)
  const area = (other ?? showDisplay).workArea
  const width = 440
  const height = Math.min(960, area.height - 40)
  remoteWindow = new BrowserWindow({
    icon: iconPath(),
    x: Math.round(other ? area.x + (area.width - width) / 2 : area.x + area.width - width - 24),
    y: area.y + 20,
    width,
    height,
    title: 'PhotoPresenter – Fernbedienung',
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    // Auf demselben Bildschirm über der Vollbild-Show bleiben.
    alwaysOnTop: !other && !!showWindow,
    webPreferences: { sandbox: true, contextIsolation: true, session: remoteWindowSession() }
  })
  remoteWindow.on('closed', () => (remoteWindow = null))
  if (!app.isPackaged) {
    remoteWindow.webContents.on('console-message', ({ level, message }) => {
      if (level === 'warning' || level === 'error') console.log(`[remote:${level}] ${message}`)
    })
  }
  void remoteWindow.loadURL(`${REMOTE_HOST}/${hash}`)
  return { ok: true }
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
  ipcMain.handle(IPC.listPhotos, (e) =>
    // Die Show bekommt die bereinigte Liste, das Einstellungsfenster alle Fotos.
    e.sender === showWindow?.webContents ? showPhotos() : listPhotos()
  )
  ipcMain.handle(IPC.getDuplicates, () => faceStore.duplicateInfo())
  ipcMain.handle(IPC.cleanDuplicates, async (_e, mode: 'move' | 'trash') => {
    const result = await cleanDuplicates(
      photoFolder(),
      faceStore.duplicateNames(),
      mode === 'trash' ? 'trash' : 'move',
      (path) => shell.trashItem(path)
    )
    await faceStore.rescan()
    broadcast(IPC.photosChanged, null)
    return result
  })
  ipcMain.on(IPC.showStatus, (_e, status: ShowStatus) => {
    showStatus = { ...status, running: showWindow !== null }
    remote.broadcast()
  })
  ipcMain.handle(IPC.remoteInfo, () => remote.info(loadSettings().remoteEnabled))
  ipcMain.handle(IPC.sendShowCommand, (_e, cmd: ShowCommand, arg?: string) => showCommand(cmd, arg))
  ipcMain.on(IPC.showNotice, (_e, notice: ShowNotice) => notify(notice))
  ipcMain.handle(IPC.listDisplays, () => listDisplays())
  ipcMain.handle(IPC.dataInfo, () => ({ ...dataLocation(), dev: !app.isPackaged }))
  ipcMain.handle(IPC.exportPackage, () => createPackage())
  ipcMain.handle(IPC.openPath, (_e, path: string) => void shell.openPath(path))
  ipcMain.handle(IPC.identifyDisplays, () => identifyDisplays())
  ipcMain.handle(IPC.openRemote, () => toggleRemoteWindow())
  ipcMain.handle(IPC.photoInfo, (_e, name: string) => photoInfo(name))
  ipcMain.handle(IPC.getQueue, () => queue.get())
  ipcMain.on(IPC.queuePlaying, (_e, id: string | null) => queue.setPlaying(id))
  ipcMain.handle(IPC.thumbResult, (_e, requestId: number, data: Uint8Array | null) =>
    thumbs.handleResult(requestId, data)
  )
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
  ipcMain.handle(IPC.hashResult, (_e, name: string, phash: string | null, w: number, h: number) =>
    faceStore.storeHash(name, phash, w, h)
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

  // Nur für Tests in der Entwicklung: PP_TEST_EXPORT=<ordner> erstellt dort ein Paket.
  const testExport = !app.isPackaged ? process.env['PP_TEST_EXPORT'] : undefined
  if (testExport) {
    setTimeout(() => {
      void createPackage(testExport).then((r) => console.log('[export]', JSON.stringify(r)))
    }, 3000)
  }

  // Nur für Tests in der Entwicklung: Handy-Seite der Fernbedienung in iPhone-Größe öffnen.
  if (!app.isPackaged && process.env['PP_REMOTE_PREVIEW']) {
    setTimeout(() => {
      // PP_REMOTE_PREVIEW=fotos (texte, ablauf …) öffnet direkt diesen Reiter
      const tab = process.env['PP_REMOTE_PREVIEW'] ?? ''
      toggleRemoteWindow(['1', 'zoom'].includes(tab) ? '' : '#' + tab)
      const phone = remoteWindow
      if (!phone) return
      phone.setAlwaysOnTop(false)
      // PP_REMOTE_PREVIEW=zoom zeigt die ganze Seite verkleinert (für Aufnahmen)
      if (process.env['PP_REMOTE_PREVIEW'] === 'zoom') {
        phone.setSize(390, 1900)
        phone.webContents.once('did-finish-load', () => phone.webContents.setZoomFactor(0.5))
      } else phone.setSize(390, 844)
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
