import { ImageSource, Texture } from 'pixi.js'
import type { FillMode } from '@shared/settings'
import type { WorkerRequest, WorkerResponse } from './loader.worker'
import { fitImage, type Fit, type Size } from './motion'

/** Ein waagerechter Streifen des Fotos als eigene Textur. */
export interface PhotoPart {
  texture: Texture
  /** Oberkante in Pixeln des Fotos. */
  y: number
}

export interface LoadedPhoto {
  /** Pfad relativ zum Fotoordner. */
  name: string
  /** Das Foto in Streifen; einzeln hochgeladen, damit kein Frame lange blockiert. */
  parts: PhotoPart[]
  /** Randfüllung im Seitenverhältnis des Bildschirms. */
  backdrop: Texture
  fill: FillMode
  /**
   * Weichgezeichnete Kleinfassung als Hintergrund für Textfolien. Gehört dem Aufrufer
   * und wird von `destroy()` nicht freigegeben.
   */
  soft: ImageBitmap
  /** Größe des Fotos in Pixeln (alle Streifen zusammen). */
  size: Size
  /** Größe des Originalfotos; zusammen mit pixelRatio Grundlage der Zoomgrenze. */
  original: Size
  pixelRatio: number
  fit: Fit
  destroy(): void
}

// Die eigentliche Bildarbeit läuft im Worker; hier kommen nur fertige Bitmaps an.
const worker = new Worker(new URL('./loader.worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, (r: WorkerResponse) => void>()
let nextId = 1
worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  pending.get(e.data.id)?.(e.data)
  pending.delete(e.data.id)
}

type Request = WorkerRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, 'id'>
    : never
  : never

function ask(req: Request): Promise<Exclude<WorkerResponse, { ok: false }>> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => (r.ok ? resolve(r) : reject(new Error(r.error))))
    worker.postMessage({ ...req, id })
  })
}

/**
 * Ohne Mipmaps: Die Fotos sind schon auf Bildschirmgröße verkleinert, Mipmaps würden
 * nur das Hochladen auf die Grafikkarte verlangsamen.
 */
function textureFrom(bitmap: ImageBitmap): Texture {
  return new Texture({
    source: new ImageSource({ resource: bitmap, autoGenerateMipmaps: false })
  })
}

/** Lädt nur die weichgezeichnete Kleinfassung eines Fotos (für Textfolien). */
export async function loadSoft(name: string, screen: Size): Promise<ImageBitmap> {
  const r = await ask({ kind: 'soft', name, screen })
  if (r.kind !== 'soft') throw new Error('unerwartete Antwort')
  return r.soft
}

/**
 * Lädt ein Foto, dreht es nach EXIF, verkleinert es auf Bildschirmgröße
 * und bereitet die Randfüllung vor (alles im Worker).
 * @param screen logische Bildschirmgröße
 * @param pixelRatio Gerätepixel pro logischem Pixel
 */
export async function loadPhoto(
  name: string,
  screen: Size,
  pixelRatio: number,
  maxCrop: number,
  fill: FillMode,
  /** Größter geplanter Zoom (z. B. aufs Gesicht); bestimmt die nötige Auflösung. */
  maxZoom = 1
): Promise<LoadedPhoto> {
  const r = await ask({ kind: 'photo', name, screen, pixelRatio, maxCrop, fill, maxZoom })
  if (r.kind !== 'photo') throw new Error('unerwartete Antwort')
  const { images } = r
  const parts = images.strips.map((s) => ({ texture: textureFrom(s.bitmap), y: s.y }))
  const backdrop = textureFrom(images.backdrop)
  const size = { w: images.width, h: images.height }
  return {
    name,
    parts,
    backdrop,
    fill,
    soft: images.soft,
    size,
    original: { w: images.originalWidth, h: images.originalHeight },
    pixelRatio,
    fit: fitImage(size, screen, maxCrop),
    destroy() {
      for (const p of parts) p.texture.destroy(true)
      backdrop.destroy(true)
      for (const s of images.strips) s.bitmap.close()
      images.backdrop.close()
    }
  }
}
