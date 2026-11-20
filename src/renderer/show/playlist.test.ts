import { describe, expect, it } from 'vitest'
import { seededRng } from '@shared/random'
import { arrange, freshestAmong, freshFirst, Playlist } from './playlist'

describe('Playlist', () => {
  it('zeigt jedes Foto einmal, bevor eines wiederkommt', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const p = new Playlist(items, seededRng(1))
    const round = Array.from({ length: 5 }, () => p.next())
    expect(round.slice().sort()).toEqual(items)
  })

  it('wiederholt das letzte Foto nicht direkt beim Neumischen', () => {
    const p = new Playlist(['a', 'b', 'c'], seededRng(2))
    let prev = p.next()
    for (let i = 0; i < 300; i++) {
      const cur = p.next()
      expect(cur).not.toBe(prev)
      prev = cur
    }
  })

  it('blättert zurück und wieder vor', () => {
    const p = new Playlist(['a', 'b', 'c', 'd'], seededRng(3))
    const first = p.next()
    const second = p.next()
    expect(p.previous()).toBe(first)
    expect(p.next()).toBe(second)
    expect(p.previous()).toBe(first)
    expect(p.previous()).toBeUndefined()
  })

  it('springt mit before() vor ein Foto und spielt danach weiter', () => {
    const p = new Playlist(['a', 'b', 'c', 'd'], seededRng(5))
    const shown = [p.next(), p.next(), p.next()]
    expect(p.before(shown[2]!)).toBe(shown[1])
    expect(p.next()).toBe(shown[2])
    expect(p.before(shown[0]!)).toBeUndefined()
  })

  it('zeigt hervorgehobene Fotos öfter, aber nie direkt hintereinander', () => {
    const p = new Playlist(['a', 'b', 'c', 'd', 'e', 'f'], seededRng(6))
    p.setBoost(['a'], 2)
    const out = Array.from({ length: 80 }, () => p.next())
    const share = out.filter((x) => x === 'a').length / out.length
    expect(share).toBeGreaterThan(0.3)
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1])
  })

  it('ordnet ohne direkte Dopplung an, auch über die Rundengrenze', () => {
    const rng = seededRng(7)
    for (let n = 0; n < 200; n++) {
      const pool = ['a', 'a', 'a', 'b', 'c', 'd', 'e']
      const out = arrange(pool, 'a', rng)
      expect(out.slice().sort()).toEqual(pool.slice().sort())
      expect(out[0]).not.toBe('a')
      for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1])
    }
  })

  it('hält zwischen zwei Auftritten desselben Fotos mindestens eine halbe Runde Abstand', () => {
    const items = Array.from({ length: 20 }, (_, i) => `f${i}`)
    const p = new Playlist(items, seededRng(8))
    const out = Array.from({ length: 400 }, () => p.next()!)
    const last = new Map<string, number>()
    let minGap = Infinity
    out.forEach((name, i) => {
      if (last.has(name)) minGap = Math.min(minGap, i - last.get(name)!)
      last.set(name, i)
    })
    expect(minGap).toBeGreaterThanOrEqual(10)
  })

  it('ohne avoidRepeats nur ohne direkte Wiederholung (früheres Verhalten)', () => {
    const items = Array.from({ length: 20 }, (_, i) => `f${i}`)
    const p = new Playlist(items, seededRng(8))
    p.avoidRepeats = false
    const out = Array.from({ length: 400 }, () => p.next()!)
    const last = new Map<string, number>()
    let minGap = Infinity
    out.forEach((name, i) => {
      if (last.has(name)) minGap = Math.min(minGap, i - last.get(name)!)
      last.set(name, i)
    })
    expect(minGap).toBeGreaterThanOrEqual(2)
    expect(minGap).toBeLessThan(10)
  })

  it('stellt Fotos aus früheren Shows nach hinten', () => {
    const items = Array.from({ length: 10 }, (_, i) => `f${i}`)
    const p = new Playlist(items, seededRng(9))
    p.setRecent(['f0', 'f1', 'f2', 'f3', 'f4'])
    const round = Array.from({ length: 10 }, () => p.next()!)
    expect(round.slice(0, 5).sort()).toEqual(['f5', 'f6', 'f7', 'f8', 'f9'])
  })

  it('nimmt ein von außen gezeigtes Foto aus der laufenden Runde', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f']
    const p = new Playlist(items, seededRng(10))
    const first = p.next()!
    const later = items.find((n) => n !== first)!
    p.shownExternally(later)
    const rest = Array.from({ length: 4 }, () => p.next())
    expect(rest).not.toContain(later)
    expect(new Set([first, later, ...rest]).size).toBe(6)
  })

  it('wählt unter gleich guten Kandidaten den am längsten nicht gezeigten', () => {
    // Kandidat 0 liegt am besten, 1 fast so gut und lange nicht gezeigt, 2 zu schlecht.
    expect(freshestAmong([1, 0.9, 0.2], [3, 50, 999], 0.2)).toBe(1)
    expect(freshestAmong([1, 0.9, 0.2], [3, 50, 999], 0)).toBe(0)
    expect(freshestAmong([0.5, 0.5], [Infinity, Infinity], 0.2)).toBe(0)
  })

  it('freshFirst legt kürzlich Gezeigtes ans Ende', () => {
    const age = (n: string): number => ({ a: 0, b: 1, c: 2 })[n] ?? Infinity
    const out = freshFirst(['a', 'b', 'c', 'd', 'e', 'f'], age, seededRng(11))
    expect(out.slice(3).sort()).toEqual(['a', 'b', 'c'])
  })

  it('liefert undefined ohne Fotos', () => {
    expect(new Playlist([]).next()).toBeUndefined()
  })
})
