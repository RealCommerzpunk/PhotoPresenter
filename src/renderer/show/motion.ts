import type { Rng } from '@shared/random'
import type { FocusMode, MotionKind } from '@shared/settings'

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
  /**
   * Pfad aus mehreren Stationen (Zeitpunkt t ∈ [0,1] aufsteigend). Die Kamera fährt von
   * Station zu Station und kommt an jeder kurz zur Ruhe. Hat Vorrang vor from/via/to.
   */
  path?: (Keyframe & { t: number })[]
}

/** Rahmen eines Gesichts relativ zur Bildgröße: x, y, Breite, Höhe (0–1). */
export type FaceBox = [number, number, number, number]

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
  if (shot.path && shot.path.length > 1) return evaluatePath(shot.path, t, img, screen, scale)
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

function clampToImage(k: Keyframe, img: Size, screen: Size, scale: number): Keyframe {
  const limit = maxOffset(img, screen, scale, k.zoom)
  return {
    zoom: k.zoom,
    x: Math.max(-limit.w, Math.min(limit.w, k.x)),
    y: Math.max(-limit.h, Math.min(limit.h, k.y))
  }
}

function evaluatePath(
  path: (Keyframe & { t: number })[],
  t: number,
  img: Size,
  screen: Size,
  scale: number
): Keyframe {
  const c = Math.min(1, Math.max(0, t))
  let i = 0
  while (i < path.length - 2 && c > path[i + 1].t) i++
  const a = path[i]
  const b = path[i + 1]
  const span = Math.max(1e-6, b.t - a.t)
  const u = Math.min(1, Math.max(0, (c - a.t) / span))
  // Jede Teilstrecke beginnt und endet weich: Die Kamera verweilt an den Stationen.
  const e = u * u * (3 - 2 * u)
  return clampToImage(
    {
      zoom: a.zoom + (b.zoom - a.zoom) * e,
      x: a.x + (b.x - a.x) * e,
      y: a.y + (b.y - a.y) * e
    },
    img,
    screen,
    scale
  )
}

/** Höchster Zoom auf ein Gesicht, damit es nicht übermäßig vergrößert wird. */
export const MAX_FACE_ZOOM = 4

/** Zoom, bei dem das Gesicht `faceSize` der Bildschirmhöhe einnimmt (mindestens 1). */
export function faceZoom(
  face: FaceBox,
  img: Size,
  screen: Size,
  scale: number,
  faceSize: number
): number {
  const faceHeight = face[3] * img.h * scale
  if (faceHeight <= 0) return 1
  return Math.min(MAX_FACE_ZOOM, Math.max(1, (faceSize * screen.h) / faceHeight))
}

/** Kamera, die das Gesicht bei Zoom `zoom` in die Bildschirmmitte holt (soweit möglich). */
export function faceKey(face: FaceBox, img: Size, scale: number, zoom: number): Keyframe {
  const cx = face[0] + face[2] / 2
  // Etwas oberhalb der Gesichtsmitte zielen: Augenpartie wirkt natürlicher als Mund.
  const cy = face[1] + face[3] * 0.45
  return {
    zoom,
    x: -(cx - 0.5) * img.w * scale * zoom,
    y: -(cy - 0.5) * img.h * scale * zoom
  }
}

export interface FocusPlan {
  mode: FocusMode
  /** Gesichtshöhe am Ende, Anteil der Bildschirmhöhe. */
  faceSize: number
  /** Über die anderen Gesichter schwenken: davor, danach oder gar nicht. */
  others: 'off' | 'before' | 'after'
}

/**
 * Kamerabewegung zur Fokus-Person: anzoomen (langsam, schnell, als Fahrt), optional
 * vorher oder nachher über die anderen Gesichter (höchstens drei, von links nach rechts).
 */
