import {
  alignLyrics,
  estimateVocalWindow,
  parseLyrics,
  type LyricLine,
  type ParsedLyrics
} from '@shared/lyrics'
import type { SongPosition } from '@shared/settings'

/** Zeitfenster der Lautstärkekurve (Sekunden). */
const ENVELOPE_STEP = 0.1
/** So lange bleibt der Text nach der letzten Zeile stehen. */
const LINGER = 3
/** Ab dieser Lücke zwischen zwei Zeilen erscheint „♪ ♪ ♪“ (reine Musik). */
const REST_GAP = 4
/** Die laufende Zeile ist um diesen Faktor größer als die übrigen. */
const NOW_SCALE = 1.6
const REST_TEXT = '♪ ♪ ♪'

export interface SongOptions {
  volume: number
  position: SongPosition
  /** Vom Nutzer eingestellter Gesang (Sekunden), sonst wird er geschätzt. */
  timing?: { start: number; end: number }
  /** Schriftgröße als Faktor (1 = Standard). */
  fontScale: number
  /** Zeilen vor und nach der laufenden Zeile. */
  linesBefore: number
  linesAfter: number
}

/** Eine Zeile der Spalte: Überschrift, gesungene Zeile oder Musikpause. */
interface Item {
  kind: 'title' | 'line' | 'rest'
  text: string
  start: number
  end: number
}

/** Bewegung von Zeile k zur nächsten: von `from` bis `to` (Sekunden im Lied). */
interface Glide {
  from: number
  to: number
}

interface RowState {
  op: number
  scale: number
  p: number
}

const smooth = (x: number): number => x * x * x * (x * (x * 6 - 15) + 10)

/**
 * Spielt ein Lied ab und zeigt den Text als Karaoke. Alle Zeilen stehen in einer Spalte, die
 * Bild für Bild gleitet (kein Springen): Die laufende Zeile ist groß und füllt sich von links
 * nach rechts, davor und danach folgen die Nachbarzeilen immer blasser. Der Ton kommt als Datei
 * aus dem Hauptprozess und wird per Web Audio abgespielt, so lässt sich das Lied zusammen mit
 * der Show anhalten.
 */
export class SongPlayer {
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private parsed: ParsedLyrics | null = null
  private items: Item[] = []
  private glides: Glide[] = []
  private startedAt = 0
  private duration = 0
  private lingerUntil = 0
  private finished = false
  title = ''
  /** Gesang laut Schätzung bzw. Einstellung (für die Einstellungen). */
  window = { start: 0, end: 0 }
  onEnded: (() => void) | null = null

  private readonly box: HTMLElement
  private readonly view: HTMLElement
  private readonly track: HTMLElement
  private rows: HTMLElement[] = []
  private states: RowState[] = []
  private before = 1
  private after = 2
  /** Mitte jeder Zeile in der Spalte (px) und Lage der laufenden Zeile im Fenster. */
  private centers: number[] = []
  private anchor = 0
  private readonly onResize = (): void => this.measure()

  constructor(host: HTMLElement) {
    this.box = host
    this.view = document.createElement('div')
    this.view.className = 'ly-view'
    this.track = document.createElement('div')
    this.track.className = 'ly-track'
    this.view.append(this.track)
    host.append(this.view)
  }

  get active(): boolean {
    return this.source !== null
  }

