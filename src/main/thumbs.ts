import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RelBox, ThumbRequest } from '@shared/ipc'
import { resolvePhoto } from './photos'

/** Kantenlänge der Vorschaubilder (passt in 256 × 256, Seitenverhältnis bleibt). */
export const THUMB_SIZE = 256
/** Kantenlänge der Gesichts-Vorschauen (Kachel 92 px, doppelt für hochauflösende Bildschirme). */
const FACE_THUMB_SIZE = 192
const TIMEOUT_MS = 30_000

/**
 * Vorschaubilder für die Galerie der Fernbedienung. Das Analyse-Fenster rechnet sie aus
 * (Chromium dekodiert dort schnell und mit EXIF-Drehung); danach liegen sie im Cache auf
 * der Platte, Schlüssel aus Pfad, Größe und Änderungszeit.
 */
export class ThumbCache {
  private nextId = 1
  private pending = new Map<number, (data: Uint8Array | null) => void>()
  private inflight = new Map<string, Promise<Buffer | null>>()

  constructor(
    private readonly dir: () => string,
    /** Auftrag ans Analyse-Fenster schicken; false, wenn es (noch) nicht läuft. */
    private readonly send: (request: ThumbRequest) => boolean
  ) {}

  /** Vorschaubild eines Fotos; mit `face` ein quadratischer Ausschnitt um dieses Gesicht. */
  async get(name: string, face?: RelBox): Promise<Buffer | null> {
    const abs = resolvePhoto(name)
    if (!abs) return null
    let key: string
    try {
      const st = await stat(abs)
      const crop = face ? `|face:${face.join(',')}` : ''
      key = createHash('sha1').update(`${abs}|${st.size}|${st.mtimeMs}${crop}`).digest('hex')
    } catch {
      return null
    }
    const file = join(this.dir(), key.slice(0, 2), `${key}.jpg`)
    try {
      return await readFile(file)
    } catch {
      // noch nicht im Cache
    }
    let job = this.inflight.get(key)
    if (!job) {
      job = this.create(name, file, face).finally(() => this.inflight.delete(key))
      this.inflight.set(key, job)
    }
    return job
  }

  private async create(name: string, file: string, face?: RelBox): Promise<Buffer | null> {
    const data = await this.ask(name, face)
    if (!data) return null
    const buffer = Buffer.from(data)
    try {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, buffer)
    } catch {
      // Cache nicht schreibbar: Bild trotzdem ausliefern.
    }
    return buffer
  }

  private ask(name: string, face?: RelBox): Promise<Uint8Array | null> {
    const requestId = this.nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), TIMEOUT_MS)
      const finish = (data: Uint8Array | null): void => {
        clearTimeout(timer)
        this.pending.delete(requestId)
        resolve(data)
      }
      this.pending.set(requestId, finish)
      const request: ThumbRequest = face
        ? { requestId, name, height: FACE_THUMB_SIZE, face }
        : { requestId, name, height: THUMB_SIZE }
      if (!this.send(request)) finish(null)
    })
  }

  /** Antwort des Analyse-Fensters. */
  handleResult(requestId: number, data: Uint8Array | null): void {
    this.pending.get(requestId)?.(data)
  }
}
