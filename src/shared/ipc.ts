/** Kanalnamen für die Kommunikation zwischen Main-Prozess und Fenstern. */
export const IPC = {
  startShow: 'show:start',
  stopShow: 'show:stop',
  appVersion: 'app:version'
} as const

/** API, die das Preload-Skript den Fenstern unter `window.api` bereitstellt. */
export interface PhotoPresenterApi {
  startShow(): Promise<void>
  stopShow(): Promise<void>
  appVersion(): Promise<string>
}
