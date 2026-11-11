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
  listPhotos: 'photos:list'
} as const

/** Schema des Protokolls, über das die Show Fotos aus dem gewählten Ordner lädt. */
export const PHOTO_SCHEME = 'photo'

/** URL für ein Foto (Pfad relativ zum Fotoordner). */
export function photoUrl(relativePath: string): string {
  return `${PHOTO_SCHEME}://local/${encodeURIComponent(relativePath)}`
}

export interface PhotoList {
  folder: string
  /** Pfade relativ zum Fotoordner. */
  files: string[]
  error?: string
}

export interface ShowOptions {
  /** Vorschau in einem normalen Fenster statt Vollbild. */
  windowed?: boolean
}

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
}
