import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import {
  decodeYunet,
  encodeEmbedding,
  normalize,
  SFACE_SIZE,
  SFACE_TEMPLATE,
  similarityTransform,
  templateKeypoints,
  YUNET_SIZE,
  type Detection,
  type PhotoFaces,
  type StoredFace,
  type YunetOutputs
} from '@shared/faces'
import { grayFromRgba, HASH_SIZE, phashFromGray } from '@shared/dupes'
import { photoUrl, type EmbedResult, type RelBox } from '@shared/ipc'

/**
 * Unsichtbares Analyse-Fenster: holt sich Fotos aus der Warteschlange des Main-Prozesses,
 * sucht Gesichter (YuNet) und berechnet für jedes einen Merkmalsvektor (SFace).
 * Beantwortet außerdem Hand-Markierungen aus den Einstellungen.
 * Läuft komplett lokal in WebAssembly, ohne Internet.
 */

ort.env.wasm.wasmPaths = { wasm: wasmUrl }
ort.env.wasm.numThreads = 1
ort.env.logLevel = 'error'

/** Kleinere Gesichter (in Pixeln des 640er-Bildes) sind zu unscharf für die Wiedererkennung. */
const MIN_FACE = 12

const detCanvas = new OffscreenCanvas(YUNET_SIZE, YUNET_SIZE)
const detCtx = detCanvas.getContext('2d', { willReadFrequently: true })!
const alignCanvas = new OffscreenCanvas(SFACE_SIZE, SFACE_SIZE)
const alignCtx = alignCanvas.getContext('2d', { willReadFrequently: true })!

interface Models {
  detector: ort.InferenceSession
  recognizer: ort.InferenceSession
}

/** RGBA-Pixel in planare Float-Kanäle (NCHW), wahlweise BGR. */
function toTensor(data: Uint8ClampedArray, size: number, bgr: boolean): ort.Tensor {
  const plane = size * size
  const out = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    out[i] = bgr ? b : r
    out[plane + i] = g
    out[2 * plane + i] = bgr ? r : b
  }
  return new ort.Tensor('float32', out, [1, 3, size, size])
}

// Alle Modellaufrufe nacheinander: Analyse und Hand-Markierungen teilen sich die Modelle.
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  chain = run.catch(() => undefined)
  return run
}

async function loadBitmap(name: string): Promise<ImageBitmap> {
  const response = await fetch(photoUrl(name))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return createImageBitmap(await response.blob(), { imageOrientation: 'from-image' })
}

/**
 * Sucht Gesichter in einem Bildausschnitt (Standard: ganzes Bild). Der Ausschnitt wird
 * ins 640er-Quadrat eingepasst; Ergebnisse kommen in Pixeln des Originalbildes zurück.
 */
async function detect(
  m: Models,
  bitmap: ImageBitmap,
  region: [number, number, number, number] = [0, 0, bitmap.width, bitmap.height],
  minFace = MIN_FACE
): Promise<Detection[]> {
  const [rx, ry, rw, rh] = region
  const scale = Math.min(YUNET_SIZE / rw, YUNET_SIZE / rh)
  detCtx.fillStyle = '#000'
  detCtx.fillRect(0, 0, YUNET_SIZE, YUNET_SIZE)
  detCtx.drawImage(bitmap, rx, ry, rw, rh, 0, 0, rw * scale, rh * scale)
  const pixels = detCtx.getImageData(0, 0, YUNET_SIZE, YUNET_SIZE).data
  const out = await m.detector.run({ input: toTensor(pixels, YUNET_SIZE, true) })
  const outputs: YunetOutputs = {}
  for (const [key, tensor] of Object.entries(out)) outputs[key] = tensor.data as Float32Array
  return decodeYunet(outputs)
    .filter((d) => Math.min(d.box[2], d.box[3]) >= minFace)
    .map((d) => ({
      score: d.score,
      box: [d.box[0] / scale + rx, d.box[1] / scale + ry, d.box[2] / scale, d.box[3] / scale],
      kps: d.kps.map((v, i) => v / scale + (i % 2 === 0 ? rx : ry))
    }))
}

