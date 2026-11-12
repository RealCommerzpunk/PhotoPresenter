import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

/** Datei aus `resources/` (im gepackten Programm neben der app.asar). */
export function resourcePath(...parts: string[]): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', ...parts)
    : join(app.getAppPath(), 'resources', ...parts)
}

/** Programm-Icon (PNG 512 × 512) für Fenster und Fernbedienung. */
export const iconPath = (): string => resourcePath('icon.png')

let iconCache: Buffer | null = null
export async function iconPng(): Promise<Buffer | null> {
  try {
    iconCache ??= await readFile(iconPath())
    return iconCache
  } catch {
    return null
  }
}
