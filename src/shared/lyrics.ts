/**
 * Liedtexte für den Karaoke-Modus: Text einlesen (mit oder ohne Zeitmarken), zurückschreiben
 * und den Zeilen Zeiten geben. Reine Rechnung, ohne Audio und Fenster (getestet).
 */

/** Eine gesungene Zeile des Textes. */
export interface LyricSource {
  text: string
  /** Nummer der Strophe (Leerzeile oder Abschnittsmarke beginnt eine neue). */
  stanza: number
  /** Abschnitt aus der Marke davor, z. B. „Chorus“ (leer, wenn keine Marke). */
  section: string
  /** Zeitmarke aus dem Text (LRC), in Sekunden. */
  time?: number
  /** Zeitmarke, wann die Zeile aufhört (eigene Marke ohne Text direkt danach). */
  end?: number
}

export interface ParsedLyrics {
  /** Überschrift aus der ersten Zeile (leer, wenn der Text keine hat). */
  title: string
  lines: LyricSource[]
  /** Alle Zeilen tragen eine Zeitmarke: dann braucht es keine Schätzung. */
  timed: boolean
}

/** Zeile mit Zeit; `end` ist, wann sie fertig gesungen ist (die Pause danach gehört nicht dazu). */
export interface LyricLine extends LyricSource {
  start: number
  end: number
  /** Das Ende stammt aus einer Zeitmarke (bzw. ist gesetzt), nicht aus der Schätzung. */
  fixedEnd?: boolean
}

/**
 * Zeile der TXT-Datei, so wie sie dasteht. Der Editor arbeitet damit und schreibt sie
 * unverändert zurück (nur die Zeitmarken ändern sich).
 */
export type LyricRow =
  | { type: 'title'; text: string }
  | { type: 'blank' }
  | { type: 'section'; text: string }
  | { type: 'line'; text: string; time?: number; end?: number }

const SECTION = /^\[([^\]\d][^\]]*)\]$/
const STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)$/

function stampSeconds(m: RegExpExecArray): number {
  const frac = m[3] ? Number(`0.${m[3]}`) : 0
  return Number(m[1]) * 60 + Number(m[2]) + frac
}

/** Zeit als LRC-Marke „[mm:ss.xx]“. */
export function formatStamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100))
  const cs = total % 100
  const s = Math.floor(total / 100) % 60
  const m = Math.floor(total / 6000)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `[${two(m)}:${two(s)}.${two(cs)}]`
}

/** Datei in Zeilen zerlegen (Überschrift, Leerzeilen, Abschnitte, Textzeilen mit Marken). */
export function parseRows(raw: string): LyricRow[] {
  const src = raw
    .replace(new RegExp(String.fromCharCode(94, 92, 117, 70, 69, 70, 70)), '')
    .split(/\r?\n/)
    .map((r) => r.trim())
  // Am Ende der Datei überzählige Leerzeilen weglassen.
  while (src.length && !src[src.length - 1]) src.pop()
  const rows: LyricRow[] = []
  // Überschrift: erster Absatz besteht aus genau einer Zeile, danach folgt noch Text.
  const first = src[0] ?? ''
  const hasTitle =
    !!first &&
    src.findIndex((r) => !r) === 1 &&
    src.slice(2).some((r) => r) &&
    !SECTION.test(first) &&
    !STAMP.test(first)
  src.forEach((row, i) => {
    if (i === 0 && hasTitle) {
      rows.push({ type: 'title', text: row })
      return
    }
    if (!row) {
      rows.push({ type: 'blank' })
      return
    }
    const marker = SECTION.exec(row)
    if (marker) {
      rows.push({ type: 'section', text: marker[1].trim() })
      return
    }
    const stamp = STAMP.exec(row)
    if (!stamp) {
      rows.push({ type: 'line', text: row })
      return
    }
    const time = stampSeconds(stamp)
    if (stamp[4]) {
      rows.push({ type: 'line', text: stamp[4], time })
      return
    }
    // Marke ohne Text: Ende der Zeile davor (Pause, reine Musik).
    for (let k = rows.length - 1; k >= 0; k--) {
      const prev = rows[k]
      if (prev.type === 'line') {
        prev.end = time
        break
      }
      if (prev.type !== 'blank') break
    }
  })
  return rows
}

/** Zeilen wieder als Text der Datei (mit Zeilenumbrüchen `\n`). */
export function serializeRows(rows: readonly LyricRow[]): string {
  const out: string[] = []
  for (const row of rows) {
    if (row.type === 'title') out.push(row.text)
    else if (row.type === 'blank') out.push('')
    else if (row.type === 'section') out.push(`[${row.text}]`)
    else {
      out.push(row.time !== undefined ? `${formatStamp(row.time)} ${row.text}` : row.text)
      if (row.end !== undefined) out.push(formatStamp(row.end))
    }
  }
  return out.join('\n') + '\n'
}

