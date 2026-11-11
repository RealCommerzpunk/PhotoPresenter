import { ImageSource, Texture } from 'pixi.js'
import { photoUrl } from '@shared/ipc'
import type { FillMode } from '@shared/settings'
import { fitImage, type Fit, type Size } from './motion'

export interface LoadedPhoto {
  /** Pfad relativ zum Fotoordner. */
  name: string
  photo: Texture
  /** Randfüllung im Seitenverhältnis des Bildschirms. */
  backdrop: Texture
  fill: FillMode
  /**
   * Weichgezeichnete Kleinfassung als Hintergrund für Textfolien. Gehört dem Aufrufer
   * und wird von `destroy()` nicht freigegeben.
   */
  soft: ImageBitmap
  /** Größe der Foto-Textur in Pixeln. */
  size: Size
  fit: Fit
  destroy(): void
}

/** Spielraum, damit beim Zoomen nichts unscharf wird. */
const ZOOM_HEADROOM = 1.35
/** Breite der weichen Kante als Anteil der kürzeren Bildschirmseite. */
const FEATHER = 0.03
const BACKDROP_WIDTH = 256

function textureFrom(bitmap: ImageBitmap, mipmaps: boolean): Texture {
  return new Texture({
    source: new ImageSource({ resource: bitmap, autoGenerateMipmaps: mipmaps })
  })
}

/** Blendet die Bildkanten aus, die an aufgefüllte Ränder grenzen. */
function featherEdges(
  ctx: OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  horizontal: boolean,
  width: number
): void {
  ctx.globalCompositeOperation = 'destination-out'
  const edges = horizontal
    ? [
        [0, 0, width, 0],
        [w, 0, w - width, 0]
      ]
    : [
        [0, 0, 0, width],
        [0, h, 0, h - width]
      ]
  for (const [x0, y0, x1, y1] of edges) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    if (horizontal) ctx.fillRect(Math.min(x0, x1), 0, width, h)
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
  ctx.filter = 'blur(9px) saturate(0.85) brightness(0.6)'
  ctx.drawImage(bitmap, (bw - dw) / 2, (bh - dh) / 2, dw, dh)
}

/** Mittlere Farbe eines Bildstreifens als [r, g, b]. */
function averageColor(
  data: Uint8ClampedArray,
  n: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
): number[] {
  const sum = [0, 0, 0]
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * n + x) * 4
      sum[0] += data[i]
      sum[1] += data[i + 1]
      sum[2] += data[i + 2]
      count++
    }
  }
  return sum.map((v) => v / Math.max(1, count))
}

/** Verlauf aus den Randfarben des Fotos, mit sanftem Lichtschein in der Mitte. */
function ambientBackdrop(
  ctx: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  bw: number,
  bh: number,
  horizontalGaps: boolean
): void {
  const n = 16
  const probe = new OffscreenCanvas(n, n).getContext('2d', { willReadFrequently: true })!
  probe.drawImage(bitmap, 0, 0, n, n)
  const { data } = probe.getImageData(0, 0, n, n)
  const [a, b] = horizontalGaps
    ? [averageColor(data, n, 0, 2, 0, n), averageColor(data, n, n - 2, n, 0, n)]
    : [averageColor(data, n, 0, n, 0, 2), averageColor(data, n, 0, n, n - 2, n)]
  const mid = averageColor(data, n, 0, n, 0, n)
  const css = (c: number[], k: number): string =>
    `rgb(${Math.round(c[0] * k)}, ${Math.round(c[1] * k)}, ${Math.round(c[2] * k)})`

  const g = horizontalGaps
    ? ctx.createLinearGradient(0, 0, bw, 0)
    : ctx.createLinearGradient(0, 0, 0, bh)
  g.addColorStop(0, css(a, 0.45))
  g.addColorStop(0.5, css(mid, 0.55))
  g.addColorStop(1, css(b, 0.45))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, bw, bh)
  const glow = ctx.createRadialGradient(bw / 2, bh / 2, 0, bw / 2, bh / 2, Math.max(bw, bh) * 0.6)
  glow.addColorStop(0, css(mid, 0.35).replace('rgb', 'rgba').replace(')', ', 0.6)'))
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, bw, bh)
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
  const l = layer.getContext('2d')!
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
  ctx.filter = 'blur(5px) saturate(0.9) brightness(0.7)'
  ctx.drawImage(layer, 0, 0)
}

/** Weichgezeichnete Kleinfassung im Seitenverhältnis des Bildschirms. */
function makeSoft(bitmap: ImageBitmap, screen: Size): ImageBitmap {
  const bw = BACKDROP_WIDTH
  const bh = Math.max(1, Math.round((bw * screen.h) / screen.w))
  const canvas = new OffscreenCanvas(bw, bh)
  blurBackdrop(canvas.getContext('2d')!, bitmap, bw, bh)
  return canvas.transferToImageBitmap()
}

async function fetchBitmap(name: string): Promise<ImageBitmap> {
  const response = await fetch(photoUrl(name))
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  return createImageBitmap(await response.blob(), { imageOrientation: 'from-image' })
}

/** Lädt nur die weichgezeichnete Kleinfassung eines Fotos (für Textfolien). */
export async function loadSoft(name: string, screen: Size): Promise<ImageBitmap> {
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
  const bw = mode === 'mirror' ? BACKDROP_WIDTH * 2 : BACKDROP_WIDTH
  const bh = Math.max(1, Math.round((bw * screen.h) / screen.w))
  const canvas = new OffscreenCanvas(bw, bh)
  const ctx = canvas.getContext('2d')!
  if (mode === 'ambient') ambientBackdrop(ctx, bitmap, bw, bh, horizontalGaps)
  else if (mode === 'mirror') mirrorBackdrop(ctx, bitmap, bw, bh, horizontalGaps)
  else blurBackdrop(ctx, bitmap, bw, bh)
  return canvas.transferToImageBitmap()
}

/**
 * Lädt ein Foto, dreht es nach EXIF, verkleinert es auf Bildschirmgröße
 * und bereitet die Randfüllung vor.
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
  const original = await fetchBitmap(name)

  const fit = fitImage({ w: original.width, h: original.height }, screen, maxCrop)
  // Ränder links/rechts, wenn das Bild schmaler ist als der Bildschirm, sonst oben/unten.
  const horizontalGaps = original.width / original.height < screen.w / screen.h
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
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(original, 0, 0, tw, th)
    if (!fit.covers) {
      // Kantenbreite in Bildschirmpixeln festlegen und in Texturpixel umrechnen.
      const texPerScreenPx = tw / (original.width * fit.scale)
      const side = horizontalGaps ? tw : th
      const width = Math.min(side * 0.15, FEATHER * Math.min(screen.w, screen.h) * texPerScreenPx)
      featherEdges(ctx, tw, th, horizontalGaps, width)
    }
    photoBitmap = canvas.transferToImageBitmap()
  }

  const backdropBitmap = makeBackdrop(original, screen, fill, horizontalGaps)
  const soft = makeSoft(original, screen)
  if (photoBitmap !== original) original.close()

  const photo = textureFrom(photoBitmap, true)
  const backdrop = textureFrom(backdropBitmap, false)
  const size = { w: photoBitmap.width, h: photoBitmap.height }

  return {
    name,
    photo,
    backdrop,
    fill,
    soft,
    size,
    fit: fitImage(size, screen, maxCrop),
    destroy() {
      photo.destroy(true)
      backdrop.destroy(true)
      photoBitmap.close()
      backdropBitmap.close()
    }
  }
}
