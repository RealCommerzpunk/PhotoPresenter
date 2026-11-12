import { copyFile, cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import type { ExportProgress, ExportResult } from '@shared/ipc'
import type { Settings } from '@shared/settings'
import { listPhotos } from './photos'
import { DATA_DIR_NAME } from './portable'
import { resourcePath } from './resources'
import { DEFAULT_PHOTO_DIR } from './settings'

/** Ordnername der Fotos im Paket (relativ zum Programm). Technische Namen sind englisch. */
const PHOTOS_DIR = DEFAULT_PHOTO_DIR

const QUICKSTART = 'Quickstart.pdf'

const README = `PhotoPresenter – zum Mitnehmen
==============================

Starten: Die Programmdatei in diesem Ordner doppelklicken
(Windows: „PhotoPresenter … .exe“, Linux: „PhotoPresenter … .AppImage“).

Windows warnt beim ersten Start, weil das Programm nicht signiert ist:
„Weitere Informationen“ → „Trotzdem ausführen“.

Ordner:
  Photos\\  die Fotos der Diashow (weitere einfach hineinkopieren)
  Data\\    Einstellungen, Texte, Personen und Gesichtsindex

Den ganzen Ordner kann man beliebig kopieren (USB-Stick, anderer Rechner) –
alles reist mit.

Ausführliche Anleitung zum Loslegen und Ausprobieren: Quickstart.pdf

Programm-Icon: Three Musketeers – Flaticon
https://www.flaticon.com/authors/three-musketeers
`

/** Freier Zielordner: „PhotoPresenter“, sonst „PhotoPresenter (2)“ usw. */
async function freeFolder(parent: string): Promise<string> {
  for (let i = 1; ; i++) {
    const dir = join(parent, i === 1 ? 'PhotoPresenter' : `PhotoPresenter (${i})`)
    try {
      await stat(dir)
    } catch {
      return dir
    }
  }
}

/** Das laufende Programm kopieren: portable .exe, AppImage oder den Programmordner. */
async function copyProgram(dest: string): Promise<string | undefined> {
  if (!app.isPackaged) {
    return 'Programm nicht enthalten (Entwicklungsversion): mit „npm run dist:win“ bauen und die portable .exe dazulegen.'
  }
  const portable = process.env['PORTABLE_EXECUTABLE_FILE']
  const appImage = process.env['APPIMAGE']
  const single = portable || appImage
  if (single) {
    await copyFile(single, join(dest, basename(single)))
    return undefined
  }
  // Installierte bzw. entpackte Version: den ganzen Programmordner (ohne Deinstallation).
  const programDir = dirname(process.execPath)
  for (const name of await readdir(programDir)) {
    if (/^uninstall/i.test(name) || name === DATA_DIR_NAME) continue
    await cp(join(programDir, name), join(dest, name), { recursive: true })
  }
  return undefined
}

/**
 * Weitergabe-Paket: Programm, Fotos (Ordner „Photos“) und Daten (Einstellungen mit relativem
 * Fotopfad, Gesichtsindex mit relativen Pfaden) in einen neuen Ordner unter `parent`.
 */
export async function exportPackage(
  parent: string,
  settings: Settings,
  writeFaceIndex: (file: string) => Promise<void>,
  progress: (p: ExportProgress) => void
): Promise<ExportResult> {
  const notes: string[] = []
  const dest = await freeFolder(parent)
  try {
    await mkdir(join(dest, DATA_DIR_NAME), { recursive: true })

    progress({ step: 'Programm kopieren …', done: 0, total: 0 })
    const programNote = await copyProgram(dest)
    if (programNote) notes.push(programNote)

    const list = await listPhotos()
    if (list.folder && list.files.length) {
      const total = list.files.length
      for (const [i, name] of list.files.entries()) {
        const target = join(dest, PHOTOS_DIR, name)
        await mkdir(dirname(target), { recursive: true })
        // Änderungszeit bleibt erhalten, damit der Gesichtsindex die Fotos wiedererkennt.
        await cp(join(list.folder, name), target, { preserveTimestamps: true })
        if (i % 10 === 0 || i === total - 1) {
          progress({ step: 'Fotos kopieren …', done: i + 1, total })
        }
      }
    } else {
      await mkdir(join(dest, PHOTOS_DIR), { recursive: true })
      notes.push('Keine Fotos gefunden – der Ordner „Photos“ ist leer.')
    }

    progress({ step: 'Einstellungen schreiben …', done: 0, total: 0 })
    const data: Settings = { ...settings, photoFolder: PHOTOS_DIR }
    await writeFile(join(dest, DATA_DIR_NAME, 'settings.json'), JSON.stringify(data, null, 2))
    await writeFaceIndex(join(dest, DATA_DIR_NAME, 'faces.json'))
    await writeFile(join(dest, 'README.txt'), README.replace(/\n/g, '\r\n'))
    // Anleitung als PDF (gepackt unter resources/, in der Entwicklung im Projektordner)
    const guide = app.isPackaged ? resourcePath(QUICKSTART) : join(app.getAppPath(), QUICKSTART)
    await copyFile(guide, join(dest, QUICKSTART)).catch(() => {
      notes.push('Anleitung (Quickstart.pdf) nicht gefunden.')
    })
    return { ok: true, path: dest, notes }
  } catch (err) {
    return { ok: false, path: dest, notes, error: (err as Error).message }
  }
}
