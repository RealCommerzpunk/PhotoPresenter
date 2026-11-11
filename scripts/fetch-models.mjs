// Lädt die Modelle für die Gesichtserkennung aus dem OpenCV Model Zoo nach resources/models.
// YuNet (Gesichter finden, MIT) und SFace (Gesichter wiedererkennen, Apache 2.0).
// Aufruf: npm run models
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'resources', 'models')

const BASE = 'https://github.com/opencv/opencv_zoo/raw/main/models'
const MODELS = [
  {
    file: 'face_detection_yunet_2023mar.onnx',
    url: `${BASE}/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
    sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'
  },
  {
    file: 'face_recognition_sface_2021dec.onnx',
    url: `${BASE}/face_recognition_sface/face_recognition_sface_2021dec.onnx`,
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79'
  }
]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

mkdirSync(dir, { recursive: true })
for (const m of MODELS) {
  const target = join(dir, m.file)
  if (existsSync(target) && (!m.sha256 || sha256(readFileSync(target)) === m.sha256)) {
    console.log(`vorhanden: ${m.file}`)
    continue
  }
  console.log(`lade ${m.file} …`)
  const res = await fetch(m.url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  // Git-LFS liefert bei Fehlern eine kleine Textdatei statt des Modells.
  if (buf.length < 100_000 && buf.toString('utf8', 0, 40).includes('git-lfs')) {
    throw new Error(`${m.file}: Git-LFS-Verweis statt Modell erhalten`)
  }
  const hash = sha256(buf)
  if (m.sha256 && hash !== m.sha256) throw new Error(`${m.file}: Prüfsumme stimmt nicht (${hash})`)
  writeFileSync(target, buf)
  console.log(`  ${(buf.length / 1e6).toFixed(1)} MB, sha256 ${hash}`)
}
