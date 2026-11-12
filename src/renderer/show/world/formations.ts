import type { WorldFormation } from '@shared/settings'

/**
 * Formationen der 3D-Fotowelt als reine Rechnung (ohne Three.js, daher testbar).
 * Jede Kachel bekommt eine Position und einen Blickpunkt: Die Kachel zeigt mit ihrer
 * Vorderseite auf diesen Punkt.
 */

export type Vec3 = [number, number, number]

export interface Placement {
  pos: Vec3
  /** Punkt, auf den die Vorderseite der Kachel zeigt. */
  target: Vec3
}

/** Wie die Kamera eine Formation zeigt. */
export type CameraStyle = 'orbit' | 'dolly' | 'flythrough' | 'sweep'

export interface FormationInfo {
  camera: CameraStyle
  /** Abstand bzw. Radius der Kamera. */
  distance: number
  /** Höhe der Kamera über der Mitte. */
  height: number
  /** Länge der Strecke bei Durchflug/Überflug. */
  travel: number
}

export const TILE_W = 1.6
export const TILE_H = 1.2

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

/** Deterministische Pseudozufallszahl je Kachel (gleiche Kachel → gleicher Wert). */
export function hash01(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Kachelpositionen einer Formation für Kachel i von n zur Zeit t (Sekunden, für Bewegtes). */
export function placement(kind: WorldFormation, i: number, n: number, t: number): Placement {
  switch (kind) {
    case 'sphere': {
      // Fibonacci-Kugel: gleichmäßig verteilt, Kacheln schauen nach außen
      const r = Math.max(5, Math.sqrt(n) * 1.15)
      const y = 1 - (2 * (i + 0.5)) / n
      const ring = Math.sqrt(1 - y * y)
      const phi = i * Math.PI * (3 - Math.sqrt(5))
      const pos: Vec3 = [Math.cos(phi) * ring * r, y * r, Math.sin(phi) * ring * r]
      return { pos, target: scale(pos, 2) }
    }
    case 'helix': {
      // Spirale wie im Periodic-Table-Beispiel
      const r = 7
      const phi = i * 0.38 + Math.PI
      const y = (n / 2 - i) * 0.16
      const pos: Vec3 = [Math.sin(phi) * r, y, Math.cos(phi) * r]
      return { pos, target: [pos[0] * 2, y, pos[2] * 2] }
    }
    case 'grid': {
      // 3D-Raster: 5 × 5 Kacheln je Ebene, Ebenen hintereinander
      const col = i % 5
      const row = Math.floor(i / 5) % 5
      const layer = Math.floor(i / 25)
      const layers = Math.ceil(n / 25)
      const pos: Vec3 = [(col - 2) * 2.3, (2 - row) * 1.9, (layer - (layers - 1) / 2) * -4]
      return { pos, target: add(pos, [0, 0, 1]) }
    }
    case 'table': {
      // Flache Wand in Zeilen und Spalten
      const cols = Math.ceil(Math.sqrt(n * 1.7))
      const rows = Math.ceil(n / cols)
      const col = i % cols
      const row = Math.floor(i / cols)
      const pos: Vec3 = [(col - (cols - 1) / 2) * 1.8, ((rows - 1) / 2 - row) * 1.4, 0]
      return { pos, target: add(pos, [0, 0, 1]) }
    }
    case 'frames': {
      // Schwebende Bilderrahmen locker im Raum, die Kamera fliegt hindurch
      const x = (hash01(i, 1) - 0.5) * 16
      const y = (hash01(i, 2) - 0.5) * 8 + Math.sin(t * 0.6 + i) * 0.25
      const z = -(i / n) * 34 + 6
      const pos: Vec3 = [x, y, z]
      const turn = (hash01(i, 3) - 0.5) * 1.2
      return { pos, target: add(pos, [Math.sin(turn), 0, Math.cos(turn)]) }
    }
    case 'cube': {
      // Kacheln auf den sechs Seiten eines sich drehenden Würfels
      const perFace = Math.ceil(n / 6)
      const g = Math.ceil(Math.sqrt(perFace))
      const face = Math.min(5, Math.floor(i / perFace))
      const k = i - face * perFace
      const u = ((k % g) - (g - 1) / 2) * 1.75
      const v = ((g - 1) / 2 - Math.floor(k / g)) * 1.35
      const h = (g * 1.75) / 2 + 0.3
      const local: [Vec3, Vec3][] = [
        [
          [u, v, h],
          [0, 0, 1]
        ],
        [
          [-u, v, -h],
          [0, 0, -1]
        ],
        [
          [h, v, -u],
          [1, 0, 0]
        ],
        [
          [-h, v, u],
          [-1, 0, 0]
        ],
        [
          [u, h, -v],
          [0, 1, 0]
        ],
        [
          [u, -h, v],
          [0, -1, 0]
        ]
      ]
      const [p, nrm] = local[face]
      const a = t * 0.25
      const rot = (q: Vec3): Vec3 => [
        q[0] * Math.cos(a) + q[2] * Math.sin(a),
        q[1],
        -q[0] * Math.sin(a) + q[2] * Math.cos(a)
      ]
      const pos = rot(p)
      return { pos, target: add(pos, rot(nrm)) }
    }
    case 'carousel': {
      // Drehender Ring, Kacheln nach außen
      const r = Math.max(6, (n * 1.9) / (2 * Math.PI))
      const phi = (i / n) * Math.PI * 2 + t * 0.15
      const pos: Vec3 = [Math.sin(phi) * r, Math.sin(i * 1.7) * 0.4, Math.cos(phi) * r]
      return { pos, target: [pos[0] * 2, pos[1], pos[2] * 2] }
    }
    case 'tunnel': {
      // Röhre entlang der Blickrichtung, Kacheln nach innen
      const perRing = 10
      const ring = Math.floor(i / perRing)
      const phi = ((i % perRing) / perRing) * Math.PI * 2 + ring * 0.3
      const r = 4.2
      const z = -ring * 2.4 + 4
      const pos: Vec3 = [Math.cos(phi) * r, Math.sin(phi) * r, z]
      return { pos, target: [0, 0, z] }
    }
    case 'wave': {
      // Wogende Fläche, Kacheln schauen schräg nach oben zur Kamera
      const cols = Math.ceil(Math.sqrt(n * 1.6))
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = (col - (cols - 1) / 2) * 1.9
      const z = -row * 1.6 + 3
      const y = Math.sin(x * 0.45 + t * 0.9) * 0.8 + Math.cos(z * 0.5 + t * 0.7) * 0.5 - 2
      const pos: Vec3 = [x, y, z]
      return { pos, target: add(pos, [0, 1, 0.8]) }
    }
  }
}

/** Kamera-Eigenschaften je Formation (abhängig von der Kachelzahl). */
export function formationInfo(kind: WorldFormation, n: number): FormationInfo {
  switch (kind) {
    case 'sphere':
      return {
        camera: 'orbit',
        distance: Math.max(5, Math.sqrt(n) * 1.15) * 2.6,
        height: 2,
        travel: 0
      }
    case 'helix':
      return { camera: 'orbit', distance: 19, height: 0, travel: 0 }
    case 'grid':
      return { camera: 'dolly', distance: 17, height: 1, travel: 5 }
    case 'table':
      return {
        camera: 'dolly',
        distance: Math.ceil(Math.sqrt(n * 1.7)) * 1.5,
        height: 0,
        travel: 4
      }
    case 'frames':
      return { camera: 'flythrough', distance: 12, height: 0, travel: 30 }
    case 'cube':
      return { camera: 'orbit', distance: 16, height: 5, travel: 0 }
    case 'carousel':
      return {
        camera: 'orbit',
        distance: Math.max(6, (n * 1.9) / (2 * Math.PI)) + 5,
        height: 2,
        travel: 0
      }
    case 'tunnel':
      return { camera: 'flythrough', distance: 8, height: 0, travel: Math.ceil(n / 10) * 2.4 }
    case 'wave':
      return { camera: 'sweep', distance: 12, height: 6, travel: 10 }
  }
}

/** Startpunkt einer Kachel, bevor sie in die erste Formation fliegt (weit verstreut). */
export function scattered(i: number): Placement {
  const pos: Vec3 = [
    (hash01(i, 7) - 0.5) * 80,
    (hash01(i, 8) - 0.5) * 50,
    (hash01(i, 9) - 0.5) * 80 - 20
  ]
  return { pos, target: add(pos, [hash01(i, 10) - 0.5, hash01(i, 11) - 0.5, 1]) }
}

/** Weiches Ein- und Auslaufen (wie Exponential-Easing im Vorbild, etwas sanfter). */
export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}
