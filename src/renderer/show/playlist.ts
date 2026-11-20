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
 * Neue Runde so ordnen, dass kürzlich gezeigte Fotos hinten liegen: Alles, was vor weniger
 * als einer halben Runde zu sehen war, kommt (gemischt) ans Ende. Damit liegen zwischen zwei
 * Auftritten desselben Fotos mindestens eine halbe Runde, auch über die Rundengrenze und
 * über einen Neustart der Show hinweg. `age` = wie viele Fotos her (nie gezeigt = Infinity).
 */
export function freshFirst(
  round: string[],
  age: (name: string) => number,
  rng: Rng = Math.random
): string[] {
  const window = Math.floor(round.length / 2)
  const fresh = round.filter((n) => age(n) >= window)
  const recent = round.filter((n) => age(n) < window)
  return [...shuffle(fresh, rng), ...shuffle(recent, rng)]
}

/**
 * Unter mehreren gleich guten Kandidaten den nehmen, der am längsten nicht zu sehen war.
 * `scores`: je Kandidat, höher = besser; gleich gut = höchstens `slack` unter dem besten.
 */
export function freshestAmong(scores: number[], ages: number[], slack: number): number {
  let best = 0
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i
  let pick = best
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < scores[best] - slack) continue
    if (ages[i] > ages[pick] || (ages[i] === ages[pick] && scores[i] > scores[pick])) pick = i
  }
  return pick
}

/**
 * Zufällige Reihenfolge ohne Wiederholung: Erst wenn alle Fotos gezeigt wurden,
 * wird neu gemischt, und das zuletzt gezeigte Foto kommt nicht direkt wieder.
 * Merkt sich den Verlauf, damit man zurückblättern kann.
 *
 * Mit `avoidRepeats` zählt außerdem, wann ein Foto zuletzt zu sehen war – egal woher es kam
 * (Zielfoto der 3D-Welt, Galerie der Fernbedienung, frühere Shows): Kürzlich gezeigte Fotos
 * kommen in der nächsten Runde nach hinten, von außen gezeigte fallen aus der laufenden Runde.
 */
export class Playlist {
  private queue: string[] = []
  private history: string[] = []
  private boosted: string[] = []
  private boostExtra = 0
  /** Position im Verlauf; zeigt auf das aktuelle Foto. */
  private cursor = -1
  /** Zähler der gezeigten Fotos und je Foto der Stand beim letzten Auftritt. */
  private seq = 0
  private lastShown = new Map<string, number>()
  avoidRepeats = true

  constructor(
    private items: string[],
    private rng: Rng = Math.random
  ) {}

  get size(): number {
    return this.items.length
  }

  /** Verlauf aus früheren Shows übernehmen (ältestes zuerst). */
  setRecent(names: string[]): void {
    for (const n of names) this.lastShown.set(n, ++this.seq)
  }

  /**
   * Ein Foto, das nicht aus dieser Playlist kam (Zielfoto der 3D-Welt, Galerie), ist jetzt zu
   * sehen: Es zählt als gezeigt und fällt aus der laufenden Runde, statt bald noch mal zu kommen.
   * (Was `next()` liefert, zählt die Playlist selbst.)
   */
  shownExternally(name: string): void {
    this.lastShown.set(name, ++this.seq)
    if (this.avoidRepeats) {
      const i = this.queue.indexOf(name)
      if (i >= 0) this.queue.splice(i, 1)
    }
  }

  /** Wie viele Fotos her ein Foto zuletzt zu sehen war; nie gezeigt = Infinity. */
  age(name: string): number {
    const s = this.lastShown.get(name)
    return s === undefined ? Infinity : this.seq - s
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
          : this.avoidRepeats
            ? freshFirst(round, (n) => this.age(n), this.rng)
            : shuffle(round, this.rng)
      if (this.queue.length > 1 && this.queue[0] === last) {
        this.queue.push(this.queue.shift()!)
      }
    }
    const item = this.queue.shift()!
    this.lastShown.set(item, ++this.seq)
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
