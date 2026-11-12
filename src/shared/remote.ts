import type { Settings } from './settings'

/** Befehle an die laufende Show (von Fernbedienung oder Main-Prozess). */
export type ShowCommand = 'start' | 'stop' | 'next' | 'prev' | 'pause' | 'resume' | 'qr'

/** Zustand der Show, den das Show-Fenster an den Main-Prozess meldet. */
export interface ShowStatus {
  running: boolean
  paused: boolean
  /** Aktuelles Foto bzw. Text (wie bei Taste I). */
  label: string
}

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
  'texts'
] as const satisfies readonly (keyof Settings)[]

export type RemoteSettings = Pick<Settings, (typeof REMOTE_KEYS)[number]>

/** Alles, was die Handy-Seite anzeigt. */
export interface RemoteState {
  version: string
  show: ShowStatus
  settings: RemoteSettings
  persons: { id: string; name: string }[]
  labels: {
    transitions: Record<string, string>
    panOthers: Record<string, string>
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
