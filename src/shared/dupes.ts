/**
 * Doppelte Fotos am Bildinhalt erkennen (Wahrnehmungs-Hash, „pHash“).
 *
 * Das Bild wird auf 32 × 32 Graustufen verkleinert und per DCT zerlegt; die 8 × 8 niedrigsten
 * Frequenzen ergeben 64 Bit (über/unter dem Median). Verkleinern, neu Komprimieren, ein anderes
 * Format oder leichte Helligkeitsänderungen verschieben nur wenige Bits.
 *
 * Geeicht an den Demo-Fotos: echte Kopien (bis 480 px verkleinert, JPEG-Qualität 35, PNG, heller)
 * liegen höchstens 2 Bit auseinander, die ähnlichsten Serienbilder mindestens 10 Bit.
 */

/** Kantenlänge des Graustufenbildes, aus dem der Hash entsteht. */
export const HASH_SIZE = 32
/** Bis zu diesem Abstand (Bits) gelten zwei Fotos als gleich. */
export const DUPE_MAX_DISTANCE = 6
/** Seitenverhältnisse dürfen höchstens so stark (relativ) abweichen. */
const MAX_ASPECT_DIFF = 0.03
/** Unterordner im Fotoordner, in den Dubletten verschoben werden (wird nicht eingelesen). */
export const DUPLICATES_DIR = 'Duplicates'

let dctMatrix: Float64Array | null = null

/** Orthonormale DCT-II-Matrix (zeilenweise), einmal berechnet. */
function dct(): Float64Array {
  if (dctMatrix) return dctMatrix
  const n = HASH_SIZE
  const m = new Float64Array(n * n)
  for (let k = 0; k < n; k++) {
    const scale = Math.sqrt((k === 0 ? 1 : 2) / n)
    for (let i = 0; i < n; i++)
      m[k * n + i] = scale * Math.cos((Math.PI * (2 * i + 1) * k) / (2 * n))
  }
  dctMatrix = m
  return m
}

/**
 * Hash aus 32 × 32 Helligkeitswerten (zeilenweise) als 16 Hex-Zeichen.
 * Gleichwertig zu D = C · G · Cᵀ, aber nur die 8 × 8 benötigten Koeffizienten.
 */
export function phashFromGray(gray: ArrayLike<number>): string {
  const n = HASH_SIZE
  if (gray.length !== n * n) throw new Error(`Erwartet ${n * n} Werte, nicht ${gray.length}`)
  const c = dct()
  // T = G · Cᵀ, nur die ersten 8 Spalten
  const t = new Float64Array(n * 8)
  for (let y = 0; y < n; y++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0
      for (let x = 0; x < n; x++) sum += gray[y * n + x] * c[v * n + x]
      t[y * 8 + v] = sum
    }
  }
  // D = C · T, nur die ersten 8 Zeilen
  const low = new Float64Array(64)
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0
      for (let y = 0; y < n; y++) sum += c[u * n + y] * t[y * 8 + v]
      low[u * 8 + v] = sum
    }
  }
  // Median ohne den Gleichanteil (Gesamthelligkeit), der selbst immer 0 bleibt
  const ac = Array.from(low.subarray(1)).sort((a, b) => a - b)
  const median = ac[ac.length >> 1]
  let hex = ''
  for (let nibble = 0; nibble < 16; nibble++) {
    let value = 0
    for (let b = 0; b < 4; b++) {
      const i = nibble * 4 + b
      if (i > 0 && low[i] > median) value |= 8 >> b
    }
    hex += value.toString(16)
  }
  return hex
}

/** Helligkeit (BT.601) aus RGBA-Pixeln, z. B. von `getImageData`. */
export function grayFromRgba(rgba: ArrayLike<number>): Float64Array {
  const gray = new Float64Array(rgba.length / 4)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  }
  return gray
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  x = (x + (x >>> 4)) & 0x0f0f0f0f
  return Math.imul(x, 0x01010101) >>> 24
}

/** Anzahl unterschiedlicher Bits zweier Hashes. */
export function hammingDistance(a: string, b: string): number {
  return (
    popcount((parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0) +
    popcount((parseInt(a.slice(8, 16), 16) ^ parseInt(b.slice(8, 16), 16)) >>> 0)
  )
}

export interface HashedPhoto {
  /** Pfad relativ zum Fotoordner. */
  name: string
  phash: string
  w: number
  h: number
  /** Dateigröße in Bytes (entscheidet bei gleicher Auflösung). */
  size: number
}

export interface DuplicateGroup {
  /** Die hochauflösendste Fassung: Sie bleibt. */
  keep: HashedPhoto
  /** Die übrigen, absteigend nach Auflösung. */
  others: HashedPhoto[]
}

/** Name sieht nach Kopie aus („Kopie“, „copy“, „(2)“, „_1“, „ - 2“). */
const COPY_NAME = /(kopie|copy|\(\d+\)|[_ ]-? ?\d{1,2})\.[a-z0-9]+$/i

/**
 * Welche Fassung behalten wird: mehr Pixel, dann größere Datei, dann der Name, der nicht nach
 * Kopie aussieht, dann alphabetisch.
 */
function better(a: HashedPhoto, b: HashedPhoto): number {
  const copyA = COPY_NAME.test(a.name) ? 1 : 0
  const copyB = COPY_NAME.test(b.name) ? 1 : 0
  return b.w * b.h - a.w * a.h || b.size - a.size || copyA - copyB || a.name.localeCompare(b.name)
}

/**
 * Gruppen gleicher Fotos (Abstand ≤ `maxDistance`, gleiches Seitenverhältnis). Wer über ein
 * drittes Foto mit einem anderen verbunden ist, landet in derselben Gruppe.
 */
export function findDuplicates(
  photos: HashedPhoto[],
  maxDistance = DUPE_MAX_DISTANCE
): DuplicateGroup[] {
  const list = photos.filter((p) => /^[0-9a-f]{16}$/.test(p.phash) && p.w > 0 && p.h > 0)
  const hi = list.map((p) => parseInt(p.phash.slice(0, 8), 16))
  const lo = list.map((p) => parseInt(p.phash.slice(8, 16), 16))
  const aspect = list.map((p) => p.w / p.h)
  const parent = list.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = popcount((hi[i] ^ hi[j]) >>> 0) + popcount((lo[i] ^ lo[j]) >>> 0)
      if (d > maxDistance) continue
      if (Math.abs(aspect[i] - aspect[j]) / Math.max(aspect[i], aspect[j]) > MAX_ASPECT_DIFF)
        continue
      parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, HashedPhoto[]>()
  list.forEach((p, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), p])
  })
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const sorted = [...g].sort(better)
      return { keep: sorted[0], others: sorted.slice(1) }
    })
    .sort((a, b) => a.keep.name.localeCompare(b.keep.name))
}