/** Merkmalsvektor eines Gesichts: auf die SFace-Vorlage ausrichten und einlesen. */
async function embed(m: Models, bitmap: ImageBitmap, kps: number[]): Promise<string> {
  const [a, b, tx, ty] = similarityTransform(kps, SFACE_TEMPLATE)
  alignCtx.setTransform(1, 0, 0, 1, 0, 0)
  alignCtx.fillStyle = '#000'
  alignCtx.fillRect(0, 0, SFACE_SIZE, SFACE_SIZE)
  alignCtx.setTransform(a, b, -b, a, tx, ty)
  alignCtx.drawImage(bitmap, 0, 0)
  const face = alignCtx.getImageData(0, 0, SFACE_SIZE, SFACE_SIZE).data
  const rec = await m.recognizer.run({ data: toTensor(face, SFACE_SIZE, false) })
  return encodeEmbedding(normalize(rec.fc1.data as Float32Array))
}

/** Gesicht in Pixeln → Speicherformat relativ zur Bildgröße. */
function toStored(d: Detection, w: number, h: number, emb: string): StoredFace {
  return {
    box: [d.box[0] / w, d.box[1] / h, d.box[2] / w, d.box[3] / h],
    kps: d.kps.map((v, i) => (i % 2 === 0 ? v / w : v / h)),
    score: Math.round(d.score * 1000) / 1000,
    emb
  }
}

// Wahrnehmungs-Hash für die Dublettenprüfung: erst auf höchstens 128 px (gute Filterung),
// dann auf 32 × 32 Graustufen.
const hashStep = new OffscreenCanvas(1, 1)
const hashStepCtx = hashStep.getContext('2d')!
const hashSmall = new OffscreenCanvas(HASH_SIZE, HASH_SIZE)
const hashSmallCtx = hashSmall.getContext('2d', { willReadFrequently: true })!

function phashOf(bitmap: ImageBitmap): string {
  const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height))
  hashStep.width = Math.max(1, Math.round(bitmap.width * scale))
  hashStep.height = Math.max(1, Math.round(bitmap.height * scale))
  hashStepCtx.imageSmoothingQuality = 'high'
  hashStepCtx.drawImage(bitmap, 0, 0, hashStep.width, hashStep.height)
  hashSmallCtx.imageSmoothingQuality = 'medium'
  hashSmallCtx.drawImage(hashStep, 0, 0, HASH_SIZE, HASH_SIZE)
  return phashFromGray(grayFromRgba(hashSmallCtx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data))
}

async function analyze(m: Models, name: string): Promise<PhotoFaces> {
  const bitmap = await loadBitmap(name)
  try {
    const faces: StoredFace[] = []
    for (const d of await detect(m, bitmap)) {
      faces.push(toStored(d, bitmap.width, bitmap.height, await embed(m, bitmap, d.kps)))
    }
    return { w: bitmap.width, h: bitmap.height, faces, phash: phashOf(bitmap) }
  } finally {
    bitmap.close()
  }
}

/** Nur den Hash (für schon analysierte Fotos). */
async function hashOnly(name: string): Promise<{ phash: string; w: number; h: number }> {
  const bitmap = await loadBitmap(name)
  try {
    return { phash: phashOf(bitmap), w: bitmap.width, h: bitmap.height }
  } finally {
    bitmap.close()
  }
}

/**
 * Hand-Markierung: im vergrößerten Ausschnitt um den Rahmen nach dem Gesicht suchen
 * (findet oft auch kleine Gesichter); sonst Punkte aus dem Rahmen schätzen.
 */
