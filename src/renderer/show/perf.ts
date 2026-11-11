/**
 * Messung für die Entwicklung: protokolliert langsame Frames zusammen mit den Ereignissen
 * kurz davor. Aktiv nur, wenn die Show mit dem Anker #perf geladen wird (PP_PERF=1).
 */
const enabled = window.location.hash.includes('perf')
const events: { t: number; name: string }[] = []
let frames = 0
let slow = 0
let worst = 0
let windowStart = performance.now()

export function mark(name: string): void {
  if (!enabled) return
  events.push({ t: performance.now(), name })
  if (events.length > 100) events.shift()
}

/** Misst die Dauer einer synchronen Arbeit und vermerkt sie als Ereignis. */
export function measure<T>(name: string, work: () => T): T {
  if (!enabled) return work()
  const start = performance.now()
  try {
    return work()
  } finally {
    mark(`${name} ${Math.round(performance.now() - start)}ms`)
  }
}

export function frame(deltaMS: number): void {
  if (!enabled) return
  frames++
  worst = Math.max(worst, deltaMS)
  const now = performance.now()
  if (deltaMS > 25) {
    slow++
    const recent = events
      .filter((e) => now - e.t < 250)
      .map((e) => `${e.name} (vor ${Math.round(now - e.t)} ms)`)
    console.warn(`[perf] Frame ${Math.round(deltaMS)} ms · ${recent.join(' · ') || '–'}`)
  }
  if (now - windowStart > 10_000) {
    console.warn(
      `[perf] 10 s: ${frames} Frames, ${slow} über 25 ms, schlechtester ${Math.round(worst)} ms`
    )
    frames = slow = worst = 0
    windowStart = now
  }
}
