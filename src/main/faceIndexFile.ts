import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Dateiformat des Gesichtsindex. Version 2 speichert Fotos im Fotoordner relativ zu ihm
 * (mit „/“), damit der Index mitreist, wenn Programm, Daten und Fotos kopiert werden.
 * Version 1 (nur absolute Pfade) wird weiter gelesen.
 */
export interface IndexFileV2<T> {
  version: 2
  photos: Record<string, T>
}

/**
 * Index (Schlüssel: absolute Pfade) für die Datei aufbereiten. `onlyFolder`: nur Fotos aus dem
 * Fotoordner (für Weitergabe-Pakete, damit keine fremden Pfade mitreisen).
 */
export function serializeIndex<T>(
  index: Map<string, T>,
  folder: string,
  onlyFolder = false
): IndexFileV2<T> {
  const photos: Record<string, T> = {}
  for (const [abs, entry] of index) {
    const rel = folder ? relative(folder, abs) : ''
    const inside = rel && !rel.startsWith('..') && !isAbsolute(rel)
    if (inside) photos[rel.split(sep).join('/')] = entry
    else if (!onlyFolder) photos[abs] = entry
  }
  return { version: 2, photos }
}

/** Datei lesen: relative Schlüssel gelten relativ zum aktuellen Fotoordner. */
export function parseIndex<T>(raw: unknown, folder: string): Map<string, T> {
  const file = raw as { version?: number; photos?: Record<string, T> }
  if (!file || typeof file.photos !== 'object' || file.photos === null) return new Map()
  if (file.version === 1) return new Map(Object.entries(file.photos))
  if (file.version !== 2) return new Map()
  const index = new Map<string, T>()
  for (const [key, entry] of Object.entries(file.photos)) {
    if (isAbsolute(key)) index.set(key, entry)
    else if (folder) index.set(resolve(folder, key), entry)
  }
  return index
}

/**
 * Datei unverändert? Größe gleich und Änderungszeit innerhalb von 2 Sekunden: Beim Kopieren
 * auf USB-Sticks (FAT) wird die Zeit auf 2 Sekunden gerundet.
 */
export function sameFile(
  entry: { mtime: number; size: number },
  st: { mtimeMs: number; size: number }
): boolean {
  return entry.size === st.size && Math.abs(entry.mtime - st.mtimeMs) <= 2000
}

/** So viel vom Anfang und vom Ende einer Datei fließt in den Fingerabdruck ein. */
const PRINT_BYTES = 64 * 1024

/**
 * Fingerabdruck einer Datei: Größe plus SHA-1 über die ersten und letzten 64 KB. Erkennt ein Foto
 * wieder, wenn sich nur die Änderungszeit geändert hat (git clone, ZIP aus anderer Zeitzone),
 * ohne die ganze Datei zu lesen.
 */
export async function fileFingerprint(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const hash = createHash('sha1').update(String(size))
    const head = Buffer.alloc(Math.min(PRINT_BYTES, size))
    await file.read(head, 0, head.length, 0)
    hash.update(head)
    if (size > PRINT_BYTES) {
      const tail = Buffer.alloc(Math.min(PRINT_BYTES, size - PRINT_BYTES))
      await file.read(tail, 0, tail.length, size - tail.length)
      hash.update(tail)
    }
    return hash.digest('hex').slice(0, 20)
  } finally {
    await file.close()
  }
}
