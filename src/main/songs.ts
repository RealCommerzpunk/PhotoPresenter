import { copyFile, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { SongData, SongInfo, SongList } from '@shared/ipc'
import { parseLyrics } from '@shared/lyrics'
import { resolvePhotoFolder } from './paths'
import { loadSettings, programDir } from './settings'

/** Name des Song-Ordners neben dem Programm. */
export const DEFAULT_SONG_DIR = 'Songs'

/** Der Song-Ordner als absoluter Pfad (eingestellt oder „Songs“ neben dem Programm). */
export function songsFolder(): string {
  const setting = loadSettings().songsFolder.trim()
  return setting ? resolvePhotoFolder(setting, programDir()) : join(programDir(), DEFAULT_SONG_DIR)
}

/** Dateiname ohne Endung, ohne Pfad: der Name verbindet MP3 und TXT. */
function safeName(name: string): string | null {
  const clean = basename(name)
  return clean && clean === name && !clean.startsWith('.') ? clean : null
}

/** Lieder = MP3-Dateien im Ordner; eine TXT mit gleichem Namen liefert den Text. */
export async function listSongs(): Promise<SongList> {
  const folder = songsFolder()
  try {
    const files = await readdir(folder)
    const lower = new Map(files.map((f) => [f.toLowerCase(), f]))
    const songs: SongInfo[] = []
    for (const file of files.sort((a, b) => a.localeCompare(b))) {
      if (extname(file).toLowerCase() !== '.mp3') continue
      const name = file.slice(0, -4)
      const txt = lower.get(`${name.toLowerCase()}.txt`)
      let title = name
      if (txt) {
        try {
          title = parseLyrics(await readFile(join(folder, txt), 'utf8')).title || name
        } catch {
          // Text nicht lesbar: Lied bleibt ohne Titel aus dem Text
        }
      }
      songs.push({ name, title, lyrics: !!txt })
    }
    return { folder, songs }
  } catch {
    return { folder, songs: [] }
  }
}

/** MP3 und Text eines Liedes (nur aus dem Song-Ordner). */
export async function readSong(name: string): Promise<SongData | null> {
  const clean = safeName(name)
  if (!clean) return null
  const folder = songsFolder()
  try {
    const files = await readdir(folder)
    const mp3 = files.find((f) => f.toLowerCase() === `${clean.toLowerCase()}.mp3`)
    if (!mp3) return null
    const txt = files.find((f) => f.toLowerCase() === `${clean.toLowerCase()}.txt`)
    const [audio, lyrics] = await Promise.all([
      readFile(join(folder, mp3)),
      txt ? readFile(join(folder, txt), 'utf8') : Promise.resolve('')
    ])
    return {
      name: clean,
      audio: new Uint8Array(audio.buffer, audio.byteOffset, audio.length),
      lyrics
    }
  } catch {
    return null
  }
}

/**
 * Text eines Liedes speichern (nur im Song-Ordner, nur zu einer vorhandenen MP3). Die erste
 * Fassung der TXT bleibt einmalig als „.bak“ daneben liegen.
 */
export async function saveLyrics(name: string, text: string): Promise<boolean> {
  const clean = safeName(name)
  if (!clean || typeof text !== 'string' || text.length > 1_000_000) return false
  const folder = songsFolder()
  try {
    const files = await readdir(folder)
    if (!files.some((f) => f.toLowerCase() === `${clean.toLowerCase()}.mp3`)) return false
    const existing = files.find((f) => f.toLowerCase() === `${clean.toLowerCase()}.txt`)
    const target = join(folder, existing ?? `${clean}.txt`)
    if (existing && !files.includes(`${existing}.bak`)) {
      await copyFile(target, `${target}.bak`)
    }
    const temp = `${target}.tmp`
    await writeFile(temp, text, 'utf8')
    await rename(temp, target)
    return true
  } catch {
    return false
  }
}
