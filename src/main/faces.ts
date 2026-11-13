import { t } from '@shared/i18n'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import {
  decodeEmbedding,
  iou,
  matchFace,
  type FaceIndexStatus,
  type FaceInfo,
  type MatchResult,
  type PhotoFaces
} from '@shared/faces'
import type {
  DuplicateInfo,
  EmbedRequest,
  EmbedResult,
  FaceJob,
  FaceListItem,
  FaceModel,
  RelBox
} from '@shared/ipc'
import type { FaceSample, Person, Settings } from '@shared/settings'
import { findDuplicates, type DuplicateGroup } from '@shared/dupes'
import { fileFingerprint, parseIndex, sameFile, serializeIndex } from './faceIndexFile'
import { listPhotos } from './photos'
import { loadSettings, photoFolder } from './settings'

/** Ein Eintrag im Index; Schlüssel ist der absolute Pfad (in der Datei relativ, siehe faceIndexFile). */
interface Entry extends PhotoFaces {
  mtime: number
  size: number
  /** Fingerabdruck des Inhalts (`fileFingerprint`): erkennt Fotos auch bei neuer Änderungszeit. */
  hash?: string
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
  /** Schon analysierte Fotos, denen nur noch der Hash für die Dublettenprüfung fehlt. */
  private hashQueue: string[] = []
  /** Fotos des letzten Einlesens (relativ), für die Dublettenprüfung. */
  private files = new Set<string>()
  private dupeCache: DuplicateGroup[] | null = null
  private total = 0
  /** Ordner des letzten Einlesens; Ergebnisse der Analyse gehören zu ihm. */
  private scanFolder = ''
  private error: string | undefined
  private saveTimer: NodeJS.Timeout | null = null
  private statusTimer: NodeJS.Timeout | null = null
  private scanning: Promise<void> | null = null
  private vectorCache = new Map<string, { key: string; vectors: Float32Array[] }>()
  private nextRequest = 1
  private pending = new Map<number, (r: EmbedResult | null, error?: string) => void>()

