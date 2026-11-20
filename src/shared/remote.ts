import type { Settings } from './settings'

/** Befehle an die laufende Show (von Fernbedienung oder Main-Prozess). */
export type ShowCommand =
  | 'start'
  | 'stop'
  | 'next'
  | 'prev'
  | 'pause'
  | 'resume'
  | 'qr'
  | 'effect'
  | 'world'
  | 'text'
  | 'say'
  | 'emoji'
  | 'freeze'
  | 'song'
  | 'songStop'
  | 'kidEmoji'
  | 'kidText'

/**
 * Befehl mit optionalem Zusatz: bei 'effect' die Effekt-ID, bei 'world' die Formation,
 * bei 'text' die Text-ID, bei 'say' ein freier Text zum sofortigen Einblenden,
 * bei 'emoji' das Emoji, bei 'freeze' 'on' oder 'off' (ohne Zusatz: umschalten), bei 'song' der
 * Liedname (ohne Zusatz: das einzige Lied bzw. Auswahl auf dem Bildschirm). 'kidEmoji' und
 * 'kidText' wie 'emoji' und 'text', aber höchstens einmal je Foto (Kinder-Fernbedienung).
 */
export interface ShowCommandMessage {
  cmd: ShowCommand
  arg?: string
}

/** Zustand der Show, den das Show-Fenster an den Main-Prozess meldet. */
export interface ShowStatus {
  running: boolean
  paused: boolean
  /** Aktuelles Foto bzw. Text (wie bei Taste I). */
  label: string
  /** Aktuelles Foto ist eingefroren (Bewegung läuft in einer Schleife). */
  frozen?: boolean
  /** Name des aktuellen Fotos (relativ zum Fotoordner), falls ein Foto zu sehen ist. */
  photo?: string
  /** Für das Foto ist schon ein Emoji bzw. ein Text von der Kinder-Fernbedienung da. */
  kidEmojiUsed?: boolean
  kidTextUsed?: boolean
  /** Ein Lied läuft (Titel) bzw. die Auswahl ist offen. */
  song?: { title: string; choosing?: boolean }
}

/** Rückmeldung der Show auf einen Befehl (erscheint auf der Fernbedienung als Hinweis). */
export interface ShowNotice {
  text: string
  kind: 'ok' | 'warn'
}

/** Eintrag der manuellen Reihenfolge aus der Foto-Galerie der Fernbedienung. */
export interface QueueItem {
  id: string
  /** Foto relativ zum Fotoordner. */
  name: string
}

/** Manuelle Reihenfolge: anstehende Fotos; `playing` ist der Eintrag, der gerade zu sehen ist. */
export interface PhotoQueue {
  items: QueueItem[]
  playing?: string
}

/** Änderung der manuellen Reihenfolge von der Fernbedienung. */
export type QueueOp =
  | { op: 'add'; name: string }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; to: number }
  | { op: 'clear' }

/** Einstellungen, die die Fernbedienung lesen und ändern darf. */
export const REMOTE_KEYS = [
  'displayDuration',
  'transitionDuration',
  'motionIntensity',
  'maxUpscale',
  'transitions',
  'focusEnabled',
  'focusPersonId',
  'focusPartnerId',
  'focusTogether',
  'focusThreshold',
  'focusBoost',
  'focusPanOthers',
  'textFillerEvery',
  'textDuration',
  'texts',
  'effectsEnabled',
  'effectEvery',
  'effectDuration',
  'effectIntensity',
  'effects',
  'worldEnabled',
  'worldEvery',
  'worldDuration',
  'worldFormations',
  'emojis',
  'motionKinds',
  'fillModes',
  'focusModes',
  'focusFaceSize',
  'focusExtraTime',
  'focusPairExtraTime',
  'textSizeRandom',
  'textBackgrounds',
  'worldTiles',
  'worldCameraSpeed',
  'songVolume',
  'maxCrop',
  'maxBaseScale',
  'includeSubfolders',
  'dupesSkip',
  'avoidRepeats',
  'language',
  'worldDensity',
  'songLyricsPosition',
  'songFontScale',
  'songLinesBefore',
  'songLinesAfter',
  'songColorNow',
  'songColorNext',
  'songColorPast',
  'songBackground',
  'songDim'
] as const satisfies readonly (keyof Settings)[]

/**
 * Einstellungen, die bewusst nur am PC gehen (mit Grund). Jede Einstellung steht entweder
 * hier oder in `REMOTE_KEYS` – ein Test prüft das, damit neue Einstellungen nicht vergessen werden.
 */
export const REMOTE_EXCLUDED: Partial<Record<keyof Settings, string>> = {
  version: 'intern (Schema-Version)',
  photoFolder: 'Ordnerauswahl nur am PC',
  songsFolder: 'Ordnerauswahl nur am PC',
  textStyles: 'Stil-Editor mit Vorschau nur am PC',
  customStyles: 'Stil-Editor mit Vorschau nur am PC',
  showDisplay: 'Bildschirmwahl baut das Show-Fenster um',
  showArea: 'Bildschirmbereich baut das Show-Fenster um',
  songPhoto: 'Fotoauswahl fürs Lied nur am PC',
  songTiming: 'Zeiten-Editor nur am PC',
  remoteEnabled: 'würde die Fernbedienung selbst abschalten',
  remotePort: 'würde die Verbindung der Fernbedienung trennen',
  persons: 'Personen anlernen nur am PC (Auswahl der Fokus-Person geht per Fernbedienung)'
}

export type RemoteSettings = Pick<Settings, (typeof REMOTE_KEYS)[number]>

/** Alles, was die Handy-Seite anzeigt. */
export interface RemoteState {
  /** Sprache des Presenters; wechselt sie, lädt die Handy-Seite neu. */
  lang?: string
  version: string
  show: ShowStatus
  queue: PhotoQueue
  settings: RemoteSettings
  persons: { id: string; name: string }[]
  /** Lieder im Ordner „Songs“ (Name ohne Endung und Titel). */
  songs: { name: string; title: string; lyrics: boolean }[]
  labels: {
    transitions: Record<string, string>
    panOthers: Record<string, string>
    effects: Record<string, string>
    formations: Record<string, string>
    motionKinds: Record<string, string>
    fillModes: Record<string, string>
    focusModes: Record<string, string>
    textBackgrounds: Record<string, string>
    songPositions: Record<string, string>
    songBackgrounds: Record<string, string>
    /** Sprachen der Oberfläche, `auto` zuerst. */
    languages: Record<string, string>
  }
}

/** Adresse und QR-Code der Fernbedienung (für Einstellungen und Show). */
export interface RemoteInfo {
  enabled: boolean
  running: boolean
  port: number
  urls: string[]
  qrSvg?: string
  error?: string
}
