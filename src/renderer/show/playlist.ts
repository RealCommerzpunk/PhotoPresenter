import { shuffle, type Rng } from '@shared/random'

/**
 * Zufällige Reihenfolge ohne Wiederholung: Erst wenn alle Fotos gezeigt wurden,
 * wird neu gemischt, und das zuletzt gezeigte Foto kommt nicht direkt wieder.
 * Merkt sich den Verlauf, damit man zurückblättern kann.
 */
export class Playlist {
  private queue: string[] = []
  private history: string[] = []
  /** Position im Verlauf; zeigt auf das aktuelle Foto. */
  private cursor = -1

  constructor(
    private items: string[],
    private rng: Rng = Math.random
  ) {}

  get size(): number {
    return this.items.length
  }

  /** Tauscht die Fotoliste aus (z. B. nach Ordnerwechsel). */
  setItems(items: string[]): void {
    this.items = items
    const known = new Set(items)
    this.queue = this.queue.filter((i) => known.has(i))
  }

  next(): string | undefined {
    if (this.cursor < this.history.length - 1) {
      this.cursor++
      return this.history[this.cursor]
    }
    if (this.items.length === 0) return undefined
    if (this.queue.length === 0) {
      const last = this.history[this.history.length - 1]
      this.queue = shuffle(this.items, this.rng)
      if (this.queue.length > 1 && this.queue[0] === last) {
        this.queue.push(this.queue.shift()!)
      }
    }
    const item = this.queue.shift()!
    this.history.push(item)
    if (this.history.length > 500) this.history.shift()
    this.cursor = this.history.length - 1
    return item
  }

  previous(): string | undefined {
    if (this.cursor <= 0) return undefined
    this.cursor--
    return this.history[this.cursor]
  }
}
