import { pick, shuffle, type Range, type Rng } from '@shared/random'
import type { TextItem } from '@shared/text'
import type { Playlist } from './playlist'

export type Entry =
  /** Foto; `queueId` ist gesetzt, wenn es aus der manuellen Reihenfolge der Fernbedienung kommt. */
  | { kind: 'photo'; name: string; overlays: TextItem[]; queueId?: string }
  /** Textfolie; `ref` ist das Foto, dessen Unschärfe den Hintergrund bildet. */
  | { kind: 'text'; item: TextItem; ref?: string }
  /** Zwischenspiel 3D-Fotowelt (wird von der Show eingeschoben, nicht vom Sequencer). */
  | { kind: 'world' }

/**
 * Legt die Reihenfolge der Show fest: Fotos aus der Playlist, dazwischen Fülltexte
 * und an Fotos gebundene Texte (vor, nach oder über dem Foto).
 */
export class Sequencer {
  private pending: Entry[] = []
  private fillers: TextItem[] = []
  private fillerQueue: TextItem[] = []
  private byPhoto = new Map<string, TextItem[]>()
  private sinceFiller = 0
  private fillerAt = Infinity
  private lastPhoto: string | undefined

  constructor(
    private readonly playlist: Playlist,
    private fillerEvery: Range,
    private readonly rng: Rng = Math.random
  ) {}

  setTexts(texts: TextItem[], fillerEvery: Range): void {
    const active = texts.filter((t) => t.enabled && t.text.trim())
    this.fillers = active.filter((t) => t.kind === 'filler')
    const known = new Set(this.fillers.map((t) => t.id))
    this.fillerQueue = this.fillerQueue.filter((t) => known.has(t.id))
    this.byPhoto = new Map()
    for (const t of active) {
      if (t.kind !== 'photo') continue
      for (const name of t.photos) {
        const list = this.byPhoto.get(name) ?? []
        list.push(t)
        this.byPhoto.set(name, list)
      }
    }
    const rangeChanged =
      fillerEvery.min !== this.fillerEvery.min ||
      fillerEvery.max !== this.fillerEvery.max ||
      fillerEvery.mode !== this.fillerEvery.mode
    this.fillerEvery = fillerEvery
    if (rangeChanged || this.fillerAt === Infinity) this.planFiller()
  }

  private planFiller(): void {
    this.fillerAt = this.fillers.length
      ? Math.max(1, Math.round(pick(this.fillerEvery, this.rng)))
      : Infinity
  }

  private lastFiller: string | undefined

  private nextFiller(): TextItem {
    if (this.fillerQueue.length === 0) {
      this.fillerQueue = shuffle(this.fillers, this.rng)
      // Den zuletzt gezeigten Text nicht direkt wiederholen.
      if (this.fillerQueue.length > 1 && this.fillerQueue[0].id === this.lastFiller) {
        this.fillerQueue.push(this.fillerQueue.shift()!)
      }
    }
    const item = this.fillerQueue.shift()!
    this.lastFiller = item.id
    return item
  }

  /** Einträge für ein Foto: Texte davor, das Foto (mit Texten darüber), Texte danach. */
  private photoEntries(name: string, withBeforeAfter: boolean): Entry[] {
    const linked = this.byPhoto.get(name) ?? []
    const photo: Entry = {
      kind: 'photo',
      name,
      overlays: linked.filter((t) => t.placement === 'over')
    }
    if (!withBeforeAfter) return [photo]
    const text = (t: TextItem): Entry => ({ kind: 'text', item: t, ref: name })
    return [
      ...linked.filter((t) => t.placement === 'before').map(text),
      photo,
      ...linked.filter((t) => t.placement === 'after').map(text)
    ]
  }

  next(): Entry | undefined {
    const queued = this.pending.shift()
    if (queued) return queued

    if (this.fillers.length && this.sinceFiller >= this.fillerAt) {
      this.sinceFiller = 0
      this.planFiller()
      return { kind: 'text', item: this.nextFiller(), ref: this.lastPhoto }
    }

    const name = this.playlist.next()
    if (!name) {
      // Ohne Fotos laufen nur die Fülltexte.
      return this.fillers.length
        ? { kind: 'text', item: this.nextFiller(), ref: undefined }
        : undefined
    }
    this.sinceFiller++
    this.lastPhoto = name
    const [first, ...rest] = this.photoEntries(name, true)
    this.pending = rest
    return first
  }

  /** Ein bestimmtes Foto als Nächstes zeigen (z. B. das Zielfoto der 3D-Fotowelt). */
  insertNext(name: string): void {
    this.lastPhoto = name
    this.pending.unshift(this.photoEntries(name, false)[0])
  }

  /** Zurück zum Foto vor `current`; Texte davor und danach werden dabei übersprungen. */
  back(current: string): Entry | undefined {
    const name = this.playlist.before(current)
    if (!name) return undefined
    this.pending = []
    this.lastPhoto = name
    return this.photoEntries(name, false)[0]
  }
}
