import { readdir } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { PHOTO_SCHEME, type PhotoList } from '@shared/ipc'
import { relativeToBase } from './paths'
import { loadSettings, photoFolder as resolvedPhotoFolder, programDir } from './settings'

/** Formate, die Chromium selbst dekodieren kann. */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])

export async function listPhotos(): Promise<PhotoList> {
  const { includeSubfolders, photoFolder: setting } = loadSettings()
  const photoFolder = resolvedPhotoFolder()
  const base = programDir()
  if (!photoFolder) return { folder: '', files: [], base }
  const info = {
    folder: photoFolder,
    base,
    relative: relativeToBase(photoFolder, base) ?? undefined,
    settingIsRelative: normalize(setting) !== photoFolder
  }
  try {
    const entries = await readdir(photoFolder, {
      recursive: includeSubfolders,
      withFileTypes: true
    })
    const files = entries
      .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(extname(e.name).toLowerCase()))
      .map((e) => relative(photoFolder, join(e.parentPath, e.name)))
      .sort()
    return { ...info, files }
  } catch (err) {
    return { ...info, files: [], error: (err as Error).message }
  }
}

/** Absoluter Pfad eines Fotos (relativ zum Fotoordner); null, wenn es außerhalb läge. */
export function resolvePhoto(rel: string): string | null {
  const folder = resolvedPhotoFolder()
  if (!folder || !rel) return null
  const abs = resolve(folder, rel)
  const inside = relative(folder, abs)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
  return abs
}

/** Muss vor `app.whenReady()` aufgerufen werden. */
export function registerPhotoScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PHOTO_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

/** Liefert Fotos aus, aber nur aus dem eingestellten Ordner. */
export function handlePhotoProtocol(): void {
  protocol.handle(PHOTO_SCHEME, async (request) => {
    const folder = resolvedPhotoFolder()
    if (!folder) return new Response('Kein Fotoordner gewählt', { status: 404 })
    const rel = decodeURIComponent(new URL(request.url).pathname.slice(1))
    const abs = resolve(folder, rel)
    const inside = relative(folder, abs)
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
      return new Response('Zugriff verweigert', { status: 403 })
    }
    const file = await net.fetch(pathToFileURL(abs).toString())
    // Die Fenster laden von file:// (Herkunft "null"); nur sie erreichen dieses Protokoll.
    const headers = new Headers(file.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(file.body, { status: file.status, headers })
  })
}
