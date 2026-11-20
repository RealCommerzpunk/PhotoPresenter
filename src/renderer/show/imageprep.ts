import { photoUrl } from '@shared/ipc'
import type { FillMode } from '@shared/settings'
import { fitImage, type Size } from './motion'

// Canvas mit willReadFrequently rechnet auf dem Prozessor: So konkurriert die Vorbereitung
// im Worker nicht mit der Grafikkarte, die gerade die Show zeichnet.

/**
 * Bildvorbereitung für die Show: laden, nach EXIF drehen, verkleinern, weiche Kanten,
 * Randfüllung. Läuft im Web Worker (loader.worker.ts), damit die Animation im
 * Haupt-Thread nie darauf warten muss. Nur OffscreenCanvas, kein DOM.
 */

/** Spielraum, damit beim Zoomen nichts unscharf wird. */
const ZOOM_HEADROOM = 1.35
/** Breite der weichen Kante als Anteil der kürzeren Bildschirmseite. */
const FEATHER = 0.03
const BACKDROP_WIDTH = 256

/** Blendet die Bildkanten aus, die an aufgefüllte Ränder grenzen. */
function featherEdges(
  ctx: OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  sides: boolean,
  topBottom: boolean,
  width: number
): void {
  ctx.globalCompositeOperation = 'destination-out'
  const edges: [number, number, number, number][] = []
  if (sides) edges.push([0, 0, width, 0], [w, 0, w - width, 0])
  if (topBottom) edges.push([0, 0, 0, width], [0, h, 0, h - width])
  for (const [x0, y0, x1, y1] of edges) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    if (y0 === y1) ctx.fillRect(Math.min(x0, x1), 0, width, h)
    else ctx.fillRect(0, Math.min(y0, y1), w, width)
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Weichgezeichnete, abgedunkelte Fassung des Fotos, bildschirmfüllend. */
function blurBackdrop(
  ctx: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  bw: number,
  bh: number
): void {
  // Etwas größer als die Fläche zeichnen, damit der Weichzeichner keine hellen Ränder erzeugt.
  const pad = 24
  const s = Math.max((bw + pad * 2) / bitmap.width, (bh + pad * 2) / bitmap.height)
  const dw = bitmap.width * s
  const dh = bitmap.height * s
  ctx.filter = 'blur(9px) saturate(0.95) brightness(0.72)'
  ctx.drawImage(bitmap, (bw - dw) / 2, (bh - dh) / 2, dw, dh)
}

/** Anteil des Fotos am Rand, dessen Farben nach außen fortgesetzt werden. */
const AMBIENT_EDGE = 0.025

/**
 * Farbverlauf aus den Rändern des Fotos: Die äußersten Pixelreihen werden Zeile für Zeile
 * (bzw. Spalte für Spalte) bis an den Bildschirmrand gezogen, weichgezeichnet und nach
 * außen leicht abgedunkelt. Liegt deckungsgleich unter dem Foto und bewegt sich mit ihm,
 * damit die Farben an der weichen Kante nahtlos ins Foto übergehen.
 */
function ambientBackdrop(
  ctx: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  bw: number,
  bh: number,
  horizontalGaps: boolean
): void {
  const layer = new OffscreenCanvas(bw, bh)
  const l = layer.getContext('2d', { willReadFrequently: true })!
  const s = Math.min(bw / bitmap.width, bh / bitmap.height)
  const dw = bitmap.width * s
  const dh = bitmap.height * s
  const dx = (bw - dw) / 2
  const dy = (bh - dh) / 2
  // 1 px Überlappung, damit zwischen Rand und Foto keine Fuge bleibt.
  if (horizontalGaps) {
    const e = Math.max(1, Math.round(bitmap.width * AMBIENT_EDGE))
    l.drawImage(bitmap, 0, 0, e, bitmap.height, 0, dy, dx + 1, dh)
    l.drawImage(
      bitmap,
      bitmap.width - e,
      0,
      e,
      bitmap.height,
      dx + dw - 1,
      dy,
      bw - dx - dw + 1,
      dh
    )
  } else {
    const e = Math.max(1, Math.round(bitmap.height * AMBIENT_EDGE))
    l.drawImage(bitmap, 0, 0, bitmap.width, e, dx, 0, dw, dy + 1)
    l.drawImage(
      bitmap,
      0,
      bitmap.height - e,
      bitmap.width,
      e,
      dx,
      dy + dh - 1,
      dw,
      bh - dy - dh + 1
    )
  }
  l.drawImage(bitmap, dx, dy, dw, dh)
  // Erst ungefiltert als Grund: Der Weichzeichner wird am Rand durchsichtig, sonst entstünde
  // dort ein dunkler Saum.
  ctx.filter = 'brightness(0.85)'
  ctx.drawImage(layer, 0, 0)
  ctx.filter = `blur(${Math.round(bw / 48)}px) saturate(1.05) brightness(0.85)`
  ctx.drawImage(layer, 0, 0)
  ctx.filter = 'none'
  // Nach außen sanft dunkler: gibt Tiefe, das Foto bleibt der hellste Teil.
  const fade = (x0: number, y0: number, x1: number, y1: number): void => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, 'rgba(0, 0, 0, 0)')
    g.addColorStop(1, 'rgba(0, 0, 0, 0.35)')
    ctx.fillStyle = g
    if (horizontalGaps) ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), bh)
    else ctx.fillRect(0, Math.min(y0, y1), bw, Math.abs(y1 - y0))
  }
  if (horizontalGaps) {
    fade(dx, 0, 0, 0)
    fade(dx + dw, 0, bw, 0)
  } else {
    fade(0, dy, 0, 0)
    fade(0, dy + dh, 0, bh)
  }
}

