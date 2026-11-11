/**
 * Gesichtserkennung: reine Rechenfunktionen ohne Abhängigkeiten, damit sie testbar sind.
 * Erkennung mit YuNet (Eingabe 640×640, BGR 0–255), Wiedererkennung mit SFace
 * (ausgerichtetes Gesicht 112×112, RGB 0–255, 128 Werte).
 */

export const YUNET_SIZE = 640
export const SFACE_SIZE = 112
const STRIDES = [8, 16, 32] as const

export interface Detection {
  /** Rahmen in Pixeln des Eingabebildes: x, y, Breite, Höhe. */
  box: [number, number, number, number]
  /** 5 Punkte (rechtes Auge, linkes Auge, Nase, rechter und linker Mundwinkel) als x,y-Folge. */
  kps: number[]
  score: number
}

/** Ausgaben von YuNet nach Namen (cls_8, obj_8, bbox_8, kps_8, … für Schrittweiten 8, 16, 32). */
export type YunetOutputs = Record<string, ArrayLike<number>>

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Dekodiert die YuNet-Ausgaben in Gesichter (wie FaceDetectorYN in OpenCV). */
export function decodeYunet(
  out: YunetOutputs,
  size = YUNET_SIZE,
  scoreThreshold = 0.6,
  nmsThreshold = 0.3
): Detection[] {
  const found: Detection[] = []
  for (const s of STRIDES) {
    const cols = Math.floor(size / s)
    const rows = Math.floor(size / s)
    const cls = out[`cls_${s}`]
    const obj = out[`obj_${s}`]
    const bbox = out[`bbox_${s}`]
    const kps = out[`kps_${s}`]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]))
        if (score < scoreThreshold) continue
        const cx = (c + bbox[i * 4]) * s
        const cy = (r + bbox[i * 4 + 1]) * s
        const w = Math.exp(bbox[i * 4 + 2]) * s
        const h = Math.exp(bbox[i * 4 + 3]) * s
        const points: number[] = []
        for (let n = 0; n < 5; n++) {
          points.push((kps[i * 10 + 2 * n] + c) * s, (kps[i * 10 + 2 * n + 1] + r) * s)
        }
        found.push({ box: [cx - w / 2, cy - h / 2, w, h], kps: points, score })
      }
    }
  }
  return nms(found, nmsThreshold)
}

function iou(a: Detection['box'], b: Detection['box']): number {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[0] + a[2], b[0] + b[2])
  const y2 = Math.min(a[1] + a[3], b[1] + b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a[2] * a[3] + b[2] * b[3] - inter
  return union > 0 ? inter / union : 0
}

/** Entfernt überlappende Treffer, der beste bleibt. */
export function nms(dets: Detection[], threshold: number): Detection[] {
  const sorted = dets.slice().sort((a, b) => b.score - a.score)
  const keep: Detection[] = []
  for (const d of sorted) {
    if (keep.every((k) => iou(k.box, d.box) <= threshold)) keep.push(d)
  }
  return keep
}

/** Zielpositionen der 5 Punkte im 112×112-Bild (ArcFace-Vorlage, wie in OpenCV). */
export const SFACE_TEMPLATE: number[] = [
  38.2946, 51.6963, 73.5318, 51.5014, 56.0252, 71.7366, 41.5493, 92.3655, 70.7299, 92.2041
]

/**
 * Ähnlichkeitstransformation (Drehung, Skalierung, Verschiebung), die die Punkte `src`
 * bestmöglich auf `dst` abbildet. Ergebnis [a, b, tx, ty] mit
 * u = a·x − b·y + tx, v = b·x + a·y + ty.
 */
export function similarityTransform(
  src: number[],
  dst: number[]
): [number, number, number, number] {
  const n = src.length / 2
  let mx = 0
  let my = 0
  let mu = 0
  let mv = 0
  for (let i = 0; i < n; i++) {
    mx += src[2 * i]
    my += src[2 * i + 1]
    mu += dst[2 * i]
    mv += dst[2 * i + 1]
  }
  mx /= n
  my /= n
  mu /= n
  mv /= n
  let sxx = 0
  let num1 = 0
  let num2 = 0
  for (let i = 0; i < n; i++) {
    const x = src[2 * i] - mx
    const y = src[2 * i + 1] - my
    const u = dst[2 * i] - mu
    const v = dst[2 * i + 1] - mv
    sxx += x * x + y * y
    num1 += x * u + y * v
    num2 += x * v - y * u
  }
  const a = sxx > 0 ? num1 / sxx : 1
  const b = sxx > 0 ? num2 / sxx : 0
  return [a, b, mu - (a * mx - b * my), mv - (b * mx + a * my)]
}

export function normalize(v: ArrayLike<number>): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const len = Math.sqrt(sum) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / len
  return out
}

/** Kosinus-Ähnlichkeit zweier Vektoren (−1 … 1). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** Ähnlichkeit eines Gesichts zu einer Person: bester Wert über alle hinterlegten Beispiele. */
export function personSimilarity(face: ArrayLike<number>, samples: ArrayLike<number>[]): number {
  let best = -1
  for (const s of samples) best = Math.max(best, cosine(face, s))
  return best
}

// ---------- Speicherformat ----------

/** Float32-Vektor als Base64 (kompakt für die JSON-Datei). */
export function encodeEmbedding(v: ArrayLike<number>): string {
  const bytes = new Uint8Array(new Float32Array(Array.from(v)).buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function decodeEmbedding(s: string): Float32Array {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

/** Ein Gesicht im Index; Koordinaten relativ zur Bildgröße (0–1), Bild bereits nach EXIF gedreht. */
export interface StoredFace {
  box: [number, number, number, number]
  kps: number[]
  score: number
  emb: string
}

export interface PhotoFaces {
  /** Breite und Höhe des (gedrehten) Bildes in Pixeln. */
  w: number
  h: number
  faces: StoredFace[]
}

/** Gesicht, wie es Show und Einstellungen sehen (ohne Merkmalsvektor). */
export interface FaceView {
  box: [number, number, number, number]
  kps: number[]
  score: number
  /** Ähnlichkeit zur Fokus-Person, falls eine gewählt ist. */
  similarity?: number
  /** true, wenn es die Fokus-Person ist. */
  focus?: boolean
}

export interface FaceInfo {
  w: number
  h: number
  faces: FaceView[]
}

export interface FaceIndexStatus {
  total: number
  done: number
  faces: number
  running: boolean
  /** Fehlermeldung, falls die Erkennung nicht starten konnte (z. B. Modelle fehlen). */
  error?: string
}
