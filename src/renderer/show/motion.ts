import type { Rng } from '@shared/random'
import type { MotionKind } from '@shared/settings'

export interface Size {
  w: number
  h: number
}

/** Kameraposition: Zoom relativ zur Grundskalierung, Versatz der Bildmitte zur Bildschirmmitte in px. */
export interface Keyframe {
  zoom: number
  x: number
  y: number
}

export interface Shot {
  from: Keyframe
  to: Keyframe
  /** Zwischenpunkt einer Kamerafahrt: Der Pfad schwingt durch ihn hindurch (Bézierkurve). */
  via?: Keyframe
}

export interface Fit {
  /** Skalierung Bildpixel → Bildschirmpixel bei Zoom 1. */
  scale: number
  /** true, wenn das Bild den Bildschirm vollständig füllt (ggf. leicht beschnitten). */
  covers: boolean
}

/**
 * Füllt den Bildschirm, wenn dafür höchstens `maxCrop` des Bildes wegfällt,
 * sonst wird eingepasst und der Rand später aufgefüllt.
 */
export function fitImage(img: Size, screen: Size, maxCrop: number): Fit {
  const contain = Math.min(screen.w / img.w, screen.h / img.h)
  const cover = Math.max(screen.w / img.w, screen.h / img.h)
  const crop = 1 - contain / cover
  return crop <= maxCrop + 1e-9 ? { scale: cover, covers: true } : { scale: contain, covers: false }
}

/** Größter erlaubter Versatz je Achse, ohne dass über den Bildrand hinaus Leere sichtbar wird. */
export function maxOffset(img: Size, screen: Size, scale: number, zoom: number): Size {
  return {
    w: Math.max(0, (img.w * scale * zoom - screen.w) / 2),
    h: Math.max(0, (img.h * scale * zoom - screen.h) / 2)
  }
}

function randomOffset(limit: Size, rng: Rng, amount = 1): { x: number; y: number } {
  return {
    x: (rng() * 2 - 1) * limit.w * amount,
    y: (rng() * 2 - 1) * limit.h * amount
  }
}

/**
 * Plant die Kamerabewegung für ein Foto.
 * @param intensity zusätzlicher Zoom, z. B. 0.15 für 15 %
 */
export function planShot(
  img: Size,
  screen: Size,
  scale: number,
  kind: MotionKind,
  intensity: number,
  rng: Rng = Math.random
): Shot {
  const zMax = 1 + Math.max(0, intensity)
  const limitMax = maxOffset(img, screen, scale, zMax)

  if (kind === 'pan') {
    // Schwenk über die Achse mit dem meisten Spielraum, von einer Seite zur anderen.
    const horizontal = limitMax.w >= limitMax.h
    const dir = rng() < 0.5 ? -1 : 1
    const travel = 0.6 + rng() * 0.4
    const along = horizontal ? limitMax.w : limitMax.h
    const across = (rng() * 2 - 1) * 0.3 * (horizontal ? limitMax.h : limitMax.w)
    const a = -dir * along * travel
    const b = dir * along * travel
    return horizontal
      ? { from: { zoom: zMax, x: a, y: across }, to: { zoom: zMax, x: b, y: across } }
      : { from: { zoom: zMax, x: across, y: a }, to: { zoom: zMax, x: across, y: b } }
  }

  if (kind === 'journey') {
    // Kamerafahrt: von einem Bildteil über einen nahen Zwischenpunkt zu einem anderen.
    const i = Math.max(0, intensity)
    const zFrom = 1 + i * (0.25 + rng() * 0.2)
    const zVia = 1 + i
    const zTo = 1 + i * (0.55 + rng() * 0.25)
    const from = randomOffset(maxOffset(img, screen, scale, zFrom), rng, 0.9)
    const limTo = maxOffset(img, screen, scale, zTo)
    // Ziel liegt grob gegenüber dem Start, damit die Fahrt Strecke macht.
    const to = {
      x: -Math.sign(from.x || 1) * (0.4 + rng() * 0.5) * limTo.w,
      y: -Math.sign(from.y || 1) * (0.4 + rng() * 0.5) * limTo.h
    }
    const via = randomOffset(maxOffset(img, screen, scale, zVia), rng, 0.7)
    return {
      from: { zoom: zFrom, ...from },
      via: { zoom: zVia, ...via },
      to: { zoom: zTo, ...to }
    }
  }

  const wide: Keyframe = { zoom: 1, x: 0, y: 0 }
  const close: Keyframe = { zoom: zMax, ...randomOffset(limitMax, rng, 0.8) }
  return kind === 'zoomIn' ? { from: wide, to: close } : { from: close, to: wide }
}

/** Sanftes Ein- und Auslaufen, kaum spürbar; die Bewegung wirkt fast gleichmäßig. */
export function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  const sine = 0.5 - 0.5 * Math.cos(Math.PI * c)
  return 0.4 * c + 0.6 * sine
}

/** Kamera zum Zeitpunkt t ∈ [0,1], der Versatz wird an den Bildrand begrenzt. */
export function evaluateShot(
  shot: Shot,
  t: number,
  img: Size,
  screen: Size,
  scale: number
): Keyframe {
  const e = ease(t)
  const { from, to, via } = shot
  const blend = (a: number, b: number, c?: number): number =>
    c === undefined ? a + (b - a) * e : (1 - e) * (1 - e) * a + 2 * (1 - e) * e * c + e * e * b
  const zoom = blend(from.zoom, to.zoom, via?.zoom)
  const limit = maxOffset(img, screen, scale, zoom)
  const x = blend(from.x, to.x, via?.x)
  const y = blend(from.y, to.y, via?.y)
  return {
    zoom,
    x: Math.max(-limit.w, Math.min(limit.w, x)),
    y: Math.max(-limit.h, Math.min(limit.h, y))
  }
}