export function planFocusShot(
  img: Size,
  screen: Size,
  scale: number,
  focus: FaceBox,
  otherFaces: FaceBox[],
  plan: FocusPlan,
  rng: Rng = Math.random
): Shot {
  const zFocus = faceZoom(focus, img, screen, scale, plan.faceSize)
  const target = faceKey(focus, img, scale, zFocus)
  const wide: Keyframe = { zoom: 1, x: 0, y: 0 }
  const others = otherFaces
    .slice()
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map((f) =>
      faceKey(f, img, scale, Math.max(1, faceZoom(f, img, screen, scale, plan.faceSize) * 0.8))
    )

  if (plan.others !== 'off' && others.length) {
    const stations: Keyframe[] =
      plan.others === 'before' ? [wide, ...others, target] : [wide, target, ...others]
    // Die Fokus-Person bekommt die längste Verweildauer.
    const weights: number[] = stations.map((k) => (k === target ? 2 : 1))
    weights[0] = 0.6
    const total = weights.reduce((a, b) => a + b, 0)
    let acc = 0
    const path = stations.map((k, i) => {
      const key = { ...k, t: acc / total }
      acc += weights[i]
      return key
    })
    if (plan.others === 'before') {
      // Am Ende noch etwas auf dem Gesicht ruhen und leicht nachzoomen.
      path[path.length - 1].t = Math.min(0.82, path[path.length - 1].t)
      path.push({
        ...target,
        zoom: target.zoom * 1.04,
        x: target.x * 1.04,
        y: target.y * 1.04,
        t: 1
      })
    } else {
      path[path.length - 1].t = 1
    }
    return { from: path[0], to: path[path.length - 1], path }
  }

  switch (plan.mode) {
    case 'fastZoom':
      // Kurz das ganze Bild, dann zügig aufs Gesicht, dort langsam weiter.
      return {
        from: wide,
        to: target,
        path: [
          { ...wide, t: 0 },
          { ...wide, zoom: 1.02, t: 0.12 },
          { ...target, t: 0.42 },
          { ...target, zoom: target.zoom * 1.06, x: target.x * 1.06, y: target.y * 1.06, t: 1 }
        ]
      }
    case 'journey': {
      // Fahrt von einer anderen Bildstelle in einem Bogen zum Gesicht.
      const zStart = 1 + (zFocus - 1) * 0.35
      const lim = maxOffset(img, screen, scale, zStart)
      const from: Keyframe = {
        zoom: zStart,
        x: -Math.sign(target.x || (rng() < 0.5 ? 1 : -1)) * lim.w * (0.5 + rng() * 0.4),
        y: -Math.sign(target.y || (rng() < 0.5 ? 1 : -1)) * lim.h * (0.3 + rng() * 0.4)
      }
      const via: Keyframe = {
        zoom: 1 + (zFocus - 1) * 0.6,
        x: (from.x + target.x) / 2 + (rng() - 0.5) * screen.w * 0.3,
        y: (from.y + target.y) / 2 + (rng() - 0.5) * screen.h * 0.3
      }
      return { from, via, to: target }
    }
    default:
      return { from: wide, to: target }
  }
}

/**
 * Größter Zoom, bei dem das Foto höchstens um `maxUpscale` über seine Originalauflösung
 * vergrößert wird (sonst wird es pixelig und matschig).
 * @param fitScaleOriginal Skalierung Originalpixel → logische Bildschirmpixel bei Zoom 1
 * @param pixelRatio Gerätepixel pro logischem Pixel
 */
export function zoomLimit(
  fitScaleOriginal: number,
  pixelRatio: number,
  maxUpscale: number
): number {
  return Math.max(1, maxUpscale / Math.max(1e-6, fitScaleOriginal * pixelRatio))
}

/**
 * Begrenzt alle Stationen eines Kamerapfads auf `maxZoom`. Der Versatz wird mitskaliert,
 * damit die Kamera weiter auf dieselbe Bildstelle zielt (z. B. ein Gesicht bleibt mittig).
 */
export function limitShot(shot: Shot, maxZoom: number): Shot {
  const lim = <K extends Keyframe>(k: K): K =>
    k.zoom <= maxZoom
      ? k
      : { ...k, zoom: maxZoom, x: (k.x * maxZoom) / k.zoom, y: (k.y * maxZoom) / k.zoom }
  return {
    from: lim(shot.from),
    to: lim(shot.to),
    via: shot.via && lim(shot.via),
    path: shot.path?.map(lim)
  }
}