/**
 * Text einlesen. Erkannt werden Abschnittsmarken wie „[Verse 1]“ (nicht gesungen), eine
 * Überschrift als erste, einzelne Zeile und Zeitmarken im LRC-Stil „[01:23.45] Zeile“.
 */
export function parseLyrics(raw: string): ParsedLyrics {
  let title = ''
  const lines: LyricSource[] = []
  let stanza = 0
  let section = ''
  let newStanza = false
  for (const row of parseRows(raw)) {
    if (row.type === 'title') title = row.text
    else if (row.type === 'blank') newStanza = true
    else if (row.type === 'section') {
      section = row.text
      newStanza = true
    } else {
      if (newStanza && lines.length) stanza++
      newStanza = false
      lines.push({ text: row.text, stanza, section, time: row.time, end: row.end })
    }
  }
  const timed = lines.length > 0 && lines.every((l) => l.time !== undefined)
  return { title, lines, timed }
}

/** Grobe Silbenzahl einer Zeile (Vokalgruppen); Gewicht für die Singdauer. */
export function syllables(text: string): number {
  const groups = text.toLowerCase().match(/[aeiouyäöüáàâéèêíìîóòôúùûœ]+/g)
  return Math.max(2, groups ? groups.length : 0)
}

export interface VocalWindow {
  /** Sekunde, in der der Gesang beginnt. */
  start: number
  /** Sekunde, in der der Gesang endet. */
  end: number
}

/**
 * Wann beginnt und endet der Gesang? Aus der Lautstärke (dB je Zeitfenster) lässt sich ein
 * Gesang nicht sicher heraushören; geschätzt wird deshalb ein üblicher Anfang (Intro) und
 * ein Ende kurz vor dem Ausklang. Beides lässt sich pro Lied einstellen.
 */
export function estimateVocalWindow(
  db: ArrayLike<number>,
  frameSeconds: number,
  duration: number
): VocalWindow {
  // Ausklang: letzte hörbare Stelle (stille Enden gehören nicht zum Lied).
  let loudest = -Infinity
  for (let i = 0; i < db.length; i++) loudest = Math.max(loudest, db[i])
  let last = db.length - 1
  while (last > 0 && db[last] < loudest - 25) last--
  const audible = Math.min(duration, (last + 1) * frameSeconds)
  // Anfang: Stille am Beginn überspringen, dann ein kurzes Intro dazurechnen.
  let first = 0
  while (first < db.length - 1 && db[first] < loudest - 25) first++
  const lead = first * frameSeconds
  const intro = Math.min(10, Math.max(3, duration * 0.03))
  const start = lead + intro
  const end = Math.max(start + 5, audible - Math.min(8, Math.max(2, duration * 0.02)))
  return { start, end: Math.min(end, audible) }
}

/** Pause zwischen zwei Strophen, gemessen in Zeilen-Gewichten (Atem, Instrumental). */
const STANZA_GAP = 1.2
/** Anteil der Zeit bis zur nächsten Zeile, in dem die Zeile gesungen wird. */
const SUNG_SHARE = 0.9

interface Span {
  /** Erste und letzte Zeile (einschließlich) der Strecke ohne Zeitmarke. */
  from: number
  to: number
  start: number
  end: number
}

/**
 * Zeiten für alle Zeilen.
 * - Alle Zeilen mit Zeitmarke: übernommen.
 * - Teilweise Zeitmarken (Arbeit „Stück für Stück“): Marken sind feste Punkte, die Zeilen
 *   dazwischen werden nach Silben auf die Lücke verteilt, davor und danach auf das Fenster
 *   des Gesangs.
 * - Keine Marken: das ganze Fenster des Gesangs wird nach Silben verteilt, mit Pausen
 *   zwischen Strophen.
 * `offset` verschiebt alles (Sekunden, positiv = später).
 */
