import type { FaceIndexStatus, FaceInfo, PhotoFaces, StoredFace } from './faces'
import type { RemoteInfo, ShowCommand, ShowStatus } from './remote'
import type { Settings } from './settings'

/** Kanalnamen für die Kommunikation zwischen Main-Prozess und Fenstern. */
export const IPC = {
  startShow: 'show:start',
  stopShow: 'show:stop',
  appVersion: 'app:version',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  settingsChanged: 'settings:changed',
  pickFolder: 'photos:pickFolder',
  listPhotos: 'photos:list',
  faceModel: 'faces:model',
  faceJob: 'faces:job',
  faceResult: 'faces:result',
  faceWake: 'faces:wake',
  faceStatus: 'faces:status',
  faceStatusChanged: 'faces:statusChanged',
  getFaces: 'faces:get',
  listFaces: 'faces:list',
  toggleSample: 'faces:toggleSample',
  toggleNegative: 'faces:toggleNegative',
  markFace: 'faces:mark',
  embedRequest: 'faces:embedRequest',
  embedResult: 'faces:embedResult',
  focusPhotos: 'faces:focusPhotos',
  reindexFaces: 'faces:reindex',
  showCommand: 'show:command',
  showStatus: 'show:status',
  remoteInfo: 'remote:info',
  sendShowCommand: 'show:sendCommand'
} as const

/** Schema des Protokolls, über das die Show Fotos aus dem gewählten Ordner lädt. */
export const PHOTO_SCHEME = 'photo'

/** URL für ein Foto (Pfad relativ zum Fotoordner). */
export function photoUrl(relativePath: string): string {
  return `${PHOTO_SCHEME}://local/${encodeURIComponent(relativePath)}`
}

export interface PhotoList {
  /** Fotoordner als absoluter Pfad (relative Angaben bereits aufgelöst). */
  folder: string
  /** Programmordner, gegen den relative Angaben aufgelöst werden. */
  base: string
  /** Relativer Pfad, falls der Ordner im Programmordner liegt. */
  relative?: string
  /** Die Einstellung ist bereits relativ angegeben. */
  settingIsRelative?: boolean
  /** Pfade relativ zum Fotoordner. */
  files: string[]
  error?: string
}

export interface ShowOptions {
  /** Vorschau in einem normalen Fenster statt Vollbild. */
  windowed?: boolean
}

/** Ein Gesicht in der Galerie der Personen-Seite. */
export interface FaceListItem {
  photo: string
  face: number
  box: [number, number, number, number]
  w: number
  h: number
  /** Ähnlichkeit zur gewählten Person (nur wenn sie Beispiele hat). */
  similarity?: number
  /** Ist ein Beispielgesicht der gewählten Person. */
  sample: boolean
  /** Ist ausdrücklich NICHT die gewählte Person (Gegenbeispiel). */
  negative: boolean
  /** Gilt als Treffer (über der Schwelle und keinem Gegenbeispiel ähnlicher). */
  match: boolean
  /** Von Hand markiert. */
  manual: boolean
}

/** Rahmen relativ zur Bildgröße: x, y, Breite, Höhe (0–1). */
export type RelBox = [number, number, number, number]

/** Ergebnis einer Hand-Markierung: das Gesicht und die Bildgröße. */
export interface EmbedResult {
  face: StoredFace
  w: number
  h: number
}

/** Auftrag an das Analyse-Fenster: Merkmalsvektor für einen von Hand gezogenen Rahmen. */
export interface EmbedRequest {
  requestId: number
  name: string
  box: RelBox
}

export type FaceModel = 'yunet' | 'sface'

/** API, die das Preload-Skript den Fenstern unter `window.api` bereitstellt. */
export interface PhotoPresenterApi {
  startShow(options?: ShowOptions): Promise<void>
  stopShow(): Promise<void>
  appVersion(): Promise<string>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  onSettingsChanged(callback: (settings: Settings) => void): () => void
  pickFolder(): Promise<string | null>
  listPhotos(): Promise<PhotoList>

  // Gesichtserkennung: Analyse-Fenster
  faceModel(model: FaceModel): Promise<Uint8Array>
  faceJob(): Promise<{ name: string } | null>
  faceResult(name: string, result: PhotoFaces | null, error?: string): Promise<void>
  onFaceWake(callback: () => void): () => void
  onEmbedRequest(callback: (request: EmbedRequest) => void): () => void
  embedResult(requestId: number, result: EmbedResult | null, error?: string): Promise<void>

  // Gesichtserkennung: Show und Einstellungen
  faceStatus(): Promise<FaceIndexStatus>
  onFaceStatus(callback: (status: FaceIndexStatus) => void): () => void
  getFaces(name: string): Promise<FaceInfo | null>
  /** Gesichter des Ordners (oder nur eines Fotos) mit Abgleich zur Person. */
  listFaces(personId?: string, photo?: string): Promise<FaceListItem[]>
  toggleSample(personId: string, photo: string, face: number): Promise<void>
  toggleNegative(personId: string, photo: string, face: number): Promise<void>
  /** Gesicht von Hand markieren und als Beispiel oder Gegenbeispiel übernehmen. */
  markFace(
    personId: string,
    photo: string,
    box: RelBox,
    negative: boolean
  ): Promise<{ ok: boolean; error?: string }>
  focusPhotos(): Promise<string[]>
  reindexFaces(): Promise<void>

  // Fernbedienung
  /** Show-Fenster: Befehle empfangen (Weiter, Pause, QR …). */
  onShowCommand(callback: (cmd: ShowCommand) => void): () => void
  /** Show-Fenster: eigenen Zustand melden. */
  reportShowStatus(status: ShowStatus): void
  remoteInfo(): Promise<RemoteInfo>
  /** Einstellungsfenster: Befehl an die laufende Show senden (z. B. Effekt jetzt). */
  sendShowCommand(cmd: ShowCommand): Promise<void>
}