/**
 * Spiegelt das eingepasste Foto an seinen Rändern und zeichnet es weich.
 * Die Füllung liegt deckungsgleich unter dem Foto und bewegt sich mit ihm.
 */
function mirrorBackdrop(
  ctx: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  bw: number,
  bh: number,
  horizontalGaps: boolean
): void {
  const layer = new OffscreenCanvas(bw, bh)
  const l = layer.getContext('2d', { willReadFrequently: true })!
  const s = Math.min(bw / bitmap.width, bh / bitmap.height)
  const dw = bitmap.width * s
  const dh = bitmap.height * s
  const dx = (bw - dw) / 2
  const dy = (bh - dh) / 2
  l.drawImage(bitmap, dx, dy, dw, dh)
  for (const side of [-1, 1]) {
    l.save()
    if (horizontalGaps) {
      l.translate(side < 0 ? dx : dx + 2 * dw, 0)
      l.scale(-1, 1)
      l.drawImage(bitmap, 0, dy, dw, dh)
    } else {
      l.translate(0, side < 0 ? dy : dy + 2 * dh)
      l.scale(1, -1)
      l.drawImage(bitmap, dx, 0, dw, dh)
    }
    l.restore()
  }
  ctx.filter = 'blur(5px) saturate(0.95) brightness(0.78)'
  ctx.drawImage(layer, 0, 0)
}

/** Weichgezeichnete Kleinfassung im Seitenverhältnis des Bildschirms. */
function makeSoft(bitmap: ImageBitmap, screen: Size): ImageBitmap {
  const bw = BACKDROP_WIDTH
  const bh = Math.max(1, Math.round((bw * screen.h) / screen.w))
  const canvas = new OffscreenCanvas(bw, bh)
  blurBackdrop(canvas.getContext('2d', { willReadFrequently: true })!, bitmap, bw, bh)
  return canvas.transferToImageBitmap()
}

async function fetchBitmap(name: string): Promise<ImageBitmap> {
  const response = await fetch(photoUrl(name))
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  return createImageBitmap(await response.blob(), { imageOrientation: 'from-image' })
}

/** Nur die weichgezeichnete Kleinfassung eines Fotos (für Textfolien). */
export async function prepareSoft(name: string, screen: Size): Promise<ImageBitmap> {
  const original = await fetchBitmap(name)
  try {
    return makeSoft(original, screen)
  } finally {
    original.close()
  }
}

function makeBackdrop(
  bitmap: ImageBitmap,
  screen: Size,
  mode: FillMode,
  horizontalGaps: boolean
): ImageBitmap {
  const bw = mode === 'blur' ? BACKDROP_WIDTH : BACKDROP_WIDTH * 2
  const bh = Math.max(1, Math.round((bw * screen.h) / screen.w))
  const canvas = new OffscreenCanvas(bw, bh)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  if (mode === 'ambient') ambientBackdrop(ctx, bitmap, bw, bh, horizontalGaps)
  else if (mode === 'mirror') mirrorBackdrop(ctx, bitmap, bw, bh, horizontalGaps)
  else blurBackdrop(ctx, bitmap, bw, bh)
  return canvas.transferToImageBitmap()
}

/** Zeilen je Streifen: so groß, dass ein Streifen in wenigen Millisekunden hochgeladen ist. */
const STRIP_ROWS = 320
/** Überlappung der Streifen, damit beim Skalieren keine Naht sichtbar wird. */
const STRIP_OVERLAP = 2

export interface PhotoStrip {
  bitmap: ImageBitmap
  /** Oberkante in Pixeln des Fotos. */
  y: number
}

export interface PreparedImages {
  /** Das Foto in waagerechten Streifen (werden einzeln hochgeladen). */
  strips: PhotoStrip[]
  width: number
  height: number
  /** Größe des Originalfotos (nach EXIF-Drehung). */
  originalWidth: number
  originalHeight: number
  backdrop: ImageBitmap
  soft: ImageBitmap
  /** Tatsächlich verwendete Randfüllung (Gespiegelt kann auf Weichgezeichnet ausweichen). */
  fill: FillMode
}

