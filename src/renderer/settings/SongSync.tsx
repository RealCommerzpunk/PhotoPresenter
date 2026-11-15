import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { alignLyrics, parseLyrics, parseRows, serializeRows, type LyricRow } from '@shared/lyrics'
import { Card } from './controls'

/** So lange (ms) spielt das Probehören nach einem Schritt. */
const AUDITION_MS = 450

/** Reaktionszeit beim Klicken: die Marke wird so viel früher gesetzt (Sekunden). */
const DEFAULT_LEAD = 0.15

const btn =
  'rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
const small =
  'rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11px] text-white/70 hover:bg-white/10'

/** Sekunden als „m:ss.t“. */
function clock(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

const round2 = (n: number): number => Math.round(n * 100) / 100

type Lines = Extract<LyricRow, { type: 'line' }>

/**
 * Karaoke-Zeiten setzen: Lied hören und bei jeder Zeile klicken. Die Marken landen als
 * „[mm:ss.xx]“ in der TXT. Ausgelassene Zeilen bleiben ohne Marke (werden zwischen den
 * Nachbarn verteilt), so lässt sich ein Lied Stück für Stück bearbeiten.
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
  const [hasText, setHasText] = useState(true)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [cursor, setCursor] = useState(-1)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [lead, setLead] = useState(DEFAULT_LEAD)
  /** Zuletzt gesetzte Marke: die Zeile leuchtet kurz auf (grün = Anfang, gelb = Ende). */
  const [flash, setFlash] = useState<{ row: number; kind: 'start' | 'end' } | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  /** Probehören nach einem Schritt: Ausgangsstelle (sonst null) und Zeitgeber. */
  const auditionFrom = useRef<number | null>(null)
  const auditionTimer = useRef<number | undefined>(undefined)
  const [snippet, setSnippet] = useState(true)

  const flashRow = useCallback((row: number, kind: 'start' | 'end'): void => {
    setFlash({ row, kind })
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 700)
  }, [])

  // Lied laden
  useEffect(() => {
    let url = ''
    let alive = true
    void window.api.readSong(name).then((data) => {
      if (!alive) return
      if (!data) {
        setError(t('ui.sync.loadFailed'))
        return
      }
      const parsed = parseRows(data.lyrics)
      setHasText(parsed.some((r) => r.type === 'line'))
      setRows(parsed)
      setCursor(parsed.findIndex((r) => r.type === 'line' && r.time === undefined))
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
    })
    const tick = window.setInterval(() => {
      if (audio.current) setTime(audio.current.currentTime)
    }, 80)
    return () => {
      alive = false
      window.clearInterval(tick)
      audio.current?.pause()
      audio.current = null
      if (url) URL.revokeObjectURL(url)
    }
  }, [name])

  const change = useCallback((fn: (rows: LyricRow[]) => LyricRow[]): void => {
    setRows((r) => (r ? fn(r) : r))
    setDirty(true)
    setStatus('')
  }, [])

  const lineIdx = useMemo(
    () => (rows ?? []).flatMap((r, i) => (r.type === 'line' ? [i] : [])),
    [rows]
  )
  const stamped = lineIdx.filter((i) => (rows?.[i] as Lines).time !== undefined).length

  const seekTo = useCallback((to: number): void => {
    const el = audio.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(to, el.duration || to))
    setTime(el.currentTime)
  }, [])

  /** Kurzes Probehören nach einem Schritt ist zu Ende (oder wird abgebrochen): zurück zur Stelle. */
  const endAudition = useCallback((): void => {
    window.clearTimeout(auditionTimer.current)
    const el = audio.current
    if (!el || auditionFrom.current === null) return
    el.pause()
    el.currentTime = auditionFrom.current
    setTime(el.currentTime)
    auditionFrom.current = null
  }, [])

  const togglePlay = useCallback((): void => {
    const el = audio.current
    if (!el) return
    if (auditionFrom.current !== null) endAudition()
    if (el.paused) void el.play()
    else el.pause()
  }, [endAudition])

  /**
   * Um `delta` Sekunden springen. Steht das Lied still, hört man ab der neuen Stelle kurz hinein
   * (und die Position bleibt dort), so findet man Anfang und Ende genau.
   */
  const step = useCallback(
    (delta: number): void => {
      const el = audio.current
      if (!el) return
      const base = auditionFrom.current ?? el.currentTime
      endAudition()
      const to = Math.max(0, Math.min(base + delta, el.duration || base + delta))
      el.currentTime = to
      setTime(to)
      if (el.paused && snippet) {
        auditionFrom.current = to
        void el.play()
        auditionTimer.current = window.setTimeout(endAudition, AUDITION_MS)
      }
    },
    [endAudition, snippet]
  )

  /**
   * Zeitpunkt für eine Marke: steht das Lied still (auch beim Probehören), genau die Stelle;
   * läuft es, die Stelle minus Reaktionszeit.
   */
  const markTime = useCallback((): number => {
    const el = audio.current
    if (!el) return 0
    const exact = auditionFrom.current ?? (el.paused ? el.currentTime : null)
    return round2(Math.max(0, exact ?? el.currentTime - lead))
  }, [lead])

  const nextLineAfter = useCallback(
    (from: number): number => {
      const next = lineIdx.find((i) => i > from)
      return next ?? from
    },
    [lineIdx]
  )

  /** Zeile unter dem Cursor beginnt jetzt. */
  const stamp = useCallback((): void => {
    if (!rows || cursor < 0 || rows[cursor]?.type !== 'line') return
    const at = markTime()
    change((r) =>
      r.map((row, i) => {
        if (i !== cursor || row.type !== 'line') return row
        const end = row.end !== undefined && row.end <= at ? undefined : row.end
        return { ...row, time: at, end }
      })
    )
    flashRow(cursor, 'start')
    setCursor(nextLineAfter(cursor))
  }, [rows, cursor, markTime, change, nextLineAfter, flashRow])

  /** Die zuletzt gesetzte Zeile vor dem Cursor hört jetzt auf (Pause, reine Musik). */
  const stampEnd = useCallback((): void => {
    if (!rows) return
    const at = markTime()
    let target = -1
    for (const i of lineIdx) {
      if (cursor >= 0 && i >= cursor) break
      if ((rows[i] as Lines).time !== undefined) target = i
    }
    if (target < 0) return
    const start = (rows[target] as Lines).time ?? 0
    if (at <= start) return
    change((r) =>
      r.map((row, i) => (i === target && row.type === 'line' ? { ...row, end: at } : row))
    )
    flashRow(target, 'end')
  }, [rows, cursor, markTime, lineIdx, change, flashRow])

  const clearLine = useCallback(
    (index: number): void =>
      change((r) =>
        r.map((row, i) =>
          i === index && row.type === 'line' ? { ...row, time: undefined, end: undefined } : row
        )
      ),
    [change]
  )

  const clearFrom = useCallback(
    (index: number): void =>
      change((r) =>
        r.map((row, i) =>
          i >= index && row.type === 'line' ? { ...row, time: undefined, end: undefined } : row
        )
      ),
    [change]
  )

  const shiftRows = useCallback(
    (from: number, to: number, delta: number): void =>
      change((r) =>
        r.map((row, i) => {
          if (i < from || i > to || row.type !== 'line') return row
          return {
            ...row,
            time: row.time !== undefined ? round2(Math.max(0, row.time + delta)) : undefined,
            end: row.end !== undefined ? round2(Math.max(0, row.end + delta)) : undefined
          }
        })
      ),
    [change]
  )

  /** Von der Zeile davor hören, damit man den Anlauf mitbekommt. */
  const listenFromHere = useCallback((): void => {
    if (!rows || cursor < 0) return
    let before: number | undefined
    for (const i of lineIdx) {
      if (i >= cursor) break
      const tm = (rows[i] as Lines).time
      if (tm !== undefined) before = tm
    }
    const own = (rows[cursor] as Lines).time
    seekTo((before ?? (own !== undefined ? own - 3 : 0)) - 0.5)
    void audio.current?.play()
  }, [rows, cursor, lineIdx, seekTo])

  const moveCursor = useCallback(
    (dir: 1 | -1): void => {
      const pos = lineIdx.indexOf(cursor)
      const next = lineIdx[Math.min(lineIdx.length - 1, Math.max(0, (pos < 0 ? 0 : pos) + dir))]
      if (next !== undefined) setCursor(next)
    },
    [lineIdx, cursor]
  )

  const save = useCallback(async (): Promise<void> => {
    if (!rows) return
    const ok = await window.api.saveLyrics(name, serializeRows(rows))
    if (ok) setDirty(false)
    setStatus(ok ? t('ui.sync.saved') : t('ui.sync.saveFailed'))
  }, [rows, name])

  const close = (): void => {
    if (dirty && !window.confirm(t('ui.sync.discardConfirm'))) return
    onClose()
  }

  // Tasten (nicht in Eingabefeldern)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) &&
        target.getAttribute('type') !== 'range'
      ) {
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key
      if (key === ' ') togglePlay()
      else if (key === 'ArrowUp' || key === 'Enter')
        stamp() // Anfang der Zeile
      else if (key === 'ArrowDown' || key === 'e' || key === 'E')
        stampEnd() // Ende der Zeile
      else if (key === 'ArrowLeft') step(e.shiftKey ? -2 : -0.5)
      else if (key === 'ArrowRight') step(e.shiftKey ? 2 : 0.5)
      else if (key === 'PageDown') moveCursor(1)
      else if (key === 'PageUp') moveCursor(-1)
      else if ((key === 'Backspace' || key === 'Delete') && cursor >= 0) clearLine(cursor)
      else return
      e.preventDefault()
    }
    // Nach einem Klick auf einen Knopf nicht im Knopf bleiben, sonst löst Enter/Leertaste ihn erneut aus.
    const unfocus = (): void => {
      const active = document.activeElement
      if (active instanceof HTMLButtonElement) active.blur()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', unfocus)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', unfocus)
    }
  }, [togglePlay, stamp, stampEnd, moveCursor, step, clearLine, cursor])

  // Cursorzeile im Blick halten
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cursor])

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate
  }, [rate, rows])

  // Welche Zeile ist gerade zu hören? (letzte gesetzte vor der Abspielposition)
  let playingRow = -1
  if (rows) {
    for (const i of lineIdx) {
      const tm = (rows[i] as Lines).time
      if (tm !== undefined && tm <= time) playingRow = i
    }
  }

  // Wie die Show den Text zeitlich legt (gesetzte Marken fest, der Rest geschätzt dazwischen).
  const aligned = useMemo(
    () =>
      rows ? alignLyrics(parseLyrics(serializeRows(rows)), { start: 0, end: duration || 1 }) : [],
    [rows, duration]
  )
  const alignedOf = (rowIndex: number): (typeof aligned)[number] | undefined =>
    aligned.length === lineIdx.length ? aligned[lineIdx.indexOf(rowIndex)] : undefined
  const k =
    aligned.length === lineIdx.length ? aligned.filter((l) => l.start <= time).length - 1 : -1

  const sectionRange = (index: number): [number, number] => {
    const all = rows ?? []
    let to = all.length - 1
    for (let i = index + 1; i < all.length; i++) {
      if (all[i].type === 'section') {
        to = i - 1
        break
      }
    }
    return [index + 1, to]
  }

  let prevTime = -1
  return (
    <Card title={t('ui.sync.title', { title })}>
      <p className="mb-3 text-xs leading-relaxed text-white/60">{t('ui.sync.help')}</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={btn} onClick={togglePlay} disabled={!duration}>
          {playing ? '⏸ ' + t('ui.sync.pause') : '▶ ' + t('ui.sync.play')}
        </button>
        <button className={btn} onClick={() => step(-0.5)} disabled={!duration}>
          ← 0,5 s
        </button>
        <button className={btn} onClick={() => step(0.5)} disabled={!duration}>
          0,5 s →
        </button>
        <button
          className={btn + ' border-indigo-400/60 bg-indigo-500/20'}
          onClick={stamp}
          disabled={cursor < 0}
        >
          {t('ui.sync.stamp')}
        </button>
        <button className={btn} onClick={stampEnd} title={t('ui.sync.endTitle')}>
          {t('ui.sync.end')}
        </button>
        <label
          className="ml-auto flex items-center gap-2 text-xs text-white/60"
          title={t('ui.sync.snippetTitle')}
        >
          <input
            type="checkbox"
            checked={snippet}
            onChange={(e) => setSnippet(e.target.checked)}
            className="accent-indigo-500"
          />
          {t('ui.sync.snippet')}
        </label>
        <label className="flex items-center gap-2 text-xs text-white/60">
          {t('ui.sync.speed')}
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm"
          >
            {[0.5, 0.75, 1].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex items-center gap-2 text-xs text-white/60"
          title={t('ui.sync.leadTitle')}
        >
          {t('ui.sync.lead')}
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={lead}
            onChange={(e) => setLead(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
            className="w-16 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm"
          />
          s
        </label>
      </div>

      <div className="mb-3 flex items-center gap-3 text-sm text-white/70">
        <span className="w-14 tabular-nums">{clock(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(time, duration || 1)}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="flex-1 accent-indigo-500"
        />
        <span className="w-14 text-right tabular-nums text-white/40">{clock(duration)}</span>
      </div>

      {rows && aligned.length > 0 && aligned.length === lineIdx.length && (
        <div className="mb-3 rounded-lg border border-white/10 bg-black/40 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">
            {t('ui.sync.preview')}
          </div>
          <div className="space-y-0.5 text-center">
            <div className="truncate text-xs text-white/35">{aligned[k - 1]?.text ?? ' '}</div>
            {k >= 0 && time <= aligned[k].end + 1 ? (
              <div
                className="truncate text-xl font-bold"
                style={{
                  backgroundImage: `linear-gradient(90deg, #ffd54a ${(
                    Math.min(
                      1,
                      Math.max(
                        0,
                        (time - aligned[k].start) / Math.max(0.1, aligned[k].end - aligned[k].start)
                      )
                    ) * 100
                  ).toFixed(1)}%, #ffffff 0)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent'
                }}
              >
                {aligned[k].text}
              </div>
            ) : (
              <div className="text-xl font-bold text-white/40">{k >= 0 ? '♪ ♪ ♪' : ' '}</div>
            )}
            <div className="truncate text-sm text-white/60">{aligned[k + 1]?.text ?? ' '}</div>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-white/40">
              <span>{t('ui.sync.timeline')}</span>
              <span>{t('ui.sync.legend')}</span>
            </div>
            <div
              className="relative h-9 cursor-pointer overflow-hidden rounded bg-white/5"
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect()
                seekTo(((e.clientX - box.left) / box.width) * (duration || 0))
              }}
            >
              {duration > 0 &&
                aligned.map((l, n) => {
                  const row = rows[lineIdx[n]] as Lines
                  const set = row.time !== undefined
                  return (
                    <div
                      key={n}
                      title={`${clock(l.start)} – ${clock(l.end)}  ${l.text}`}
                      className={`absolute top-1 bottom-1 rounded-sm ${
                        set
                          ? row.end !== undefined
                            ? 'border-r-2 border-amber-300 bg-emerald-500/70'
                            : 'bg-emerald-500/70'
                          : 'border border-dashed border-white/30 bg-white/10'
                      } ${lineIdx[n] === cursor ? 'ring-2 ring-indigo-300' : ''} ${
                        n === k && playing ? 'brightness-150' : ''
                      }`}
                      style={{
                        left: `${(l.start / duration) * 100}%`,
                        width: `${Math.max(0.25, ((l.end - l.start) / duration) * 100)}%`
                      }}
                    />
                  )
                })}
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white"
                style={{ left: `${duration ? (time / duration) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
      {rows && !hasText && <div className="mb-2 text-sm text-amber-300">{t('ui.sync.noText')}</div>}

      <div
        ref={listRef}
        className="max-h-[46vh] overflow-auto rounded-lg border border-white/10 bg-black/30 p-2"
      >
        {!rows && !error && <div className="p-3 text-sm text-white/50">{t('ui.sync.loading')}</div>}
        {rows?.map((row, i) => {
          if (row.type === 'title') {
            return (
              <div key={i} className="px-2 py-1 text-sm font-semibold text-white/80">
                {row.text}
              </div>
            )
          }
          if (row.type === 'blank') return <div key={i} className="h-2" />
          if (row.type === 'section') {
            const [from, to] = sectionRange(i)
            return (
              <div key={i} className="mt-1 flex items-center gap-2 px-2 pt-2 text-xs text-white/50">
                <span className="font-medium uppercase tracking-wide">{row.text}</span>
                <button className={small} onClick={() => shiftRows(from, to, -0.5)}>
                  −0,5 s
                </button>
                <button className={small} onClick={() => shiftRows(from, to, 0.5)}>
                  +0,5 s
                </button>
                <span className="text-white/30">{t('ui.sync.shiftSection')}</span>
              </div>
            )
          }
          const bad = row.time !== undefined && row.time < prevTime
          if (row.time !== undefined) prevTime = row.time
          return (
            <div
              key={i}
              data-row={i}
              onClick={() => setCursor(i)}
              className={`group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors duration-300 ${
                flash?.row === i
                  ? flash.kind === 'start'
                    ? 'bg-emerald-400/45'
                    : 'bg-amber-300/45'
                  : i === cursor
                    ? 'bg-indigo-500/25 ring-1 ring-indigo-400/60'
                    : i === playingRow && playing
                      ? 'bg-emerald-500/15'
                      : 'hover:bg-white/5'
              }`}
            >
              <button
                title={bad ? t('ui.sync.order') : t('ui.sync.jump')}
                onClick={(e) => {
                  e.stopPropagation()
                  setCursor(i)
                  if (row.time !== undefined) seekTo(row.time - 1.5)
                }}
                className={`w-16 shrink-0 rounded px-1 py-0.5 text-center text-xs tabular-nums ${
                  row.time === undefined
                    ? 'text-white/25'
                    : bad
                      ? 'bg-red-500/30 text-red-100'
                      : 'bg-white/10 text-white/80'
                }`}
              >
                {row.time === undefined ? '—' : clock(row.time)}
              </button>
              <span
                className={`min-w-0 flex-1 ${i === playingRow ? 'text-white' : 'text-white/75'}`}
              >
                {row.text}
              </span>
              {row.end !== undefined ? (
                <span className="shrink-0 text-[11px] text-amber-200/80">
                  {t('ui.sync.endAt', { time: clock(row.end) })}
                </span>
              ) : (
                row.time !== undefined &&
                alignedOf(i) && (
                  <span className="shrink-0 text-[11px] italic text-white/30">
                    {t('ui.sync.endAuto', { time: clock(alignedOf(i)!.end) })}
                  </span>
                )
              )}
              {row.time !== undefined && alignedOf(i) && i === playingRow && (
                <span
                  className="pointer-events-none absolute bottom-0 left-2 h-0.5 rounded bg-emerald-400"
                  style={{
                    width: `calc((100% - 1rem) * ${Math.min(
                      1,
                      Math.max(
                        0,
                        (time - alignedOf(i)!.start) /
                          Math.max(0.1, alignedOf(i)!.end - alignedOf(i)!.start)
                      )
                    ).toFixed(3)})`
                  }}
                />
              )}
              <span className="hidden shrink-0 items-center gap-1 group-hover:flex">
                {row.time !== undefined && (
                  <>
                    <button
                      className={small}
                      onClick={(e) => {
                        e.stopPropagation()
                        shiftRows(i, i, -0.1)
                      }}
                    >
                      −0,1
                    </button>
                    <button
                      className={small}
                      onClick={(e) => {
                        e.stopPropagation()
                        shiftRows(i, i, 0.1)
                      }}
                    >
                      +0,1
                    </button>
                  </>
                )}
                <button
                  className={small}
                  onClick={(e) => {
                    e.stopPropagation()
                    clearLine(i)
                  }}
                  title={t('ui.sync.clearLine')}
                >
                  ✕
                </button>
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={btn} onClick={listenFromHere} disabled={cursor < 0}>
          {t('ui.sync.fromHere')}
        </button>
        <button className={btn} onClick={() => clearFrom(cursor)} disabled={cursor < 0}>
          {t('ui.sync.clearFrom')}
        </button>
        <button
          className={btn}
          onClick={() => window.confirm(t('ui.sync.clearAllConfirm')) && clearFrom(0)}
        >
          {t('ui.sync.clearAll')}
        </button>
        <span className="ml-auto text-xs text-white/50">
          {t('ui.sync.progress', { done: stamped, total: lineIdx.length })}
          {dirty && <span className="ml-2 text-amber-300">{t('ui.sync.unsaved')}</span>}
          {status && <span className="ml-2 text-emerald-300">{status}</span>}
        </span>
        <button
          className={btn + ' border-emerald-400/50 bg-emerald-500/20'}
          onClick={() => void save()}
          disabled={!dirty}
        >
          {t('ui.sync.save')}
        </button>
        <button className={btn} onClick={close}>
          {t('ui.sync.close')}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-white/35">{t('ui.sync.keys')}</div>
    </Card>
  )
}
