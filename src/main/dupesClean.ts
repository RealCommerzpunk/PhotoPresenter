import { copyFile, mkdir, rename, stat, unlink, utimes } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { DUPLICATES_DIR } from '@shared/dupes'
import type { CleanResult } from '@shared/ipc'

/** Freier Zielname: „foto.jpg“, sonst „foto (2).jpg“ usw. */
async function freeName(target: string): Promise<string> {
  const ext = extname(target)
  const stem = target.slice(0, target.length - ext.length)
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? target : `${stem} (${i})${ext}`
    try {
      await stat(candidate)
    } catch {
      return candidate
    }
  }
}

/** Verschieben, notfalls über Laufwerksgrenzen (kopieren, Zeitstempel übernehmen, löschen). */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    const st = await stat(from)
    await copyFile(from, to)
    await utimes(to, st.atime, st.mtime)
    await unlink(from)
  }
}

/**
 * Doppelte Fotos aufräumen. `move`: in den Unterordner „Duplicates“ des Fotoordners (mit der
 * gleichen Unterordner-Struktur), `trash`: in den Papierkorb (`trashItem` von Electrons shell).
 */
export async function cleanDuplicates(
  folder: string,
  names: string[],
  mode: 'move' | 'trash',
  trashItem: (path: string) => Promise<void>
): Promise<CleanResult> {
  const result: CleanResult = { done: 0, failed: [] }
  const root = resolve(folder)
  const target = join(root, DUPLICATES_DIR)
  if (mode === 'move') result.folder = target
  for (const name of names) {
    const abs = resolve(root, name)
    // Nur Dateien im Fotoordner anfassen.
    if (!abs.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) {
      result.failed.push(name)
      continue
    }
    try {
      if (mode === 'trash') await trashItem(abs)
      else {
        const to = await freeName(join(target, name))
        await mkdir(dirname(to), { recursive: true })
        await moveFile(abs, to)
      }
      result.done++
    } catch {
      result.failed.push(name)
    }
  }
  return result
}