/** Foto und Randfüllung vorbereiten; Größen in logischen Bildschirmpixeln. */
export async function preparePhoto(
  name: string,
  screen: Size,
  pixelRatio: number,
  maxCrop: number,
  requestedFill: FillMode,
  maxZoom: number,
  /** Höchste Grundvergrößerung über die Originalauflösung (0 = unbegrenzt). */
  maxBase = 0
): Promise<PreparedImages> {
  const original = await fetchBitmap(name)

  const originalWidth = original.width
  const originalHeight = original.height
  const maxScale = maxBase > 0 ? maxBase / pixelRatio : Infinity
  const fit = fitImage({ w: original.width, h: original.height }, screen, maxCrop, maxScale)
  // Ränder links/rechts, wenn das Bild schmaler ist als der Bildschirm, sonst oben/unten.
  const horizontalGaps = fit.gapX
  // Spiegeln und Farbverlauf setzen das genau eingepasste Foto fort: sonst weichzeichnen.
  const fill: FillMode =
    requestedFill !== 'blur' && (fit.capped || (fit.gapX && fit.gapY)) ? 'blur' : requestedFill
  const physW = screen.w * pixelRatio
  const physH = screen.h * pixelRatio
  const needed =
    Math.max(physW / original.width, physH / original.height) *
    Math.max(ZOOM_HEADROOM, maxZoom * 1.08)
  const scale = Math.min(1, needed)
  const tw = Math.max(1, Math.round(original.width * scale))
  const th = Math.max(1, Math.round(original.height * scale))

  let photoBitmap = original
  if (!fit.covers || scale < 1) {
    const canvas = new OffscreenCanvas(tw, th)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(original, 0, 0, tw, th)
    if (!fit.covers) {
      // Kantenbreite in Bildschirmpixeln festlegen und in Texturpixel umrechnen.
      const texPerScreenPx = tw / (original.width * fit.scale)
      const side = Math.min(tw, th)
      const width = Math.min(side * 0.15, FEATHER * Math.min(screen.w, screen.h) * texPerScreenPx)
      featherEdges(ctx, tw, th, fit.gapX, fit.gapY, width)
    }
    photoBitmap = canvas.transferToImageBitmap()
  }

  const backdropBitmap = makeBackdrop(original, screen, fill, horizontalGaps)
  const soft = makeSoft(original, screen)
  if (photoBitmap !== original) original.close()

  const width = photoBitmap.width
  const height = photoBitmap.height
  const strips: PhotoStrip[] = []
  for (let y = 0; y < height; y += STRIP_ROWS) {
    const h = Math.min(height - y, STRIP_ROWS + STRIP_OVERLAP)
    strips.push({ bitmap: await createImageBitmap(photoBitmap, 0, y, width, h), y })
  }
  photoBitmap.close()
  return {
    strips,
    width,
    height,
    originalWidth,
    originalHeight,
    backdrop: backdropBitmap,
    soft,
    fill
  }
}

/** Größe der Kacheln in der 3D-Fotowelt (4:3, passend zu TILE_W × TILE_H). */
export const THUMB_W = 384
export const THUMB_H = 288

/** Längste Seite eines Vorschaubilds der 3D-Welt (Panoramen). */
const THUMB_MAX = 1024
/** Längste Seite einer scharfen Kachel (Grenze für Texturen auf schwachen Grafikchips). */
const SHARP_MAX = 4096

/**
 * Scharfe Fassung für die Kachel, die am Anfang oder Ende der 3D-Welt bildschirmgroß zu
 * sehen ist: ganzes Foto, `height` Pixel hoch (nie größer als das Original).
 */
async function prepareSharpTile(blob: Blob, height: number): Promise<ImageBitmap> {
  const decoded = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  try {
    const s = Math.min(
      1,
      height / decoded.height,
      SHARP_MAX / Math.max(decoded.width, decoded.height)
    )
    const w = Math.max(1, Math.round(decoded.width * s))
    const h = Math.max(1, Math.round(decoded.height * s))
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(decoded, 0, 0, w, h)
    return canvas.transferToImageBitmap()
  } finally {
    decoded.close()
  }
}

/**
 * Vorschaubild für die 3D-Fotowelt: direkt verkleinert dekodiert (schnell), im
 * Seitenverhältnis des Fotos. Die Kachel zeigt davon die Mitte in 4:3; die Zielkachel zieht
 * beim Eintauchen zum ganzen Foto auf, damit sie genau dem folgenden Vollbild entspricht.
 */
export async function prepareThumb(name: string, height = 0): Promise<ImageBitmap> {
  const response = await fetch(photoUrl(name))
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  if (height > 0) return prepareSharpTile(await response.blob(), height)
  const decoded = await createImageBitmap(await response.blob(), {
    imageOrientation: 'from-image',
    resizeWidth: THUMB_W * 2,
    resizeQuality: 'medium'
  })
  try {
    // So groß, dass der 4:3-Ausschnitt mindestens THUMB_W × THUMB_H hat.
    const s = Math.min(
      Math.max(THUMB_W / decoded.width, THUMB_H / decoded.height),
      THUMB_MAX / Math.max(decoded.width, decoded.height)
    )
    const w = Math.max(1, Math.round(decoded.width * s))
    const h = Math.max(1, Math.round(decoded.height * s))
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(decoded, 0, 0, w, h)
    return canvas.transferToImageBitmap()
  } finally {
    decoded.close()
  }
}
