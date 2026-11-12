import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { programDir } from './settings'

/** Ordner neben dem Programm, in dem die mitnehmbaren Daten liegen. */
export const DATA_DIR_NAME = 'Data'

/** Diese Dateien gehören zu den Daten des Nutzers (alles andere ist Zwischenspeicher). */
export const DATA_FILES = ['settings.json', 'faces.json'] as const

export interface DataLocation {
  /** Ordner mit Einstellungen und Gesichtsindex. */
  dir: string
  /** Liegt neben dem Programm (reist beim Kopieren mit). */
  portable: boolean
  /** Beim ersten portablen Start aus dem Benutzerordner übernommen. */
  migrated: boolean
  /** Warum der portable Ordner nicht genutzt werden konnte. */
  problem?: string
}

let location: DataLocation | null = null

export function dataLocation(): DataLocation {
  return location ?? { dir: app.getPath('userData'), portable: false, migrated: false }
}

/**
 * Datenordner festlegen; muss vor `app.whenReady()` laufen.
 * - Entwicklung: `PP_USER_DATA` (Testordner), sonst der normale Benutzerordner.
 * - Portable .exe und AppImage: immer `Data` neben der Datei.
 * - Installiert: nur, wenn dieser Ordner neben dem Programm existiert.
 * Chromiums Zwischenspeicher bleiben im Benutzerordner, damit der Ordner sauber bleibt.
 */
export function setupDataLocation(): DataLocation {
  const standard = app.getPath('userData')
  if (!app.isPackaged) {
    const test = process.env['PP_USER_DATA']
    if (test) app.setPath('userData', test)
    location = { dir: app.getPath('userData'), portable: !!test, migrated: false }
    return location
  }

  const dir = join(programDir(), DATA_DIR_NAME)
  const portableBuild = !!(process.env['PORTABLE_EXECUTABLE_DIR'] || process.env['APPIMAGE'])
  if (!portableBuild && !existsSync(dir)) {
    location = { dir: standard, portable: false, migrated: false }
    return location
  }

  try {
    const fresh = !existsSync(join(dir, 'settings.json'))
    mkdirSync(dir, { recursive: true })
    // Schreibbar? (z. B. schreibgeschützter Stick oder Programme-Ordner)
    const probe = join(dir, '.schreibtest')
    writeFileSync(probe, '')
    rmSync(probe)
    // Erster portabler Start: bisherige Einstellungen und Gesichtsindex übernehmen.
    let migrated = false
    if (fresh) {
      for (const file of DATA_FILES) {
        const from = join(standard, file)
        if (existsSync(from)) {
          copyFileSync(from, join(dir, file))
          migrated = true
        }
      }
    }
    app.setPath('sessionData', standard)
    app.setPath('userData', dir)
    location = { dir, portable: true, migrated }
  } catch (err) {
    location = {
      dir: standard,
      portable: false,
      migrated: false,
      problem: `${dir} ist nicht beschreibbar (${(err as Error).message})`
    }
  }
  return location
}
