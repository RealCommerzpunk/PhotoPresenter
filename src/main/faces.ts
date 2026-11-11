import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import {
  decodeEmbedding,
  personSimilarity,
  type FaceIndexStatus,
  type FaceInfo,
  type PhotoFaces
} from '@shared/faces'
import type { FaceListItem, FaceModel } from '@shared/ipc'
import type { Person, Settings } from '@shared/settings'
import { listPhotos } from './photos'
import { loadSettings } from './settings'

/** Ein Eintrag im Index; Schlüssel ist der absolute Pfad. */
interface Entry extends PhotoFaces {
  mtime: number
  size: number
}

interface IndexFile {
  version: 1
  photos: Record<string, Entry>
}

const MODEL_FILES: Record<FaceModel, string> = {
  yunet: 'face_detection_yunet_2023mar.onnx',
  sface: 'face_recognition_sface_2021dec.onnx'
}

/**
 * Gesichtsindex: welche Gesichter in welchem Foto sind. Die Analyse selbst läuft im
 * unsichtbaren Analyse-Fenster, das sich hier Aufträge abholt und Ergebnisse abliefert.
 */
export class FaceStore {
  private index = new Map<string, Entry>()
  private queue: string[] = []
  private total = 0
  /** Ordner des letzten Einlesens; Ergebnisse der Analyse gehören zu ihm. */
  private scanFolder = ''
  private error: string | undefined
  private saveTimer: NodeJS.Timeout | null = null
  private statusTimer: NodeJS.Timeout | null = null
  private scanning: Promise<void> | null = null
  private sampleCache = new Map<string, { key: string; vectors: Float32Array[] }>()

