import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { alignLyrics, parseLyrics, parseRows, serializeRows, type LyricRow } from '@shared/lyrics'
import { Card } from './controls'

/** Man drückt und lässt meist etwas zu spät los: so viel wird abgezogen (Sekunden). */
const REACTION = 0.1
/** So viel Anlauf vor einer Zeile beim Abspielen (Sekunden). */
const PRE_ROLL = 3
/** Sichtbarer Ausschnitt im Feinschliff (Sekunden). */
const VIEW = 16
/** Auflösung der Wellenform (Sekunden je Wert). */
const PEAK_STEP = 0.02
/** Abstand zum Rand eines Blocks, ab dem man den Rand greift (CSS-Pixel). */
const EDGE = 7
/** Kürzeste Zeile (Sekunden). */
const MIN_LEN = 0.2
const FINE_HEIGHT = 150
const OVERVIEW_HEIGHT = 30

type Line = Extract<LyricRow, { type: 'line' }>

/** Zeitraum einer Zeile; `fixed` = eingepasst (sonst geschätzt). */
interface Span {
  start: number
  end: number
  fixed: boolean
}

interface Drag {
  mode: 'start' | 'end' | 'block' | 'pan'
  line: number
  x: number
  moved: boolean
  start: number
  end: number
  view: number
  lo: number
  hi: number
}

const btn =
  'rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'

