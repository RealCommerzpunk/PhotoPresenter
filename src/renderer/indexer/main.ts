import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import {
  decodeYunet,
  encodeEmbedding,
  normalize,
  SFACE_SIZE,
  SFACE_TEMPLATE,
  similarityTransform,
  YUNET_SIZE,
  type PhotoFaces,
  type StoredFace,
  type YunetOutputs
} from '@shared/faces'
import { photoUrl } from '@shared/ipc'

/**
 * Unsichtbares Analyse-Fenster: holt sich Fotos aus der Warteschlange des Main-Prozesses,
 * sucht Gesichter (YuNet) und berechnet für jedes einen Merkmalsvektor (SFace).
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

async function analyze(
  detector: ort.InferenceSession,
  recognizer: ort.InferenceSession,
  name: string
): Promise<PhotoFaces> {
  const response = await fetch(photoUrl(name))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'from-image' })
  try {
    const w = bitmap.width
    const h = bitmap.height
    // Ins 640er-Quadrat einpassen (oben links, Rest schwarz).
    const scale = Math.min(YUNET_SIZE / w, YUNET_SIZE / h)
    detCtx.fillStyle = '#000'
    detCtx.fillRect(0, 0, YUNET_SIZE, YUNET_SIZE)
    detCtx.drawImage(bitmap, 0, 0, w * scale, h * scale)
    const pixels = detCtx.getImageData(0, 0, YUNET_SIZE, YUNET_SIZE).data
    const out = await detector.run({ input: toTensor(pixels, YUNET_SIZE, true) })
    const outputs: YunetOutputs = {}
    for (const [key, tensor] of Object.entries(out)) outputs[key] = tensor.data as Float32Array

    const faces: StoredFace[] = []
    for (const d of decodeYunet(outputs)) {
      if (Math.min(d.box[2], d.box[3]) < MIN_FACE) continue
      // Punkte in Originalpixel, Gesicht auf die SFace-Vorlage ausrichten.
      const kps = d.kps.map((v) => v / scale)
      const [a, b, tx, ty] = similarityTransform(kps, SFACE_TEMPLATE)
      alignCtx.setTransform(1, 0, 0, 1, 0, 0)
      alignCtx.fillStyle = '#000'
      alignCtx.fillRect(0, 0, SFACE_SIZE, SFACE_SIZE)
      alignCtx.setTransform(a, b, -b, a, tx, ty)
      alignCtx.drawImage(bitmap, 0, 0)
      const face = alignCtx.getImageData(0, 0, SFACE_SIZE, SFACE_SIZE).data
      const rec = await recognizer.run({ data: toTensor(face, SFACE_SIZE, false) })
      const emb = normalize(rec.fc1.data as Float32Array)
      faces.push({
        box: [
          d.box[0] / scale / w,
          d.box[1] / scale / h,
          d.box[2] / scale / w,
          d.box[3] / scale / h
        ],
        kps: kps.map((v, i) => (i % 2 === 0 ? v / w : v / h)),
        score: Math.round(d.score * 1000) / 1000,
        emb: encodeEmbedding(emb)
      })
    }
    return { w, h, faces }
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

async function main(): Promise<void> {
  let detector: ort.InferenceSession
  let recognizer: ort.InferenceSession
  try {
    const [det, rec] = await Promise.all([
      window.api.faceModel('yunet'),
      window.api.faceModel('sface')
    ])
    detector = await ort.InferenceSession.create(det, {
      executionProviders: ['wasm'],
      logSeverityLevel: 3
    })
    recognizer = await ort.InferenceSession.create(rec, {
      executionProviders: ['wasm'],
      logSeverityLevel: 3
    })
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
    try {
      const result = await analyze(detector, recognizer, job.name)
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
