import { describe, expect, it } from 'vitest'
import { seededRng } from '@shared/random'
import { Playlist } from './playlist'

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

  it('liefert undefined ohne Fotos', () => {
    expect(new Playlist([]).next()).toBeUndefined()
  })
})
