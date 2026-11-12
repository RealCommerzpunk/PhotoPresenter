import type { PhotoQueue, QueueItem, QueueOp } from '@shared/remote'

/** Höchstens so viele Einträge, damit die Liste auf dem Handy handlich bleibt. */
const MAX_ITEMS = 200

/**
 * Manuelle Reihenfolge aus der Galerie der Fernbedienung. Der Eintrag, der gerade zu sehen
 * ist (`playing`), steht vorn; sobald die Show weiterschaltet, fällt er heraus.
 */
export class QueueStore {
  private items: QueueItem[] = []
  private playing: string | undefined
  private seq = 0

  constructor(private readonly onChange: (queue: PhotoQueue) => void = () => {}) {}

  get(): PhotoQueue {
    return { items: this.items.map((i) => ({ ...i })), playing: this.playing }
  }

  apply(op: QueueOp): void {
    if (op.op === 'add') {
      if (!op.name || this.items.length >= MAX_ITEMS) return
      this.items.push({ id: `q${Date.now().toString(36)}${(this.seq++).toString(36)}`, name: op.name })
    } else if (op.op === 'remove') {
      this.items = this.items.filter((i) => i.id !== op.id)
    } else if (op.op === 'move') {
      const from = this.items.findIndex((i) => i.id === op.id)
      if (from < 0 || op.id === this.playing) return
      const [item] = this.items.splice(from, 1)
      // Nicht vor den Eintrag schieben, der gerade läuft.
      const first = this.playingIndex() + 1
      const to = Math.max(first, Math.min(this.items.length, Math.round(op.to)))
      this.items.splice(to, 0, item)
    } else if (op.op === 'clear') {
      this.items = this.items.filter((i) => i.id === this.playing)
    }
    this.onChange(this.get())
  }

  /** Nächster Eintrag, der noch nicht zu sehen war. */
  next(): QueueItem | undefined {
    return this.items.find((i) => i.id !== this.playing)
  }

  /** Die Show zeigt jetzt diesen Eintrag (null: ein normales Foto); der vorige fällt heraus. */
  setPlaying(id: string | null): void {
    if (this.playing === (id ?? undefined)) return
    if (this.playing) this.items = this.items.filter((i) => i.id !== this.playing)
    this.playing = id && this.items.some((i) => i.id === id) ? id : undefined
    // Der laufende Eintrag steht immer vorn.
    if (this.playing) {
      const index = this.playingIndex()
      this.items.unshift(...this.items.splice(index, 1))
    }
    this.onChange(this.get())
  }

  /** Show beendet: Liste bleibt, aber nichts läuft mehr. */
  stopped(): void {
    this.setPlaying(null)
  }

  private playingIndex(): number {
    return this.items.findIndex((i) => i.id === this.playing)
  }
}
