import { ImageSource, Texture } from 'pixi.js'
import { photoUrl } from '@shared/ipc'
import { fitImage, type Fit, type Size } from './motion'

export interface LoadedPhoto {
  /** Pfad relativ zum Fotoordner. */
  name: string
  photo: Texture
  /** Kleine, weichgezeichnete Version für die Randfüllung. */
  backdrop: Texture
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

/** Weichgezeichnete, abgedunkelte Fassung des Fotos im Seitenverhältnis des Bildschirms. */
function makeBackdrop(bitmap: ImageBitmap, screen: Size): ImageBitmap {
  const bw = BACKDROP_WIDTH
  const bh = Math.max(1, Math.round((BACKDROP_WIDTH * screen.h) / screen.w))
  const canvas = new OffscreenCanvas(bw, bh)
  const ctx = canvas.getContext('2d')!
  // Etwas größer als die Fläche zeichnen, damit der Weichzeichner keine hellen Ränder erzeugt.
  const pad = 24
  const s = Math.max((bw + pad * 2) / bitmap.width, (bh + pad * 2) / bitmap.height)
  const dw = bitmap.width * s
  const dh = bitmap.height * s
  ctx.filter = 'blur(9px) saturate(0.85) brightness(0.6)'
  ctx.drawImage(bitmap, (bw - dw) / 2, (bh - dh) / 2, dw, dh)
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
  maxCrop: number
): Promise<LoadedPhoto> {
  const response = await fetch(photoUrl(name))
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const original = await createImageBitmap(await response.blob(), {
    imageOrientation: 'from-image'
  })

  const fit = fitImage({ w: original.width, h: original.height }, screen, maxCrop)
  const physW = screen.w * pixelRatio
  const physH = screen.h * pixelRatio
  const needed = Math.max(physW / original.width, physH / original.height) * ZOOM_HEADROOM
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
      // Ränder links/rechts, wenn das Bild schmaler ist als der Bildschirm, sonst oben/unten.
      const horizontalGaps = original.width / original.height < screen.w / screen.h
      // Kantenbreite in Bildschirmpixeln festlegen und in Texturpixel umrechnen.
      const texPerScreenPx = tw / (original.width * fit.scale)
      const side = horizontalGaps ? tw : th
      const width = Math.min(side * 0.15, FEATHER * Math.min(screen.w, screen.h) * texPerScreenPx)
      featherEdges(ctx, tw, th, horizontalGaps, width)
    }
    photoBitmap = canvas.transferToImageBitmap()
  }

  const backdropBitmap = makeBackdrop(original, screen)
  if (photoBitmap !== original) original.close()

  const photo = textureFrom(photoBitmap, true)
  const backdrop = textureFrom(backdropBitmap, false)
  const size = { w: photoBitmap.width, h: photoBitmap.height }

  return {
    name,
    photo,
    backdrop,
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
