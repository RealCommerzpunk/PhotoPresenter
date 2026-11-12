import type { FaceBox, Keyframe, Size } from './motion'

/** Rechteck in Bildschirmpixeln (CSS-Pixel der Bühne). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Wo ein Gesicht bei Kamera `k` auf dem Bildschirm liegt. Der Rahmen der Erkennung ist eng
 * ums Gesicht; erweitert um Haare/Stirn oben und Kinn/Hals unten, damit Texte und Emojis
 * nicht knapp am Gesicht kleben.
 */
export function faceOnScreen(
  face: FaceBox,
  img: Size,
  screen: Size,
  scale: number,
  k: Keyframe
): Rect {
  const s = scale * k.zoom
  const left = screen.w / 2 + k.x + (face[0] - 0.5) * img.w * s
  const top = screen.h / 2 + k.y + (face[1] - 0.5) * img.h * s
  const w = face[2] * img.w * s
  const h = face[3] * img.h * s
  return { x: left - w * 0.3, y: top - h * 0.45, w: w * 1.6, h: h * 1.8 }
}

/** Überlappungsfläche zweier Rechtecke. */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Wie viel Gesichtsfläche das Rechteck verdeckt (Summe über alle Gesichter). */
export function coveredArea(r: Rect, faces: Rect[]): number {
  return faces.reduce((sum, f) => sum + overlap(r, f), 0)
}

/**
 * Bester Platz: der erste Kandidat (Reihenfolge = Vorliebe), der höchstens `tolerance`
 * seiner eigenen Fläche über Gesichtern hat; sonst der mit der wenigsten Überdeckung.
 */
export function bestPlace<T>(
  candidates: { value: T; rect: Rect }[],
  faces: Rect[],
  tolerance = 0.03
): T {
  let best = candidates[0]
  let bestArea = Infinity
  for (const c of candidates) {
    const area = coveredArea(c.rect, faces)
    if (area <= tolerance * c.rect.w * c.rect.h) return c.value
    if (area < bestArea) {
      best = c
      bestArea = area
    }
  }
  return best.value
}