async function analyzeBox(m: Models, name: string, rel: RelBox): Promise<EmbedResult> {
  const bitmap = await loadBitmap(name)
  try {
    const w = bitmap.width
    const h = bitmap.height
    const box: [number, number, number, number] = [rel[0] * w, rel[1] * h, rel[2] * w, rel[3] * h]
    const padX = box[2] * 0.6
    const padY = box[3] * 0.6
    const x0 = Math.max(0, box[0] - padX)
    const y0 = Math.max(0, box[1] - padY)
    const x1 = Math.min(w, box[0] + box[2] + padX)
    const y1 = Math.min(h, box[1] + box[3] + padY)
    const found = await detect(m, bitmap, [x0, y0, x1 - x0, y1 - y0], 4)
    // Gesicht, dessen Mitte im Rahmen liegt; bei mehreren das größte.
    const inside = found.filter((d) => {
      const cx = d.box[0] + d.box[2] / 2
      const cy = d.box[1] + d.box[3] / 2
      return cx >= box[0] && cx <= box[0] + box[2] && cy >= box[1] && cy <= box[1] + box[3]
    })
    inside.sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])
    const face: Detection = inside[0] ?? { box, kps: templateKeypoints(box), score: 0 }
    console.info(
      `${name}: Hand-Markierung ${inside[0] ? 'mit erkanntem Gesicht' : 'mit geschätzten Punkten'}`
    )
    return { face: toStored(face, w, h, await embed(m, bitmap, face.kps)), w, h }
  } finally {
    bitmap.close()
  }
}

function waitForWake(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const off = window.api.onFaceWake(() => {
      clearTimeout(timer)
      off()
      resolve()
    })
    const timer = setTimeout(() => {
      off()
      resolve()
    }, ms)
  })
}

async function loadModels(): Promise<Models> {
  const [det, rec] = await Promise.all([
    window.api.faceModel('yunet'),
    window.api.faceModel('sface')
  ])
  const options = { executionProviders: ['wasm'], logSeverityLevel: 3 as const }
  return {
    detector: await ort.InferenceSession.create(det, options),
    recognizer: await ort.InferenceSession.create(rec, options)
  }
}

// Vorschaubilder für die Galerie der Fernbedienung: nacheinander, unabhängig von der Analyse.
let thumbChain: Promise<unknown> = Promise.resolve()
const thumbCanvas = new OffscreenCanvas(1, 1)
const thumbCtx = thumbCanvas.getContext('2d')!

async function makeThumb(name: string, size: number): Promise<Uint8Array> {
  const bitmap = await loadBitmap(name)
  try {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
    thumbCanvas.width = Math.max(1, Math.round(bitmap.width * scale))
    thumbCanvas.height = Math.max(1, Math.round(bitmap.height * scale))
    thumbCtx.imageSmoothingQuality = 'high'
    thumbCtx.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height)
    const blob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.78 })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

async function main(): Promise<void> {
  window.api.onThumbRequest((req) => {
    const run = thumbChain.then(() => makeThumb(req.name, req.height))
    thumbChain = run.catch(() => undefined)
    run
      .then((data) => window.api.thumbResult(req.requestId, data))
      .catch(() => window.api.thumbResult(req.requestId, null))
  })

  const ready = loadModels()

  // Hand-Markierungen werden zwischen zwei Fotos der laufenden Analyse beantwortet.
  window.api.onEmbedRequest((req) => {
    ready
      .then((m) => serial(() => analyzeBox(m, req.name, req.box)))
      .then((result) => window.api.embedResult(req.requestId, result))
      .catch((err) => window.api.embedResult(req.requestId, null, String(err)))
  })

  let models: Models
  try {
    models = await ready
  } catch (err) {
    console.error('Gesichtserkennung nicht verfügbar:', err)
    return
  }
  console.info('Gesichtserkennung bereit')

  for (;;) {
    const job = await window.api.faceJob()
    if (!job) {
      await waitForWake(30_000)
      continue
    }
    const started = performance.now()
    if (job.kind === 'hash') {
      try {
        const r = await serial(() => hashOnly(job.name))
        await window.api.hashResult(job.name, r.phash, r.w, r.h)
      } catch {
        await window.api.hashResult(job.name, null, 0, 0)
      }
      continue
    }
    try {
      const result = await serial(() => analyze(models, job.name))
      await window.api.faceResult(job.name, result)
      console.info(
        `${job.name}: ${result.faces.length} Gesicht(er), ${Math.round(performance.now() - started)} ms`
      )
    } catch (err) {
      await window.api.faceResult(job.name, null, String(err))
    }
  }
}

void main()