  /** Lied laden und starten. `false`, wenn es nicht gelesen oder dekodiert werden kann. */
  async play(name: string, options: SongOptions): Promise<boolean> {
    this.stop()
    const data = await window.api.readSong(name)
    if (!data) return false
    const ctx = new AudioContext()
    let buffer: AudioBuffer
    try {
      // decodeAudioData übernimmt den Puffer; eine Kopie genügt nicht nötig, sie ist frisch.
      const bytes = data.audio
      buffer = await ctx.decodeAudioData(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      )
    } catch {
      void ctx.close()
      return false
    }
    this.duration = buffer.duration
    this.parsed = parseLyrics(data.lyrics)
    this.title = this.parsed.title || name
    this.window =
      options.timing ?? estimateVocalWindow(envelope(buffer), ENVELOPE_STEP, this.duration)
    this.layoutItems(0)

    const gain = ctx.createGain()
    gain.gain.value = options.volume
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain).connect(ctx.destination)
    source.onended = () => {
      if (this.source === source) {
        this.stop()
        this.onEnded?.()
      }
    }
    this.ctx = ctx
    this.source = source
    this.box.dataset.pos = options.position
    this.box.style.setProperty('--s', String(options.fontScale))
    this.before = options.linesBefore
    this.after = options.linesAfter
    this.build()
    this.finished = false
    this.startedAt = ctx.currentTime
    source.start()
    this.box.style.opacity = '1'
    window.addEventListener('resize', this.onResize)
    this.update()
    return true
  }

  stop(): void {
    const { source, ctx } = this
    this.source = null
    this.ctx = null
    window.removeEventListener('resize', this.onResize)
    if (source) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // schon beendet
      }
    }
    if (ctx) void ctx.close()
    this.box.style.opacity = '0'
  }

  pause(): void {
    void this.ctx?.suspend()
  }

  resume(): void {
    void this.ctx?.resume()
  }

  /** Verschiebt den Text (Sekunden, positiv = später); wirkt sofort. */
  nudge(seconds: number): void {
    if (this.parsed) this.layoutItems(seconds)
  }

  /** Position im Lied in Sekunden. */
  get time(): number {
    return this.ctx ? this.ctx.currentTime - this.startedAt : 0
  }

  /** Zeilen, Pausen und die Gleitbewegung zwischen ihnen aus den Zeitpunkten berechnen. */
  private layoutItems(offset: number): void {
    const lines: LyricLine[] = this.parsed ? alignLyrics(this.parsed, this.window, offset) : []
    const items: Item[] = []
    const first = lines[0]
    items.push({
      kind: 'title',
      text: '♪ ' + this.title,
      start: -1,
      end: first ? Math.max(0.1, first.start - 0.3) : this.duration
    })
    lines.forEach((l, k) => {
      items.push({ kind: 'line', text: l.text, start: l.start, end: l.end })
      const next = lines[k + 1]
      if (next && next.start - l.end >= REST_GAP) {
        items.push({ kind: 'rest', text: REST_TEXT, start: l.end + 0.8, end: next.start - 1 })
      }
    })
    this.items = items
    this.lingerUntil = (lines[lines.length - 1]?.end ?? 0) + LINGER

    // Gleiten: gegen Ende jeder Zeile beginnt die Spalte sanft zur nächsten zu laufen.
    const glides: Glide[] = []
    for (let k = 0; k + 1 < items.length; k++) {
      const to = items[k + 1].start + 0.15
      const length = Math.min(1.4, Math.max(0.8, items[k + 1].start - items[k].end + 0.5))
      let from = to - length
      if (k > 0) from = Math.max(from, glides[k - 1].to)
      if (from >= to) from = to - 0.05
      glides.push({ from, to })
    }
    this.glides = glides
  }

  /** Zeilenfelder aufbauen und ausmessen. */
  private build(): void {
    this.track.replaceChildren()
    this.rows = this.items.map((item) => {
      const row = document.createElement('div')
      row.className = 'ly-row' + (item.kind === 'line' ? '' : ' ly-' + item.kind)
      row.textContent = item.text
      row.style.opacity = '0'
      this.track.append(row)
      return row
    })
    this.states = this.rows.map(() => ({ op: 0, scale: 1, p: 0 }))
    this.measure()
  }

  /**
   * Höhe jeder Zeile messen: Die Spalte wird so verschoben, dass die laufende Zeile immer an
   * derselben Stelle steht; die Fensterhöhe reicht für die größte Gruppe aus Zeilen davor/danach.
   */
  private measure(): void {
    const rows = this.rows
    if (!rows.length) return
    const tops = rows.map((r) => r.offsetTop)
    const heights = rows.map((r) => r.offsetHeight)
    this.centers = rows.map((_, i) => tops[i] + heights[i] / 2)
    let above = 0
    let below = 0
    for (let i = 0; i < rows.length; i++) {
      above = Math.max(above, this.centers[i] - tops[Math.max(0, i - this.before)])
      const last = Math.min(rows.length - 1, i + this.after)
      below = Math.max(below, tops[last] + heights[last] - this.centers[i])
    }
    this.anchor = above
    this.view.style.height = `${Math.ceil(above + below)}px`
  }

  /** Stelle in der Zeilenliste (Bruchzahl): 2,5 = halb zwischen Zeile 2 und 3. */
  private position(t: number): number {
    const glides = this.glides
    let lo = 0
    let hi = glides.length
    // erste Bewegung, die noch nicht abgeschlossen ist
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (glides[mid].to <= t) lo = mid + 1
      else hi = mid
    }
    const g = glides[lo]
    if (!g || t <= g.from) return lo
    return lo + smooth((t - g.from) / (g.to - g.from))
  }

  /** Einmal pro Frame: Spalte gleiten lassen, Größe, Helligkeit und Füllung nachziehen. */
  update(): void {
    if (!this.source || !this.rows.length) return
    const t = this.time
    if (!this.finished && t > this.lingerUntil) {
      this.finished = true
      this.box.style.opacity = '0'
    }
    const pos = this.position(t)
    const k = Math.min(this.centers.length - 1, Math.floor(pos))
    const center =
      this.centers[k] +
      (this.centers[Math.min(k + 1, this.centers.length - 1)] - this.centers[k]) * (pos - k)
    this.track.style.transform = `translate3d(0, ${(this.anchor - center).toFixed(2)}px, 0)`

    // Laufende Zeile: die letzte, deren Beginn erreicht ist.
    let cur = -1
    for (let i = 0; i < this.items.length && this.items[i].start <= t; i++) cur = i

    const first = Math.max(0, Math.floor(pos) - this.before - 2)
    const last = Math.min(this.rows.length - 1, Math.ceil(pos) + this.after + 2)
    for (let r = 0; r < this.rows.length; r++) {
      const st = this.states[r]
      const row = this.rows[r]
      if (r < first || r > last) {
        if (st.op !== 0) {
          st.op = 0
          row.style.opacity = '0'
        }
        continue
      }
      const d = r - pos
      let op: number
      let scale: number
      if (d < 0) {
        op = (1 - 0.5 * Math.min(1, -d)) * clamp01(d + this.before + 1)
        scale = 1 + (NOW_SCALE - 1) * clamp01(1 + d)
      } else {
        op = (1 - 0.15 * Math.min(1, d) - 0.2 * Math.max(0, d - 1)) * clamp01(this.after + 1 - d)
        scale = 1 + (NOW_SCALE - 1) * clamp01(1 - d)
      }
      op = Math.max(0, op)
      if (Math.abs(op - st.op) > 0.004) {
        st.op = op
        row.style.opacity = op.toFixed(3)
      }
      if (Math.abs(scale - st.scale) > 0.002) {
        st.scale = scale
        row.style.transform = `scale(${scale.toFixed(3)})`
      }
      // Füllung: gesungene Zeilen ganz gelb, laufende anteilig, kommende weiß.
      const item = this.items[r]
      let p = 0
      if (item.kind === 'line') {
        if (r < cur) p = 1
        else if (r === cur) {
          p = Math.min(1, Math.max(0, (t - item.start) / Math.max(0.1, item.end - item.start)))
        }
      }
      if (Math.abs(p - st.p) > 0.002) {
        st.p = p
        row.style.setProperty('--p', `${(p * 100).toFixed(1)}%`)
      }
    }
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** Lautstärke je Zeitfenster in dB (aus dem ersten Kanal). */
function envelope(buffer: AudioBuffer): Float32Array {
  const data = buffer.getChannelData(0)
  const hop = Math.max(1, Math.round(buffer.sampleRate * ENVELOPE_STEP))
  const frames = Math.floor(data.length / hop)
  const db = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    for (let j = 0, k = f * hop; j < hop; j++, k++) sum += data[k] * data[k]
    db[f] = 10 * Math.log10(sum / hop + 1e-10)
  }
  return db
}
