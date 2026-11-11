import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { defaultSettings, parseSettings, type Settings } from '@shared/settings'

let current: Settings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  if (current) return current
  try {
    current = parseSettings(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    current = defaultSettings
  }
  return current
}

let writing: Promise<void> = Promise.resolve()

/** Übernimmt Änderungen, prüft sie und schreibt die Datei atomar (erst temporär, dann umbenennen). */
export function updateSettings(patch: Partial<Settings>): Settings {
  current = parseSettings({ ...loadSettings(), ...patch })
  const data = JSON.stringify(current, null, 2)
  const file = settingsPath()
  writing = writing
    .then(async () => {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(`${file}.tmp`, data, 'utf8')
      await rename(`${file}.tmp`, file)
    })
    .catch((err) => console.error('Einstellungen konnten nicht gespeichert werden:', err))
  return current
}
