import {
  alignLyrics,
  estimateVocalWindow,
  lineIndexAt,
  parseLyrics,
  type LyricLine,
  type ParsedLyrics
} from '@shared/lyrics'
import type { SongPosition } from '@shared/settings'

/** Zeitfenster der Lautstärkekurve (Sekunden). */
const ENVELOPE_STEP = 0.1
/** So lange bleibt der Text nach der letzten Zeile stehen. */
const LINGER = 3

export interface SongOptions {
  volume: number
  position: SongPosition
  /** Vom Nutzer eingestellter Gesang (Sekunden), sonst wird er geschätzt. */
  timing?: { start: number; end: number }
}

/**
 * Spielt ein Lied ab und zeigt den Text als Karaoke: vorige Zeile gedämpft, laufende Zeile
 * mit Füllung von links nach rechts, die nächsten Zeilen darunter. Ohne Text läuft nur Musik.
 * Der Ton kommt als Datei aus dem Hauptprozess und wird per Web Audio abgespielt, so lässt
 * sich das Lied zusammen mit der Show anhalten.
 */
export class SongPlayer {
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private lines: LyricLine[] = []
  private parsed: ParsedLyrics | null = null
  private startedAt = 0
  private index = -2
  private duration = 0
  private lingerUntil = 0
  title = ''
  /** Gesang laut Schätzung bzw. Einstellung (für die Einstellungen). */
  window = { start: 0, end: 0 }
  onEnded: (() => void) | null = null

  private readonly box: HTMLElement
  private readonly head: HTMLElement
  private readonly rows: HTMLElement[]

  constructor(host: HTMLElement) {
    this.box = host
    host.innerHTML =
      '<div class="ly-head"></div>' +
      '<div class="ly-row ly-prev"></div>' +
      '<div class="ly-row ly-now"></div>' +
      '<div class="ly-row ly-next"></div>' +
      '<div class="ly-row ly-next2"></div>'
    this.head = host.querySelector('.ly-head')!
    this.rows = [...host.querySelectorAll<HTMLElement>('.ly-row')]
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
    this.lines = alignLyrics(this.parsed, this.window)
    this.lingerUntil = (this.lines[this.lines.length - 1]?.end ?? 0) + LINGER

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
    this.index = -2
    this.startedAt = ctx.currentTime
    source.start()
    this.box.style.opacity = '1'
    return true
  }

  stop(): void {
    const { source, ctx } = this
    this.source = null
    this.ctx = null
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
    this.index = -2
  }

  pause(): void {
    void this.ctx?.suspend()
  }

  resume(): void {
    void this.ctx?.resume()
  }

  /** Verschiebt den Text (Sekunden, positiv = später); wirkt sofort. */
  nudge(seconds: number): void {
    if (!this.parsed) return
    this.lines = alignLyrics(this.parsed, this.window, seconds)
  }

  /** Position im Lied in Sekunden. */
  get time(): number {
    return this.ctx ? this.ctx.currentTime - this.startedAt : 0
  }

  /** Einmal pro Frame: Zeilen wechseln, Füllung der laufenden Zeile nachziehen. */
  update(): void {
    if (!this.source) return
    const t = this.time
    const lines = this.lines
    if (!lines.length) {
      if (this.index !== -1) {
        this.index = -1
        this.head.textContent = '♪ ' + this.title
        this.head.style.display = ''
        for (const r of this.rows) r.textContent = ''
      }
      return
    }
    const i = lineIndexAt(lines, t)
    const done = t > this.lingerUntil
    const line = i >= 0 ? lines[i] : null
    // Reine Musik: die Zeile ist zu Ende, die nächste beginnt erst später.
    const rest = !done && line !== null && t > line.end + 1.5
    const key = done ? -3 : rest ? i + 10_000 : i
    if (key !== this.index) {
      this.index = key
      // Vor der ersten Zeile und nach der letzten: Titel bzw. leer.
      this.head.style.display = i < 0 && !done ? '' : 'none'
      this.head.textContent = '♪ ' + this.title
      const at = (k: number): string => (!done && lines[k] ? lines[k].text : '')
      this.rows[0].textContent = rest ? at(i) : at(i - 1)
      this.rows[1].textContent = rest ? '♪ ♪ ♪' : at(i)
      this.rows[2].textContent = at(i + 1)
      this.rows[3].textContent = at(i + 2)
      // Vor der ersten Zeile: die erste schon als „nächste“ in der Mitte anzeigen.
      if (i < 0 && !done) {
        this.rows[1].textContent = ''
        this.rows[2].textContent = lines[0].text
        this.rows[3].textContent = lines[1]?.text ?? ''
      }
    }
    const p =
      line && !rest
        ? Math.min(1, Math.max(0, (t - line.start) / Math.max(0.1, line.end - line.start)))
        : 0
    this.rows[1].style.setProperty('--p', `${(p * 100).toFixed(1)}%`)
  }
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