  constructor(
    private readonly broadcastStatus: (status: FaceIndexStatus) => void,
    private readonly wakeIndexer: () => void,
    private readonly showRunning: () => boolean,
    private readonly saveSettings: (patch: Partial<Settings>) => void,
    private readonly requestEmbed: (request: EmbedRequest) => void
  ) {
    try {
      // Relative Einträge gehören zum aktuellen Fotoordner (Index reist mit den Fotos mit).
      this.index = parseIndex<Entry>(JSON.parse(readFileSync(this.file, 'utf8')), photoFolder())
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
      this.error = t('main.modelsMissing')
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
    const hashes: string[] = []
    let changed = false
    this.files = new Set(list.files)
    this.dupeCache = null
    for (const name of list.files) {
      const abs = resolve(list.folder, name)
      const entry = this.index.get(abs)
      if (!entry) {
        pending.push(name)
        continue
      }
      try {
        const st = await stat(abs)
        if (sameFile(entry, st)) {
          // Ältere Einträge bekommen ihren Fingerabdruck nachträglich.
          if (!entry.hash) {
            entry.hash = await fileFingerprint(abs)
            changed = true
          }
          if (!entry.phash) hashes.push(name)
        } else if (
          entry.hash &&
          entry.size === st.size &&
          (await fileFingerprint(abs)) === entry.hash
        ) {
          // Gleicher Inhalt, nur neue Änderungszeit (git clone, entpackte ZIP): nicht neu analysieren.
          entry.mtime = st.mtimeMs
          changed = true
          if (!entry.phash) hashes.push(name)
        } else pending.push(name)
      } catch {
        // Datei verschwunden: beim nächsten Einlesen fällt sie aus der Liste.
      }
    }
    if (changed) this.scheduleSave()
    this.queue = pending
    this.hashQueue = hashes
    this.emitStatus()
    if (pending.length || hashes.length) this.wakeIndexer()
  }

  /** Alle Fotos neu analysieren; von Hand markierte Gesichter bleiben erhalten. */
  async reindex(): Promise<void> {
    await this.rescan()
    this.queue = (await listPhotos()).files
    this.emitStatus()
    this.wakeIndexer()
  }

  /**
   * Nächster Auftrag für das Analyse-Fenster; während der Show gedrosselt. Fehlende Hashes
   * zuerst (schnell, damit die Dublettenprüfung bald vollständig ist), dann Gesichter.
   */
  async nextJob(): Promise<FaceJob | null> {
    if (this.scanning) await this.scanning
    if (this.showRunning())
      await new Promise((r) => setTimeout(r, this.hashQueue.length ? 300 : 1500))
    const hash = this.hashQueue.shift()
    if (hash) return { name: hash, kind: 'hash' }
    const name = this.queue.shift()
    this.emitStatus()
    return name ? { name, kind: 'faces' } : null
  }

  /** Nur der Hash eines schon analysierten Fotos. */
  storeHash(name: string, phash: string | null, w: number, h: number): void {
    const entry = this.index.get(resolve(this.scanFolder, name))
    if (!entry || !phash) return
    entry.phash = phash
    if (!entry.w || !entry.h) {
      entry.w = w
      entry.h = h
    }
    this.dupeCache = null
    this.scheduleSave()
    this.emitStatus()
  }

  /** Gruppen doppelter Fotos im aktuellen Ordner (nur Fotos des letzten Einlesens). */
  duplicates(): DuplicateGroup[] {
    if (this.dupeCache) return this.dupeCache
    const photos = this.entriesInFolder()
      .map(([abs, e]) => ({
        name: this.relative(abs),
        phash: e.phash ?? '',
        w: e.w,
        h: e.h,
        size: e.size
      }))
      .filter((p) => p.phash && this.files.has(p.name))
    this.dupeCache = findDuplicates(photos)
    return this.dupeCache
  }

  /** Stand der Dublettenprüfung für die Einstellungen. */
  duplicateInfo(): DuplicateInfo {
    const checked = this.entriesInFolder().filter(
      ([abs, e]) => e.phash && this.files.has(this.relative(abs))
    ).length
    return { groups: this.duplicates(), checked, total: this.files.size }
  }

  /** Die schwächeren Fassungen aller Gruppen (relativ zum Fotoordner). */
  duplicateNames(): string[] {
    return this.duplicates().flatMap((g) => g.others.map((p) => p.name))
  }

  async storeResult(name: string, result: PhotoFaces | null, error?: string): Promise<void> {
    if (error) console.warn(`Gesichter in ${name} nicht analysiert:`, error)
    const abs = resolve(this.scanFolder, name)
    try {
      const st = await stat(abs)
      const hash = await fileFingerprint(abs)
      // Von Hand markierte Gesichter bleiben, solange sich die Datei nicht geändert hat.
      const old = this.index.get(abs)
      const unchanged = old && (sameFile(old, st) || (old.size === st.size && old.hash === hash))
      const manual = unchanged ? old.faces.filter((f) => f.manual) : []
      // Auch bei Fehlern eintragen (ohne Gesichter), damit das Foto nicht endlos wiederkommt.
      const base = result ?? { w: old?.w ?? 0, h: old?.h ?? 0, faces: [] }
      this.dupeCache = null
      this.index.set(abs, {
        mtime: st.mtimeMs,
        size: st.size,
        hash,
        phash: result?.phash ?? (unchanged ? old?.phash : undefined),
        w: base.w,
        h: base.h,
        faces: [...base.faces, ...manual]
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
    const data = serializeIndex(this.index, this.folder)
    try {
      await mkdir(app.getPath('userData'), { recursive: true })
      await writeFile(`${this.file}.tmp`, JSON.stringify(data))
      await rename(`${this.file}.tmp`, this.file)
    } catch (err) {
      console.error('Gesichtsindex konnte nicht gespeichert werden:', err)
    }
  }

  /** Index für ein Weitergabe-Paket schreiben (Pfade relativ zum Fotoordner). */
  async exportTo(file: string): Promise<void> {
    await writeFile(file, JSON.stringify(serializeIndex(this.index, this.folder, true)))
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
    return photoFolder()
  }

  private entriesInFolder(): [string, Entry][] {
    const prefix = resolve(this.folder) + (process.platform === 'win32' ? '\\' : '/')
    return this.folder ? [...this.index].filter(([k]) => k.startsWith(prefix)) : []
  }

  private relative(abs: string): string {
    return abs.slice(resolve(this.folder).length + 1)
  }

  /** Merkmalsvektoren einer Liste, zwischengespeichert bis sie sich ändert. */
  private vectors(cacheKey: string, list: FaceSample[] | undefined): Float32Array[] {
    if (!list?.length) return []
    const key = list.map((s) => s.emb.slice(0, 16)).join('|')
    const cached = this.vectorCache.get(cacheKey)
    if (cached?.key === key) return cached.vectors
    const vectors = list.map((s) => decodeEmbedding(s.emb))
    this.vectorCache.set(cacheKey, { key, vectors })
    return vectors
  }

  /** Abgleichfunktion für eine Person (Beispiele, Gegenbeispiele, Schwelle). */
  private matcher(
    person: Person | undefined,
    threshold: number
  ): ((emb: string) => MatchResult) | null {
    if (!person) return null
    const pos = this.vectors(`${person.id}:+`, person.samples)
    const neg = this.vectors(`${person.id}:-`, person.negatives)
    return (emb) => matchFace(decodeEmbedding(emb), pos, neg, threshold)
  }

  private focusPerson(settings: Settings): Person | undefined {
    if (!settings.focusEnabled) return undefined
    return settings.persons.find((p) => p.id === settings.focusPersonId && p.samples.length)
  }

  /** Gesichter eines Fotos; der beste Treffer der Fokus-Person ist markiert. */
  getFaces(name: string): FaceInfo | null {
    const entry = this.index.get(resolve(this.folder, name))
    if (!entry || !entry.faces.length) return null
    const settings = loadSettings()
    const match = this.matcher(this.focusPerson(settings), settings.focusThreshold)
    const results = entry.faces.map((f) => match?.(f.emb))
    let best = -1
    results.forEach((r, i) => {
      if (r?.match && (best < 0 || r.similarity > results[best]!.similarity)) best = i
    })
    // Fokus-Partner: bester Treffer unter den übrigen Gesichtern (nur mit „Gemeinsam“).
    let partner = -1
    const partnerPerson = this.partnerPerson(settings)
    if (best >= 0 && partnerPerson) {
      const matchPartner = this.matcher(partnerPerson, settings.focusThreshold)!
      const partnerResults = entry.faces.map((f) => matchPartner(f.emb))
      partnerResults.forEach((r, i) => {
        if (i === best || !r.match) return
        if (partner < 0 || r.similarity > partnerResults[partner].similarity) partner = i
      })
    }
    const faces = entry.faces.map((f, i) => ({
      box: f.box,
      kps: f.kps,
      score: f.score,
      similarity: results[i]?.similarity,
      focus: i === best,
      partner: i === partner
    }))
    return { w: entry.w, h: entry.h, faces }
  }

  private partnerPerson(settings: Settings): Person | undefined {
    if (!settings.focusEnabled || !settings.focusTogether) return undefined
    if (settings.focusPartnerId === settings.focusPersonId) return undefined
    return settings.persons.find((p) => p.id === settings.focusPartnerId && p.samples.length)
  }

  /** Fotos, in denen die Fokus-Person erkannt wurde. */
  focusPhotos(): string[] {
    const settings = loadSettings()
    const match = this.matcher(this.focusPerson(settings), settings.focusThreshold)
    if (!match) return []
    return this.entriesInFolder()
      .filter(([, e]) => e.faces.some((f) => match(f.emb).match))
      .map(([k]) => this.relative(k))
  }

  /** Gesichter des Ordners (oder eines Fotos) für die Galerie, nach Ähnlichkeit sortiert. */
  listFaces(personId?: string, photo?: string): FaceListItem[] {
    const settings = loadSettings()
    const person = settings.persons.find((p) => p.id === personId)
    const match = this.matcher(person, settings.focusThreshold)
    const samples = new Set(person?.samples.map((s) => s.emb))
    const negatives = new Set(person?.negatives.map((s) => s.emb))
    let entries: [string, Entry][]
    if (photo) {
      const abs = resolve(this.folder, photo)
      const entry = this.index.get(abs)
      entries = entry ? [[abs, entry]] : []
    } else {
      entries = this.entriesInFolder()
    }
    const items: FaceListItem[] = []
    for (const [abs, e] of entries) {
      const rel = this.relative(abs)
      e.faces.forEach((f, face) => {
        const r = match?.(f.emb)
        items.push({
          photo: rel,
          face,
          box: f.box,
          w: e.w,
          h: e.h,
          similarity: r && r.similarity >= 0 ? r.similarity : undefined,
          sample: samples.has(f.emb),
          negative: negatives.has(f.emb),
          match: r?.match ?? false,
          manual: !!f.manual
        })
      })
    }
    if (person?.samples.length && !photo) {
      items.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    }
    return items
  }

  private faceAt(photo: string, face: number): FaceSample | null {
    const stored = this.index.get(resolve(this.folder, photo))?.faces[face]
    return stored ? { photo, face, emb: stored.emb } : null
  }

  /**
   * Gesicht als Beispiel (negative = false) oder Gegenbeispiel einer Person setzen bzw.
   * wieder entfernen. Ein Gesicht ist nie beides zugleich. Erkannt wird es am
   * Merkmalsvektor, damit ein Neu-Analysieren die Zuordnung nicht verschiebt.
   */
  private toggle(personId: string, sample: FaceSample | null, negative: boolean): void {
    if (!sample) return
    const settings = loadSettings()
    const persons = settings.persons.map((p) => {
      if (p.id !== personId) return p
      const own = negative ? p.negatives : p.samples
      const other = negative ? p.samples : p.negatives
      const has = own.some((s) => s.emb === sample.emb)
      const nextOwn = has ? own.filter((s) => s.emb !== sample.emb) : [...own, sample]
      const nextOther = other.filter((s) => s.emb !== sample.emb)
      return negative
        ? { ...p, negatives: nextOwn, samples: nextOther }
        : { ...p, samples: nextOwn, negatives: nextOther }
    })
    this.saveSettings({ persons })
  }

  toggleSample(personId: string, photo: string, face: number): void {
    this.toggle(personId, this.faceAt(photo, face), false)
  }

  toggleNegative(personId: string, photo: string, face: number): void {
    this.toggle(personId, this.faceAt(photo, face), true)
  }

  /** Antwort des Analyse-Fensters auf eine Hand-Markierung. */
  handleEmbedResult(requestId: number, result: EmbedResult | null, error?: string): void {
    this.pending.get(requestId)?.(result, error)
    this.pending.delete(requestId)
  }

  /** Gesicht von Hand markieren: Merkmalsvektor berechnen, in den Index und zur Person. */
  async markFace(
    personId: string,
    photo: string,
    box: RelBox,
    negative: boolean
  ): Promise<{ ok: boolean; error?: string }> {
    const requestId = this.nextRequest++
    const answer = new Promise<{ result: EmbedResult | null; error?: string }>((done) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        done({ result: null, error: 'Die Gesichtserkennung antwortet nicht.' })
      }, 60_000)
      this.pending.set(requestId, (result, error) => {
        clearTimeout(timer)
        done({ result, error })
      })
    })
    this.requestEmbed({ requestId, name: photo, box })
    const { result, error } = await answer
    if (!result) return { ok: false, error: error ?? 'Kein Ergebnis.' }

    const abs = resolve(this.folder, photo)
    let entry = this.index.get(abs)
    if (!entry) {
      const st = await stat(abs)
      entry = { mtime: st.mtimeMs, size: st.size, w: result.w, h: result.h, faces: [] }
      this.index.set(abs, entry)
    }
    // Liegt dort schon ein erkanntes Gesicht, wird es durch die genauere Fassung aus dem
    // vergrößerten Ausschnitt ersetzt statt doppelt angelegt.
    const fresh = { ...result.face, manual: true }
    const existing = entry.faces.findIndex((f) => iou(f.box, fresh.box) > 0.5)
    let faceIndex: number
    if (existing >= 0) {
      this.replaceEmbedding(entry.faces[existing].emb, fresh.emb, existing)
      entry.faces[existing] = fresh
      faceIndex = existing
    } else {
      entry.faces.push(fresh)
      faceIndex = entry.faces.length - 1
    }
    this.scheduleSave()
    this.emitStatus()
    this.assign(personId, { photo, face: faceIndex, emb: fresh.emb }, negative)
    return { ok: true }
  }

  /** Zuordnungen aller Personen von einem alten auf einen neuen Merkmalsvektor umstellen. */
  private replaceEmbedding(oldEmb: string, newEmb: string, face: number): void {
    const settings = loadSettings()
    const swap = (list: FaceSample[]): FaceSample[] =>
      list.map((s) => (s.emb === oldEmb ? { ...s, face, emb: newEmb } : s))
    const persons = settings.persons.map((p) => ({
      ...p,
      samples: swap(p.samples),
      negatives: swap(p.negatives)
    }))
    this.saveSettings({ persons })
  }

  /** Gesicht fest als Beispiel bzw. Gegenbeispiel setzen (nicht umschalten). */
  private assign(personId: string, sample: FaceSample, negative: boolean): void {
    const settings = loadSettings()
    const persons = settings.persons.map((p) => {
      if (p.id !== personId) return p
      const without = (list: FaceSample[]): FaceSample[] => list.filter((s) => s.emb !== sample.emb)
      return negative
        ? { ...p, negatives: [...without(p.negatives), sample], samples: without(p.samples) }
        : { ...p, samples: [...without(p.samples), sample], negatives: without(p.negatives) }
    })
    this.saveSettings({ persons })
  }
}
