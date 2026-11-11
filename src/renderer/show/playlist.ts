import { shuffle, type Rng } from '@shared/random'

/**
 * Ordnet Einträge (mit Wiederholungen) zufällig an, ohne dass ein Eintrag direkt auf
 * sich selbst folgt, soweit das überhaupt möglich ist. `prev` ist der zuletzt gezeigte.
 * Gewählt wird zufällig nach Häufigkeit; ein Eintrag wird nur dann vorgezogen, wenn er
 * später nicht mehr ohne Dopplung unterzubringen wäre.
 */
export function arrange(
  pool: string[],
  prev: string | undefined,
  rng: Rng = Math.random
): string[] {
  const counts = new Map<string, number>()
  for (const p of pool) counts.set(p, (counts.get(p) ?? 0) + 1)
  const out: string[] = []
  let last = prev
  let remaining = pool.length
  while (remaining > 0) {
    let candidates = [...counts].filter(([k, c]) => c > 0 && k !== last)
    if (candidates.length === 0) candidates = [...counts].filter(([, c]) => c > 0)
    // Muss ein Eintrag jetzt kommen, damit er sich später nicht wiederholt?
    const urgent = candidates.find(([, c]) => c * 2 > remaining)
    let pick: string
    if (urgent) pick = urgent[0]
    else {
      let r = rng() * candidates.reduce((sum, [, c]) => sum + c, 0)
      pick = candidates[candidates.length - 1][0]
      for (const [k, c] of candidates) {
        r -= c
        if (r < 0) {
          pick = k
          break
        }
      }
    }
    out.push(pick)
    counts.set(pick, counts.get(pick)! - 1)
    last = pick
    remaining--
  }
  return out
}

/**
 * Zufällige Reihenfolge ohne Wiederholung: Erst wenn alle Fotos gezeigt wurden,
 * wird neu gemischt, und das zuletzt gezeigte Foto kommt nicht direkt wieder.
 * Merkt sich den Verlauf, damit man zurückblättern kann.
 */
export class Playlist {
  private queue: string[] = []
  private history: string[] = []
  private boosted: string[] = []
  private boostExtra = 0
  /** Position im Verlauf; zeigt auf das aktuelle Foto. */
  private cursor = -1

  constructor(
    private items: string[],
    private rng: Rng = Math.random
  ) {}

  get size(): number {
    return this.items.length
  }

  /**
   * Diese Fotos kommen je Runde `extra` Mal zusätzlich vor (z. B. mit der Fokus-Person).
   * Gleiche Fotos werden dabei nie direkt hintereinander gezeigt.
   */
  setBoost(names: string[], extra: number): void {
    const known = new Set(this.items)
    this.boosted = names.filter((n) => known.has(n))
    this.boostExtra = Math.max(0, Math.floor(extra))
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
      const round = [...this.items]
      for (let i = 0; i < this.boostExtra; i++) round.push(...this.boosted)
      this.queue =
        this.boosted.length && this.boostExtra
          ? arrange(round, last, this.rng)
          : shuffle(round, this.rng)
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

  /**
   * Springt im Verlauf auf das Foto vor `name` (letztes Vorkommen).
   * Danach liefert `next()` wieder `name` und die folgenden.
   */
  before(name: string): string | undefined {
    const idx = this.history.lastIndexOf(name)
    if (idx <= 0) return undefined
    this.cursor = idx - 1
    return this.history[this.cursor]
  }

  previous(): string | undefined {
    if (this.cursor <= 0) return undefined
    this.cursor--
    return this.history[this.cursor]
  }
}