function clock(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Lautstärke-Spitzen des Liedes (0–1) für die Wellenform. */
function peaksOf(buffer: AudioBuffer): Float32Array {
  const data = buffer.getChannelData(0)
  const hop = Math.max(1, Math.round(buffer.sampleRate * PEAK_STEP))
  const out = new Float32Array(Math.floor(data.length / hop))
  let max = 0
  for (let f = 0; f < out.length; f++) {
    let peak = 0
    for (let j = f * hop, end = j + hop; j < end; j++) {
      const v = Math.abs(data[j])
      if (v > peak) peak = v
    }
    out[f] = peak
    if (peak > max) max = peak
  }
  for (let f = 0; f < out.length; f++) out[f] = Math.sqrt(out[f] / (max || 1))
  return out
}

/**
 * Karaoke-Zeiten einpassen, in zwei Schritten:
 * 1. Mitsingen – solange eine Zeile gesungen wird, die Fläche (oder Leertaste) gedrückt halten.
 *    Drücken = Anfang, Loslassen = Ende, danach ist die nächste Zeile dran.
 * 2. Feinschliff – auf der Wellenform die Ränder einzelner Zeilen mit der Maus ziehen.
 * Die Zeiten landen als „[mm:ss.xx]“ in der TXT (Ende als Marke ohne Text in der Zeile danach).
 */
export function SongSync({
  name,
  title,
  onClose
}: {
  name: string
  title: string
  onClose: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<LyricRow[] | null>(null)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  /** Zeile, die als Nächstes eingepasst wird bzw. ausgewählt ist (Index in `lines`). */
  const [cursor, setCursor] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [holding, setHolding] = useState(false)
  const [time, setTime] = useState(0)
  const [viewStart, setViewStart] = useState(0)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [flash, setFlash] = useState(-1)

  const audio = useRef<HTMLAudioElement | null>(null)
  const stopAt = useRef<number | null>(null)
  const holdFrom = useRef<number | null>(null)
  const fineRef = useRef<HTMLCanvasElement | null>(null)
  const overRef = useRef<HTMLCanvasElement | null>(null)
  const drag = useRef<Drag | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  // ---------- Laden ----------
  useEffect(() => {
    let url = ''
    let alive = true
    void window.api.readSong(name).then(async (data) => {
      if (!alive) return
      if (!data) {
        setError(t('ui.karaoke.loadFailed'))
        return
      }
      const parsed = parseRows(data.lyrics)
      setRows(parsed)
      const lines = parsed.filter((r): r is Line => r.type === 'line')
      const firstOpen = lines.findIndex((l) => l.time === undefined)
      setCursor(firstOpen < 0 ? lines.length : firstOpen)
      url = URL.createObjectURL(
        new Blob([data.audio.slice().buffer as ArrayBuffer], { type: 'audio/mpeg' })
      )
      const el = new Audio(url)
      el.preload = 'auto'
      el.onloadedmetadata = () => setDuration(el.duration)
      el.onplay = () => setPlaying(true)
      el.onpause = () => setPlaying(false)
      el.onended = () => setPlaying(false)
      audio.current = el
      // Wellenform: einmal dekodieren
      try {
        const ctx = new AudioContext()
        const buffer = await ctx.decodeAudioData(data.audio.slice().buffer as ArrayBuffer)
        void ctx.close()
        if (alive) setPeaks(peaksOf(buffer))
      } catch {
        // ohne Wellenform geht es auch
      }
    })
    return () => {
      alive = false
      audio.current?.pause()
      audio.current = null
      if (url) URL.revokeObjectURL(url)
    }
  }, [name])

  // Abspielposition jedes Bild nachführen; Zeile anhören endet von selbst.
  useEffect(() => {
    let id = 0
    const loop = (): void => {
      const el = audio.current
      if (el) {
        if (stopAt.current !== null && el.currentTime >= stopAt.current) {
          el.pause()
          stopAt.current = null
        }
        const now = el.currentTime
        setTime(now)
        // Beim Abspielen läuft der Ausschnitt im Feinschliff mit.
        if (!el.paused) {
          setViewStart((v) =>
            now < v || now > v + VIEW * 0.85 ? Math.max(0, now - VIEW * 0.2) : v
          )
        }
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  // ---------- Zeilen und ihre Zeiten ----------
  const lineIdx = useMemo(
    () => (rows ?? []).flatMap((r, i) => (r.type === 'line' ? [i] : [])),
    [rows]
  )
  const lines = useMemo(() => lineIdx.map((i) => rows![i] as Line), [lineIdx, rows])

  /** Zeiten wie in der Show: eingepasste fest, die übrigen geschätzt dazwischen. */
  const spans: Span[] = useMemo(() => {
    if (!rows || !lines.length) return []
    const aligned = alignLyrics(parseLyrics(serializeRows(rows)), {
      start: 0,
      end: duration || 1
    })
    return lines.map((l, k) => ({
      start: aligned[k]?.start ?? l.time ?? 0,
      end: aligned[k]?.end ?? l.end ?? (l.time ?? 0) + 2,
      fixed: l.time !== undefined
    }))
  }, [rows, lines, duration])

  const setLine = useCallback(
    (k: number, start: number | undefined, end: number | undefined): void => {
      setRows((all) => {
        if (!all) return all
        const target = all.flatMap((r, i) => (r.type === 'line' ? [i] : []))[k]
        return all.map((r, i) =>
          i === target && r.type === 'line'
            ? {
                ...r,
                time: start === undefined ? undefined : round2(Math.max(0, start)),
                end: end === undefined ? undefined : round2(Math.max(0, end))
              }
            : r
        )
      })
      setDirty(true)
      setStatus('')
    },
    []
  )

  const flashLine = (k: number): void => {
    setFlash(k)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(-1), 600)
  }

  // ---------- Abspielen ----------
  const seek = (to: number): void => {
    const el = audio.current
    if (!el) return
    el.currentTime = clamp(to, 0, el.duration || to)
    setTime(el.currentTime)
  }

  /** Mitsingen ab Zeile k: mit Anlauf (ab dem Ende der Zeile davor, sonst 3 s vorher). */
  const singFrom = (k: number): void => {
    const el = audio.current
    if (!el || !spans.length) return
    const at = Math.min(k, spans.length - 1)
    let from = 0
    if (at > 0) {
      from = spans[at - 1].fixed ? spans[at - 1].end - 1.5 : spans[at].start - PRE_ROLL
    }
    stopAt.current = null
    setCursor(at)
    seek(from)
    void el.play()
  }

  const stop = (): void => {
    audio.current?.pause()
    holdFrom.current = null
    setHolding(false)
  }

  /** Eine einzelne Zeile anhören (mit kurzem Rand). */
  const playLine = (k: number): void => {
    const el = audio.current
    const s = spans[k]
    if (!el || !s) return
    seek(s.start - 0.3)
    stopAt.current = s.end + 0.4
    void el.play()
  }

  // ---------- Mitsingen ----------
  const press = (): void => {
    const el = audio.current
    if (!el || el.paused || cursor >= lines.length) return
    holdFrom.current = el.currentTime - REACTION
    setHolding(true)
  }

  const release = (): void => {
    const el = audio.current
    const from = holdFrom.current
    holdFrom.current = null
    setHolding(false)
    if (!el || from === null) return
    const to = el.currentTime - REACTION
    if (to - from < 0.15) return // nur angetippt
    setLine(cursor, from, to)
    flashLine(cursor)
    const next = cursor + 1
    setCursor(next)
    if (next >= lines.length) el.pause()
  }

  const again = (): void => singFrom(Math.max(0, cursor - 1))

  // Leertaste: steht das Lied, startet sie das Mitsingen; läuft es, wird sie gehalten.
  useEffect(() => {
    const isField = (e: KeyboardEvent): boolean => {
      const el = e.target as HTMLElement | null
      return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
    }
    const down = (e: KeyboardEvent): void => {
      if (isField(e)) return
      if (e.key === 'Escape') {
        stop()
        return
      }
      if (e.key !== ' ') return
      e.preventDefault()
      if (e.repeat) return
      if (audio.current?.paused) singFrom(cursor)
      else press()
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key !== ' ' || isField(e)) return
      e.preventDefault()
      release()
    }
    // Nach einem Klick nicht im Knopf bleiben (sonst löst die Leertaste ihn aus).
    const unfocus = (): void => {
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('click', unfocus)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('click', unfocus)
    }
  })

  // ---------- Feinschliff: Ausschnitt folgt Abspielen und Auswahl ----------

  const showLine = (k: number): void => {
    setCursor(k)
    if (spans[k]) setViewStart(Math.max(0, spans[k].start - 3))
  }

  // ---------- Zeichnen ----------
  useEffect(() => {
    const canvas = fineRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
    if (canvas.height !== FINE_HEIGHT * dpr) canvas.height = FINE_HEIGHT * dpr
    const g = canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, FINE_HEIGHT)
    const x = (s: number): number => ((s - viewStart) / VIEW) * w
    const mid = FINE_HEIGHT / 2 + 6

    // Sekunden-Raster
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.font = '10px system-ui, sans-serif'
    for (let s = Math.ceil(viewStart); s < viewStart + VIEW; s++) {
      g.fillStyle = s % 5 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'
      g.fillRect(x(s), 14, 1, FINE_HEIGHT - 14)
      if (s % 5 === 0) {
        g.fillStyle = 'rgba(255,255,255,0.4)'
        g.fillText(clock(s).replace(/\.0$/, ''), x(s) + 3, FINE_HEIGHT - 4)
      }
    }

    // Wellenform
    if (peaks) {
      g.fillStyle = 'rgba(255,255,255,0.4)'
      for (let px = 0; px < w; px++) {
        const a = Math.floor((viewStart + (px / w) * VIEW) / PEAK_STEP)
        const b = Math.max(a + 1, Math.floor((viewStart + ((px + 1) / w) * VIEW) / PEAK_STEP))
        let p = 0
        for (let i = Math.max(0, a); i < Math.min(peaks.length, b); i++) p = Math.max(p, peaks[i])
        const h = p * (FINE_HEIGHT * 0.36)
        g.fillRect(px, mid - h, 1, h * 2)
      }
    }

    // Zeilen als Blöcke
    spans.forEach((s, k) => {
      const x0 = x(s.start)
      const x1 = x(s.end)
      if (x1 < 0 || x0 > w) return
      const selected = k === cursor
      g.fillStyle = s.fixed
        ? selected
          ? 'rgba(99,102,241,0.35)'
          : 'rgba(16,185,129,0.25)'
        : 'rgba(255,255,255,0.06)'
      g.fillRect(x0, 16, x1 - x0, FINE_HEIGHT - 32)
      if (!s.fixed) {
        g.setLineDash([4, 3])
        g.strokeStyle = 'rgba(255,255,255,0.35)'
        g.strokeRect(x0 + 0.5, 16.5, x1 - x0 - 1, FINE_HEIGHT - 33)
        g.setLineDash([])
      } else {
        g.fillStyle = selected ? '#a5b4fc' : '#34d399'
        g.fillRect(x0, 16, 3, FINE_HEIGHT - 32) // Anfang
        g.fillStyle = '#fcd34d'
        g.fillRect(x1 - 3, 16, 3, FINE_HEIGHT - 32) // Ende
      }
      // Text oben im Block
      g.save()
      g.beginPath()
      g.rect(x0 + 4, 0, Math.max(0, x1 - x0 - 8), 16)
      g.clip()
      g.fillStyle = selected ? '#fff' : 'rgba(255,255,255,0.75)'
      g.font = `${selected ? 600 : 400} 11px system-ui, sans-serif`
      g.fillText(lines[k]?.text ?? '', x0 + 4, 11)
      g.restore()
    })

    // Abspielposition
    g.fillStyle = '#fff'
    g.fillRect(x(time) - 1, 0, 2, FINE_HEIGHT)
  })

  useEffect(() => {
    const canvas = overRef.current
    if (!canvas || !duration) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
    if (canvas.height !== OVERVIEW_HEIGHT * dpr) canvas.height = OVERVIEW_HEIGHT * dpr
    const g = canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, OVERVIEW_HEIGHT)
    const x = (s: number): number => (s / duration) * w
    spans.forEach((s, k) => {
      g.fillStyle = s.fixed
        ? k === cursor
          ? '#818cf8'
          : 'rgba(16,185,129,0.8)'
        : 'rgba(255,255,255,0.18)'
      g.fillRect(x(s.start), 6, Math.max(1, x(s.end) - x(s.start) - 1), OVERVIEW_HEIGHT - 12)
    })
    g.strokeStyle = 'rgba(255,255,255,0.7)'
    g.strokeRect(x(viewStart) + 0.5, 0.5, x(VIEW), OVERVIEW_HEIGHT - 1)
    g.fillStyle = '#fff'
    g.fillRect(x(time) - 1, 0, 2, OVERVIEW_HEIGHT)
  })

  // ---------- Maus im Feinschliff ----------
  const hit = (px: number, w: number): { mode: Drag['mode']; line: number } => {
    const x = (s: number): number => ((s - viewStart) / VIEW) * w
    // Ränder haben Vorrang (auch vom Nachbarblock), dann das Innere.
    for (let k = 0; k < spans.length; k++) {
      if (Math.abs(px - x(spans[k].start)) <= EDGE) return { mode: 'start', line: k }
      if (Math.abs(px - x(spans[k].end)) <= EDGE) return { mode: 'end', line: k }
    }
    for (let k = 0; k < spans.length; k++) {
      if (px > x(spans[k].start) && px < x(spans[k].end)) return { mode: 'block', line: k }
    }
    return { mode: 'pan', line: -1 }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = e.currentTarget
    const box = canvas.getBoundingClientRect()
    const px = e.clientX - box.left
    const { mode, line } = hit(px, box.width)
    const s = spans[line]
    const prev = spans[line - 1]
    const next = spans[line + 1]
    drag.current = {
      mode,
      line,
      x: e.clientX,
      moved: false,
      start: s?.start ?? 0,
      end: s?.end ?? 0,
      view: viewStart,
      // Nur eingepasste Nachbarn begrenzen; geschätzte rücken von selbst nach.
      lo: prev?.fixed ? prev.end : 0,
      hi: next?.fixed ? next.start : duration || Infinity
    }
    canvas.setPointerCapture(e.pointerId)
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = e.currentTarget
    const box = canvas.getBoundingClientRect()
    const d = drag.current
    if (!d) {
      const { mode } = hit(e.clientX - box.left, box.width)
      canvas.style.cursor =
        mode === 'start' || mode === 'end' ? 'ew-resize' : mode === 'block' ? 'pointer' : 'grab'
      return
    }
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 3) d.moved = true
    if (!d.moved) return
    const dt = (dx / box.width) * VIEW
    if (d.mode === 'pan') {
      setViewStart(clamp(d.view - dt, 0, Math.max(0, duration - VIEW / 2)))
    } else if (d.mode === 'start') {
      setLine(d.line, clamp(d.start + dt, d.lo, d.end - MIN_LEN), d.end)
    } else if (d.mode === 'end') {
      setLine(d.line, d.start, clamp(d.end + dt, d.start + MIN_LEN, d.hi))
    } else {
      const len = d.end - d.start
      const s = clamp(d.start + dt, d.lo, d.hi - len)
      setLine(d.line, s, s + len)
    }
  }

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) {
      if (d.mode !== 'pan') setCursor(d.line)
      return
    }
    const box = e.currentTarget.getBoundingClientRect()
    if (d.mode === 'pan') seek(viewStart + ((e.clientX - box.left) / box.width) * VIEW)
    else {
      setCursor(d.line)
      playLine(d.line)
    }
  }

  const onOverview = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!duration) return
    const box = e.currentTarget.getBoundingClientRect()
    const at = ((e.clientX - box.left) / box.width) * duration
    setViewStart(clamp(at - VIEW / 2, 0, Math.max(0, duration - VIEW / 2)))
    seek(at)
  }

  // ---------- Speichern ----------
  const save = async (): Promise<void> => {
    if (!rows) return
    const ok = await window.api.saveLyrics(name, serializeRows(rows))
    if (ok) setDirty(false)
    setStatus(ok ? t('ui.karaoke.saved') : t('ui.karaoke.saveFailed'))
  }

  const close = (): void => {
    if (dirty && !window.confirm(t('ui.karaoke.discardConfirm'))) return
    stop()
    onClose()
  }

  const clearAll = (): void => {
    if (!window.confirm(t('ui.karaoke.clearAllConfirm'))) return
    lines.forEach((_, k) => setLine(k, undefined, undefined))
    setCursor(0)
  }

  const done = spans.filter((s) => s.fixed).length
  const allDone = cursor >= lines.length

  return (
    <Card title={t('ui.karaoke.title', { title })}>
      <p className="mb-4 text-xs leading-relaxed text-white/60">{t('ui.karaoke.help')}</p>
      {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
      {!rows && !error && <div className="text-sm text-white/50">{t('ui.karaoke.loading')}</div>}
      {rows && !lines.length && (
        <div className="text-sm text-amber-300">{t('ui.karaoke.noText')}</div>
      )}

      {rows && lines.length > 0 && (
        <>
          {/* ---------- 1. Mitsingen ---------- */}
          <h3 className="mb-2 text-sm font-semibold text-white/85">1 · {t('ui.karaoke.sing')}</h3>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {playing ? (
              <button className={btn} onClick={stop}>
                ⏸ {t('ui.karaoke.stop')}
              </button>
            ) : (
              <button
                className={btn + ' border-indigo-400/60 bg-indigo-500/20'}
                onClick={() => singFrom(allDone ? 0 : cursor)}
                disabled={!duration}
              >
                ▶ {t('ui.karaoke.playFrom')}
              </button>
            )}
            <button className={btn} onClick={again} disabled={!duration || cursor === 0}>
              ↺ {t('ui.karaoke.again')}
            </button>
            <span className="ml-auto text-xs tabular-nums text-white/50">
              {clock(time)} / {clock(duration)}
            </span>
          </div>

          <div className="mb-2 rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-center">
            <div className="truncate text-sm text-white/35">{lines[cursor - 1]?.text ?? ' '}</div>
            <div
              className={`my-1 truncate text-2xl font-bold transition-colors ${
                holding ? 'text-emerald-300' : allDone ? 'text-white/40' : 'text-white'
              }`}
            >
              {allDone ? t('ui.karaoke.allDone') : lines[cursor].text}
            </div>
            <div className="truncate text-sm text-white/55">{lines[cursor + 1]?.text ?? ' '}</div>
          </div>

          <button
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              press()
            }}
            onPointerUp={release}
            onPointerCancel={release}
            disabled={!playing || allDone}
            className={`mb-6 w-full select-none rounded-xl border-2 px-4 py-6 text-base font-semibold transition-colors ${
              holding
                ? 'border-emerald-300 bg-emerald-500/40 text-white'
                : 'border-indigo-400/50 bg-indigo-500/15 text-white/85 hover:bg-indigo-500/25'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {holding
              ? t('ui.karaoke.holding')
              : playing
                ? t('ui.karaoke.hold')
                : t('ui.karaoke.holdIdle')}
          </button>

          {/* ---------- 2. Feinschliff ---------- */}
          <h3 className="mb-1 text-sm font-semibold text-white/85">2 · {t('ui.karaoke.fine')}</h3>
          <p className="mb-2 text-[11px] text-white/45">{t('ui.karaoke.fineHelp')}</p>
          <canvas
            ref={fineRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className="block w-full touch-none rounded-t-lg bg-black/40"
            style={{ height: FINE_HEIGHT }}
          />
          <canvas
            ref={overRef}
            onClick={onOverview}
            className="mb-3 block w-full cursor-pointer rounded-b-lg border-t border-white/10 bg-black/60"
            style={{ height: OVERVIEW_HEIGHT }}
          />

          {/* ---------- Zeilenliste ---------- */}
          <div className="max-h-[32vh] overflow-auto rounded-lg border border-white/10 bg-black/30 p-1.5">
            {lines.map((l, k) => {
              const s = spans[k]
              return (
                <div
                  key={k}
                  onClick={() => showLine(k)}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-sm transition-colors duration-300 ${
                    flash === k
                      ? 'bg-emerald-400/40'
                      : k === cursor
                        ? 'bg-indigo-500/25 ring-1 ring-indigo-400/60'
                        : 'hover:bg-white/5'
                  }`}
                >
                  <span className="w-6 shrink-0 text-right text-xs text-white/35">{k + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-white/85">{l.text}</span>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      s?.fixed ? 'text-emerald-300/90' : 'italic text-white/30'
                    }`}
                  >
                    {s
                      ? `${clock(s.start)} – ${clock(s.end)}${s.fixed ? '' : ' · ' + t('ui.karaoke.estimated')}`
                      : ''}
                  </span>
                  <button
                    title={t('ui.karaoke.listen')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setCursor(k)
                      playLine(k)
                    }}
                    className="shrink-0 rounded border border-white/15 px-1.5 text-[11px] text-white/70 hover:bg-white/10"
                  >
                    ▶
                  </button>
                  <button
                    title={t('ui.karaoke.clearLine')}
                    disabled={!s?.fixed}
                    onClick={(e) => {
                      e.stopPropagation()
                      setLine(k, undefined, undefined)
                    }}
                    className="shrink-0 rounded border border-white/15 px-1.5 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-20"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={btn} onClick={clearAll} disabled={!done}>
          {t('ui.karaoke.clearAll')}
        </button>
        <span className="ml-auto text-xs text-white/50">
          {t('ui.karaoke.progress', { done, total: lines.length })}
          {dirty && <span className="ml-2 text-amber-300">{t('ui.karaoke.unsaved')}</span>}
          {status && <span className="ml-2 text-emerald-300">{status}</span>}
        </span>
        <button
          className={btn + ' border-emerald-400/50 bg-emerald-500/20'}
          onClick={() => void save()}
          disabled={!dirty}
        >
          {t('ui.karaoke.save')}
        </button>
        <button className={btn} onClick={close}>
          {t('ui.karaoke.close')}
        </button>
      </div>
    </Card>
  )
}