  constructor(
    private readonly broadcastStatus: (status: FaceIndexStatus) => void,
    private readonly wakeIndexer: () => void,
    private readonly showRunning: () => boolean,
    private readonly saveSettings: (patch: Partial<Settings>) => void
  ) {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as IndexFile
      if (raw.version === 1) this.index = new Map(Object.entries(raw.photos))
    } catch {
      // Noch kein Index oder unlesbar: neu aufbauen.
    }
  }

  private get file(): string {
    return join(app.getPath('userData'), 'faces.json')
  }

  modelPath(model: FaceModel): string {
    const base = app.isPackaged
      ? join(process.resourcesPath, 'resources', 'models')
      : join(app.getAppPath(), 'resources', 'models')
    return join(base, MODEL_FILES[model])
  }

  async model(model: FaceModel): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.modelPath(model)))
    } catch {
      this.error = 'Modelle für die Gesichtserkennung fehlen (im Projekt: npm run models).'
      this.emitStatus()
      throw new Error(this.error)
    }
  }

  /** Fotoliste neu einlesen und alles Neue oder Geänderte zur Analyse einreihen. */
  rescan(): Promise<void> {
    this.scanning ??= this.doRescan().finally(() => (this.scanning = null))
    return this.scanning
  }

  private async doRescan(): Promise<void> {
    const list = await listPhotos()
    this.scanFolder = list.folder
    this.total = list.files.length
    const pending: string[] = []
    for (const name of list.files) {
      const entry = this.index.get(resolve(list.folder, name))
      if (!entry) {
        pending.push(name)
        continue
      }
      try {
        const st = await stat(resolve(list.folder, name))
        if (st.mtimeMs !== entry.mtime || st.size !== entry.size) pending.push(name)
      } catch {
        // Datei verschwunden: beim nächsten Einlesen fällt sie aus der Liste.
      }
    }
    this.queue = pending
    this.emitStatus()
    if (pending.length) this.wakeIndexer()
  }

  async reindex(): Promise<void> {
    this.index.clear()
    this.scheduleSave()
    await this.rescan()
  }

  /** Nächster Auftrag für das Analyse-Fenster; während der Show gedrosselt. */
  async nextJob(): Promise<{ name: string } | null> {
    if (this.scanning) await this.scanning
    if (this.showRunning()) await new Promise((r) => setTimeout(r, 1500))
    const name = this.queue.shift()
    this.emitStatus()
    return name ? { name } : null
  }

  async storeResult(name: string, result: PhotoFaces | null, error?: string): Promise<void> {
    if (error) console.warn(`Gesichter in ${name} nicht analysiert:`, error)
    const abs = resolve(this.scanFolder, name)
    try {
      const st = await stat(abs)
      // Auch bei Fehlern eintragen (ohne Gesichter), damit das Foto nicht endlos wiederkommt.
      this.index.set(abs, {
        mtime: st.mtimeMs,
        size: st.size,
        ...(result ?? { w: 0, h: 0, faces: [] })
      })
    } catch {
      return
    }
    this.error = undefined
    this.scheduleSave()
    this.emitStatus()
  }

  status(): FaceIndexStatus {
    const inFolder = this.entriesInFolder()
    return {
      total: this.total,
      done: Math.max(0, this.total - this.queue.length),
      faces: inFolder.reduce((n, [, e]) => n + e.faces.length, 0),
      running: this.queue.length > 0,
      error: this.error
    }
  }

  private emitStatus(): void {
    if (this.statusTimer) return
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null
      this.broadcastStatus(this.status())
    }, 300)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.save(), 2000)
  }

  private async save(): Promise<void> {
    const data: IndexFile = { version: 1, photos: Object.fromEntries(this.index) }
    try {
      await mkdir(app.getPath('userData'), { recursive: true })
      await writeFile(`${this.file}.tmp`, JSON.stringify(data))
      await rename(`${this.file}.tmp`, this.file)
    } catch (err) {
      console.error('Gesichtsindex konnte nicht gespeichert werden:', err)
    }
  }

  /** Index sofort schreiben (beim Beenden). */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      void this.save()
    }
  }

  /** Aktueller Fotoordner, direkt aus den Einstellungen (auch bevor das Einlesen fertig ist). */
  private get folder(): string {
    return loadSettings().photoFolder
  }

  private entriesInFolder(): [string, Entry][] {
    const prefix = resolve(this.folder) + (process.platform === 'win32' ? '\\' : '/')
    return this.folder ? [...this.index].filter(([k]) => k.startsWith(prefix)) : []
  }

  private relative(abs: string): string {
    return abs.slice(resolve(this.folder).length + 1)
  }

  /** Merkmalsvektoren einer Person, zwischengespeichert bis sich die Beispiele ändern. */
  private samples(person: Person | undefined): Float32Array[] {
    if (!person) return []
    const key = person.samples.map((s) => s.emb.slice(0, 16)).join('|')
    const cached = this.sampleCache.get(person.id)
    if (cached?.key === key) return cached.vectors
    const vectors = person.samples.map((s) => decodeEmbedding(s.emb))
    this.sampleCache.set(person.id, { key, vectors })
    return vectors
  }

  private focusPerson(settings: Settings): Person | undefined {
    if (!settings.focusEnabled) return undefined
    return settings.persons.find((p) => p.id === settings.focusPersonId && p.samples.length)
  }

  /** Gesichter eines Fotos; das ähnlichste über der Schwelle ist als Fokus markiert. */
  getFaces(name: string): FaceInfo | null {
    const entry = this.index.get(resolve(this.folder, name))
    if (!entry || !entry.faces.length) return null
    const settings = loadSettings()
    const vectors = this.samples(this.focusPerson(settings))
    const faces = entry.faces.map((f) => ({
      box: f.box,
      kps: f.kps,
      score: f.score,
      similarity: vectors.length ? personSimilarity(decodeEmbedding(f.emb), vectors) : undefined,
      focus: false
    }))
    let best = -1
    faces.forEach((f, i) => {
      if ((f.similarity ?? -1) >= settings.focusThreshold) {
        if (best < 0 || f.similarity! > faces[best].similarity!) best = i
      }
    })
    if (best >= 0) faces[best].focus = true
    return { w: entry.w, h: entry.h, faces }
  }

  /** Fotos, in denen die Fokus-Person erkannt wurde. */
  focusPhotos(): string[] {
    const settings = loadSettings()
    const vectors = this.samples(this.focusPerson(settings))
    if (!vectors.length) return []
    return this.entriesInFolder()
      .filter(([, e]) =>
        e.faces.some(
          (f) => personSimilarity(decodeEmbedding(f.emb), vectors) >= settings.focusThreshold
        )
      )
      .map(([k]) => this.relative(k))
  }

  /** Alle Gesichter des Ordners für die Galerie, nach Ähnlichkeit zur Person sortiert. */
  listFaces(personId?: string): FaceListItem[] {
    const settings = loadSettings()
    const person = settings.persons.find((p) => p.id === personId)
    const vectors = this.samples(person)
    const isSample = new Set(person?.samples.map((s) => `${s.photo}#${s.face}`))
    const items: FaceListItem[] = []
    for (const [abs, e] of this.entriesInFolder()) {
      const photo = this.relative(abs)
      e.faces.forEach((f, face) => {
        items.push({
          photo,
          face,
          box: f.box,
          w: e.w,
          h: e.h,
          similarity: vectors.length
            ? personSimilarity(decodeEmbedding(f.emb), vectors)
            : undefined,
          sample: isSample.has(`${photo}#${face}`)
        })
      })
    }
    if (vectors.length) items.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    return items
  }

  /** Gesicht als Beispiel der Person hinzufügen oder wieder entfernen. */
  toggleSample(personId: string, photo: string, face: number): void {
    const settings = loadSettings()
    const entry = this.index.get(resolve(this.folder, photo))
    const stored = entry?.faces[face]
    const persons = settings.persons.map((p) => {
      if (p.id !== personId) return p
      const has = p.samples.some((s) => s.photo === photo && s.face === face)
      if (has)
        return { ...p, samples: p.samples.filter((s) => !(s.photo === photo && s.face === face)) }
      return stored ? { ...p, samples: [...p.samples, { photo, face, emb: stored.emb }] } : p
    })
    this.saveSettings({ persons })
  }
}
