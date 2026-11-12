import { shuffle } from '@shared/random'

/**
 * Vorschaubilder für die 3D-Fotowelt. Sie werden im Hintergrund nach und nach geladen,
 * immer nur eines zur Zeit und nur, wenn die Show gerade ruhig ist (kein Übergang).
 */
export class ThumbPool {
  private readonly cache = new Map<string, ImageBitmap>()
  private queue: string[] = []
  private loading = false

  constructor(private readonly load: (name: string) => Promise<ImageBitmap>) {}

  get size(): number {
    return this.cache.size
  }

  setItems(names: string[]): void {
    const known = new Set(names)
    for (const [name, bmp] of this.cache) {
      if (!known.has(name)) {
        bmp.close()
        this.cache.delete(name)
      }
    }
    this.queue = shuffle(names.filter((n) => !this.cache.has(n)))
  }

  /** Lädt das nächste Vorschaubild, solange weniger als `target` bereitliegen. */
  tick(target: number): void {
    if (this.loading || this.cache.size >= target) return
    const name = this.queue.shift()
    if (!name) return
    this.loading = true
    this.load(name)
      .then((bmp) => this.cache.set(name, bmp))
      .catch(() => undefined)
      .finally(() => (this.loading = false))
  }

  /** Zufällige Auswahl bereitliegender Vorschaubilder (die Bitmaps bleiben im Speicher). */
  sample(count: number): { name: string; bitmap: ImageBitmap }[] {
    return shuffle([...this.cache.entries()])
      .slice(0, count)
      .map(([name, bitmap]) => ({ name, bitmap }))
  }
}