export function alignLyrics(parsed: ParsedLyrics, window: VocalWindow, offset = 0): LyricLine[] {
  const lines = parsed.lines
  const n = lines.length
  if (!n) return []
  const weights = lines.map((l) => syllables(l.text))
  const gapBefore: number[] = lines.map((l, i) =>
    i > 0 && l.stanza !== lines[i - 1].stanza ? STANZA_GAP : 0
  )
  const totalWeight = weights.reduce((a, b) => a + b, 0) + gapBefore.reduce((a, b) => a + b, 0)
  // Sekunden je Gewichtseinheit, aus dem Fenster des Gesangs (für Zeilen ohne eigene Dauer).
  const unit = Math.max(1, window.end - window.start) / totalWeight
  const anchored = lines.map((l) => l.time !== undefined)
  const result: LyricLine[] = new Array<LyricLine>(n)

  const place = (i: number, start: number, end: number, fixedEnd = false): void => {
    result[i] = { ...lines[i], start: start + offset, end: end + offset, fixedEnd }
  }

  /** Strecke ohne Marken: nach Silben auf [start, end] verteilen (Strophenpausen mitgerechnet). */
  const distribute = (span: Span): void => {
    let total = 0
    for (let i = span.from; i <= span.to; i++) total += weights[i] + gapBefore[i]
    const u = (span.end - span.start) / Math.max(total, 1e-6)
    let at = span.start
    for (let i = span.from; i <= span.to; i++) {
      at += gapBefore[i] * u
      const slot = weights[i] * u
      place(i, at, at + slot * SUNG_SHARE)
      at += slot
    }
  }

  const first = anchored.indexOf(true)
  if (first < 0) {
    distribute({ from: 0, to: n - 1, start: window.start, end: window.end })
    return result
  }

  // Marken in Reihenfolge abarbeiten.
  const anchors = anchored.flatMap((a, i) => (a ? [i] : []))
  /** Ende einer Zeile mit Marke: eigene Endmarke, sonst bis zur nächsten Zeile bzw. Schätzung. */
  const endOf = (i: number, nextStart: number | undefined): { end: number; fixed: boolean } => {
    const start = lines[i].time ?? 0
    const own = lines[i].end
    if (own !== undefined && own > start) return { end: own, fixed: true }
    const typical = Math.max(2.5, weights[i] * unit * 1.8)
    const gap = nextStart === undefined ? typical : nextStart - start
    return { end: start + Math.min(gap, typical) * (gap <= typical ? SUNG_SHARE : 1), fixed: false }
  }

  // Zeilen vor der ersten Marke
  if (first > 0) {
    const t0 = lines[first].time ?? 0
    let total = 0
    for (let i = 0; i < first; i++) total += weights[i] + gapBefore[i]
    const need = total * unit
    // Gesang soll laut Fenster beginnen, aber nie später als die Marke abzüglich der Mindestdauer.
    const s = Math.min(window.start, t0 - need * 0.5)
    distribute({ from: 0, to: first - 1, start: Math.max(0, s), end: t0 })
  }
  for (let k = 0; k < anchors.length; k++) {
    const i = anchors[k]
    const nextAnchor = anchors[k + 1] ?? n
    const t = lines[i].time ?? 0
    const nextStart = nextAnchor < n ? lines[nextAnchor].time : undefined
    const freeTo = nextAnchor - 1
    if (freeTo < i + 1) {
      // Direkt die nächste Marke (oder Ende): Ende der Zeile aus Marke bzw. Schätzung.
      const own = endOf(i, nextStart)
      place(i, t, own.end, own.fixed)
      continue
    }
    // Freie Zeilen folgen: Strecke von dieser Marke bis zur nächsten (bzw. zum Ende des Fensters).
    const ownEnd = lines[i].end
    if (ownEnd !== undefined && ownEnd > t) {
      // Eigene Endmarke: die Zeile hat ihre Zeit, die freien Zeilen teilen den Rest.
      place(i, t, ownEnd, true)
      const from = ownEnd
      const to = nextStart ?? Math.max(window.end, from + totalWeightOf(i + 1, freeTo) * unit)
      distribute({ from: i + 1, to: freeTo, start: from, end: Math.max(to, from + 0.5) })
    } else {
      // Die Zeile selbst teilt sich die Strecke mit den freien Zeilen nach Silben; Pause davor entfällt.
      const gaps = gapBefore[i]
      gapBefore[i] = 0
      const total = totalWeightOf(i, freeTo)
      gapBefore[i] = gaps
      const to = nextStart ?? Math.max(window.end, t + total * unit)
      const saved = gapBefore[i]
      gapBefore[i] = 0
      distribute({ from: i, to: freeTo, start: t, end: Math.max(to, t + 0.5) })
      gapBefore[i] = saved
      // Die Marke bleibt exakt am Anfang der Zeile.
      result[i] = { ...result[i], start: t + offset }
    }
  }
  return result

  function totalWeightOf(a: number, b: number): number {
    let sum = 0
    for (let i = a; i <= b; i++) sum += weights[i] + gapBefore[i]
    return sum
  }
}

/**
 * Index der Zeile, die zur Zeit `t` dran ist (letzte, die begonnen hat); -1 davor.
 * Linear gesucht, damit auch von Hand falsch gesetzte Zeiten nichts durcheinanderbringen.
 */
export function lineIndexAt(lines: readonly LyricLine[], t: number): number {
  let found = -1
  for (let i = 0; i < lines.length; i++) if (lines[i].start <= t) found = i
  return found
}
