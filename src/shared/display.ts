import type { ShowArea } from './settings'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Ausschnitt eines Bildschirms, den die Show füllt (Drittel bzw. Hälften nebeneinander). */
export function areaBounds(b: Rect, area: ShowArea): Rect {
  const part = (from: number, to: number): Rect => {
    const x0 = b.x + Math.round(b.width * from)
    const x1 = b.x + Math.round(b.width * to)
    return { x: x0, y: b.y, width: x1 - x0, height: b.height }
  }
  switch (area) {
    case 'left':
      return part(0, 1 / 3)
    case 'center':
      return part(1 / 3, 2 / 3)
    case 'right':
      return part(2 / 3, 1)
    case 'leftHalf':
      return part(0, 1 / 2)
    case 'rightHalf':
      return part(1 / 2, 1)
    default:
      return { ...b }
  }
}

/** Sehr breite Bildschirme sind meist mehrere zusammengeschaltete Monitore. */
export function looksSpanned(width: number, height: number): boolean {
  return width / height > 2.6
}
