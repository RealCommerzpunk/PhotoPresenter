import { describe, expect, it } from 'vitest'
import {
  alignLyrics,
  estimateVocalWindow,
  formatStamp,
  lineIndexAt,
  parseLyrics,
  parseRows,
  serializeRows,
  syllables
} from './lyrics'

const SAMPLE = `Lieber Henry – Dein Geburtstag

[Verse 1]

Zeile eins im ersten Teil,
Zeile zwei im ersten Teil.

[Chorus]

Hoch soll er leben,
hoch soll er leben!
`

describe('parseLyrics', () => {
  it('trennt Überschrift, Abschnittsmarken und Strophen', () => {
    const p = parseLyrics(SAMPLE)
    expect(p.title).toBe('Lieber Henry – Dein Geburtstag')
    expect(p.lines.map((l) => l.text)).toEqual([
      'Zeile eins im ersten Teil,',
      'Zeile zwei im ersten Teil.',
      'Hoch soll er leben,',
      'hoch soll er leben!'
    ])
    expect(p.lines.map((l) => l.stanza)).toEqual([0, 0, 1, 1])
    expect(p.lines[2].section).toBe('Chorus')
    expect(p.timed).toBe(false)
  })

  it('nimmt keine Überschrift an, wenn gleich ein Abschnitt beginnt', () => {
    const p = parseLyrics('[Verse]\n\nEins\nZwei')
    expect(p.title).toBe('')
    expect(p.lines).toHaveLength(2)
  })

  it('liest Zeitmarken im LRC-Stil', () => {
    const p = parseLyrics('[00:05.50] Hallo\n[01:02.00] Welt\n[01:10.00]\n')
    expect(p.timed).toBe(true)
    expect(p.lines.map((l) => l.time)).toEqual([5.5, 62])
  })
})

describe('alignLyrics', () => {
  it('verteilt die Zeilen nach Silben über das Fenster, lückenlos aufsteigend', () => {
    const lines = alignLyrics(parseLyrics(SAMPLE), { start: 10, end: 70 })
    expect(lines[0].start).toBeCloseTo(10, 5)
    for (let i = 1; i < lines.length; i++) expect(lines[i].start).toBeGreaterThan(lines[i - 1].end)
    expect(lines[lines.length - 1].end).toBeLessThanOrEqual(70)
    // Längere Zeilen bekommen mehr Zeit.
    const a = lines[2].end - lines[2].start
    const b = lines[0].end - lines[0].start
    expect(b).toBeGreaterThan(a)
  })

  it('lässt zwischen Strophen eine Pause', () => {
    const lines = alignLyrics(parseLyrics(SAMPLE), { start: 0, end: 60 })
    const within = lines[1].start - lines[0].end
    const between = lines[2].start - lines[1].end
    expect(between).toBeGreaterThan(within)
  })

  it('übernimmt Zeitmarken und verschiebt um den Versatz', () => {
    const lines = alignLyrics(parseLyrics('[00:10] A\n[00:20] B'), { start: 0, end: 1 }, 2)
    expect(lines.map((l) => l.start)).toEqual([12, 22])
  })

  it('findet die laufende Zeile', () => {
    const lines = alignLyrics(parseLyrics(SAMPLE), { start: 10, end: 70 })
    expect(lineIndexAt(lines, 5)).toBe(-1)
    expect(lineIndexAt(lines, 10)).toBe(0)
    expect(lineIndexAt(lines, 69)).toBe(3)
  })
})

describe('syllables / estimateVocalWindow', () => {
  it('zählt Vokalgruppen, mindestens 2', () => {
    // Vokalgruppen: Hoch, soll, er, le, ben
    expect(syllables('Hoch soll er leben')).toBe(5)
    expect(syllables('Ja')).toBe(2)
  })

  it('schätzt Anfang und Ende aus der Lautstärke', () => {
    // 100 s, die ersten 2 s und die letzten 5 s still
    const db = Array.from({ length: 1000 }, (_, i) => (i < 20 || i >= 950 ? -80 : -20))
    const w = estimateVocalWindow(db, 0.1, 100)
    expect(w.start).toBeGreaterThan(4)
    expect(w.start).toBeLessThan(8)
    expect(w.end).toBeLessThan(95)
    expect(w.end).toBeGreaterThan(w.start)
  })
})

describe('Zeilen lesen und schreiben', () => {
  const FILE = `Titel

[Verse 1]

[00:12.50] Eins
[00:15.00]
Zwei

[Chorus]
[01:00.00] Drei
`

  it('hält Marken, Enden und Struktur beim Zurückschreiben', () => {
    const rows = parseRows(FILE)
    expect(rows[0]).toEqual({ type: 'title', text: 'Titel' })
    const lines = rows.filter((r) => r.type === 'line')
    expect(lines).toEqual([
      { type: 'line', text: 'Eins', time: 12.5, end: 15 },
      { type: 'line', text: 'Zwei' },
      { type: 'line', text: 'Drei', time: 60 }
    ])
    expect(serializeRows(rows)).toBe(FILE)
  })

  it('formatiert Marken', () => {
    expect(formatStamp(83.456)).toBe('[01:23.46]')
    expect(formatStamp(0)).toBe('[00:00.00]')
  })
})

describe('Teilweise Zeitmarken', () => {
  const parsed = parseLyrics(
    '[Verse]\n[00:20.00] A eins\nB zwei\nC drei\n[00:40.00] D vier\nE fünf\nF sechs\n'
  )

  it('verteilt freie Zeilen zwischen festen Marken', () => {
    const l = alignLyrics(parsed, { start: 10, end: 80 })
    expect(l[0].start).toBeCloseTo(20, 5)
    expect(l[3].start).toBeCloseTo(40, 5)
    // B und C liegen zwischen A und D
    expect(l[1].start).toBeGreaterThan(l[0].start)
    expect(l[2].start).toBeGreaterThan(l[1].start)
    expect(l[2].end).toBeLessThanOrEqual(40)
    // E und F nach D, vor dem Ende des Fensters
    expect(l[4].start).toBeGreaterThan(40)
    expect(l[5].end).toBeLessThanOrEqual(80.001)
  })

  it('beachtet eine Endmarke (Pause danach)', () => {
    const p = parseLyrics('[00:10.00] A\n[00:12.00]\n[00:30.00] B\n')
    const l = alignLyrics(p, { start: 0, end: 60 })
    expect(l[0].end).toBeCloseTo(12, 5)
    expect(l[0].fixedEnd).toBe(true)
    expect(l[1].start).toBeCloseTo(30, 5)
  })

  it('verteilt Zeilen vor der ersten Marke davor', () => {
    const p = parseLyrics('Vorher eins\nVorher zwei\n[00:30.00] Marke\n')
    const l = alignLyrics(p, { start: 5, end: 60 })
    expect(l[0].start).toBeGreaterThanOrEqual(0)
    expect(l[1].end).toBeLessThanOrEqual(30)
    expect(l[2].start).toBeCloseTo(30, 5)
  })
})
