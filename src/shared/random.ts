/**
 * Konfigurationswerte "von … bis" mit optionalem Zufallsmodus.
 * Jeder einstellbare Zahlenwert der Diashow ist eine Range.
 */
export interface Range {
  min: number
  max: number
  /** 'fixed' nutzt immer `min`, 'random' zieht gleichverteilt aus [min, max]. */
  mode: 'fixed' | 'random'
}

/** Eintrag einer gewichteten Auswahlliste (z. B. Übergangseffekte, Textstile). */
export interface WeightedOption<T extends string = string> {
  id: T
  enabled: boolean
  weight: number
}

export type Rng = () => number

/** Deterministischer Zufallsgenerator (mulberry32) zum Reproduzieren von Abläufen. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick(range: Range, rng: Rng = Math.random): number {
  const lo = Math.min(range.min, range.max)
  const hi = Math.max(range.min, range.max)
  if (range.mode === 'fixed' || lo === hi) return range.min
  return lo + rng() * (hi - lo)
}

/** Wählt eine aktivierte Option proportional zu ihrem Gewicht; `undefined`, wenn keine aktiv ist. */
export function pickWeighted<T extends string>(
  options: readonly WeightedOption<T>[],
  rng: Rng = Math.random
): T | undefined {
  const active = options.filter((o) => o.enabled && o.weight > 0)
  const total = active.reduce((sum, o) => sum + o.weight, 0)
  if (total <= 0) return undefined
  let r = rng() * total
  for (const o of active) {
    r -= o.weight
    if (r < 0) return o.id
  }
  return active[active.length - 1].id
}

/** Fisher-Yates-Mischung (liefert eine neue Liste). */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}
