import { describe, expect, it } from 'vitest'
import { pick, pickWeighted, seededRng, shuffle } from './random'

describe('pick', () => {
  it('liefert im fixed-Modus immer min', () => {
    expect(pick({ min: 3, max: 9, mode: 'fixed' })).toBe(3)
  })

  it('bleibt im random-Modus innerhalb der Grenzen, auch bei vertauschten Werten', () => {
    const rng = seededRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = pick({ min: 8, max: 2, mode: 'random' }, rng)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(8)
    }
  })
})

describe('pickWeighted', () => {
  it('ignoriert deaktivierte und gewichtslose Optionen', () => {
    const rng = seededRng(2)
    const opts = [
      { id: 'a', enabled: false, weight: 5 },
      { id: 'b', enabled: true, weight: 0 },
      { id: 'c', enabled: true, weight: 1 }
    ]
    for (let i = 0; i < 100; i++) expect(pickWeighted(opts, rng)).toBe('c')
  })

  it('liefert undefined ohne aktive Option', () => {
    expect(pickWeighted([{ id: 'a', enabled: false, weight: 1 }])).toBeUndefined()
  })

  it('verteilt etwa proportional zum Gewicht', () => {
    const rng = seededRng(3)
    const opts = [
      { id: 'a', enabled: true, weight: 3 },
      { id: 'b', enabled: true, weight: 1 }
    ]
    let a = 0
    for (let i = 0; i < 10000; i++) if (pickWeighted(opts, rng) === 'a') a++
    expect(a / 10000).toBeGreaterThan(0.72)
    expect(a / 10000).toBeLessThan(0.78)
  })
})

describe('shuffle', () => {
  it('behält alle Elemente und verändert das Original nicht', () => {
    const src = [1, 2, 3, 4, 5, 6]
    const out = shuffle(src, seededRng(4))
    expect(out.slice().sort()).toEqual(src)
    expect(src).toEqual([1, 2, 3, 4, 5, 6])
  })
})
