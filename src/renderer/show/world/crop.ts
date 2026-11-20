import type { FaceBox } from '../motion'

/** Gesicht mit Markierung, ob es die Fokus-Person bzw. der Partner ist. */
export interface CropFace {
  box: FaceBox
  focus?: boolean
  partner?: boolean
}

/** Ohne Gesichter sitzt ein senkrechter Ausschnitt etwas oberhalb der Mitte (Köpfe). */
const UPPER_BIAS = 0.4
/** Rand um die Gesichter (Anteil der Gesichtsgröße), damit nicht knapp am Kinn geschnitten wird. */
const MARGIN = 0.35

/**
 * Lage eines Ausschnitts auf einer Achse: `r` = Größe des Ausschnitts (Anteil des Bildes),
 * `roi` = Bereich, der möglichst zu sehen sein soll, `base` = Lage ohne Vorgabe (0–1 des
 * Spielraums). Liefert die Mitte des Ausschnitts (0–1).
 */
function axis(r: number, roi: [number, number] | null, base: number): number {
  if (r >= 1) return 0.5
  const free = 1 - r
  let o = base * free
  if (roi) {
    const [a, b] = roi
    if (b - a <= r) {
      // Bereich passt hinein: so wenig wie möglich von der Grundlage abrücken.
      o = Math.min(Math.max(o, b - r), a)
    } else {
      // Zu groß: auf seine Mitte setzen.
      o = (a + b) / 2 - r / 2
    }
  }
  o = Math.min(free, Math.max(0, o))
  return o + r / 2
}

/**
 * Mitte des Ausschnitts für eine Kachel der 3D-Welt: Das Foto (Seitenverhältnis `image`)
 * wird auf `shown` beschnitten, ohne zu zoomen. Zu sehen sein sollen Fokus-Person und
 * Partner, sonst alle Gesichter; ohne Gesichter mittig, senkrecht etwas nach oben.
 * Koordinaten relativ (0–1, oben links), wie die Gesichtsboxen.
 */
export function tileCropCenter(image: number, shown: number, faces: CropFace[]): [number, number] {
  const rx = shown < image ? shown / image : 1
  const ry = shown < image ? 1 : image / shown
  const key = faces.filter((f) => f.focus || f.partner)
  const use = key.length ? key : faces
  let roiX: [number, number] | null = null
  let roiY: [number, number] | null = null
  if (use.length) {
    const xs: number[] = []
    const ys: number[] = []
    for (const { box } of use) {
      const [x, y, w, h] = box
      xs.push(x - w * MARGIN, x + w * (1 + MARGIN))
      ys.push(y - h * MARGIN, y + h * (1 + MARGIN))
    }
    roiX = [Math.max(0, Math.min(...xs)), Math.min(1, Math.max(...xs))]
    roiY = [Math.max(0, Math.min(...ys)), Math.min(1, Math.max(...ys))]
  }
  return [axis(rx, roiX, 0.5), axis(ry, roiY, UPPER_BIAS)]
}
