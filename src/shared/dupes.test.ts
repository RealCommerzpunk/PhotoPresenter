import { describe, expect, it } from 'vitest'
import {
  findDuplicates,
  grayFromRgba,
  hammingDistance,
  HASH_SIZE,
  phashFromGray,
  type HashedPhoto
} from './dupes'

/** Künstliches Graustufenbild mit Mustern; `noise` verändert es leicht. */
function picture(seed: number, noise = 0): number[] {
  const n = HASH_SIZE
  const out: number[] = []
  let r = seed * 9301 + 49297
  const rand = (): number => (r = (r * 9301 + 49297) % 233280) / 233280
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const base =
        128 +
        60 * Math.sin((x * (seed + 1)) / 7) +
        50 * Math.cos((y * (seed + 2)) / 5) +
        30 * Math.sin(((x + y) * seed) / 11)
      out.push(base + (rand() - 0.5) * noise)
    }
  }
  return out
}

describe('phashFromGray', () => {
  it('liefert 16 Hex-Zeichen und ist stabil', () => {
    const h = phashFromGray(picture(3))
    expect(h).toMatch(/^[0-9a-f]{16}$/)
    expect(phashFromGray(picture(3))).toBe(h)
  })

  it('ändert sich bei leichtem Rauschen und Helligkeit kaum, bei anderem Bild stark', () => {
    const a = phashFromGray(picture(3))
    const noisy = phashFromGray(picture(3, 12))
    const brighter = phashFromGray(picture(3).map((v) => v * 1.1 + 8))
    const other = phashFromGray(picture(7))
    expect(hammingDistance(a, noisy)).toBeLessThanOrEqual(4)
    expect(hammingDistance(a, brighter)).toBeLessThanOrEqual(2)
    expect(hammingDistance(a, other)).toBeGreaterThan(12)
  })

  it('verlangt genau 32 × 32 Werte', () => {
    expect(() => phashFromGray([1, 2, 3])).toThrow()
  })
})

describe('grayFromRgba', () => {
  it('rechnet Helligkeit nach BT.601', () => {
    const g = grayFromRgba([255, 0, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
    expect(g[0]).toBeCloseTo(76.245)
    expect(g[1]).toBeCloseTo(29.07)
    expect(g[2]).toBeCloseTo(255)
  })
})

describe('hammingDistance', () => {
  it('zählt unterschiedliche Bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0)
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64)
    expect(hammingDistance('8000000000000001', '0000000000000000')).toBe(2)
  })
})

describe('findDuplicates', () => {
  const photo = (name: string, phash: string, w: number, h: number, size = 1000): HashedPhoto => ({
    name,
    phash,
    w,
    h,
    size
  })

  it('gruppiert gleiche Fotos und behält das hochauflösendste', () => {
    const groups = findDuplicates([
      photo('a-klein.jpg', 'f0f0f0f0f0f0f0f0', 1280, 853),
      photo('a.jpg', 'f0f0f0f0f0f0f0f1', 4000, 2667),
      photo('a-kopie.jpg', 'f0f0f0f0f0f0f0f0', 4000, 2667, 900),
      photo('b.jpg', '0f0f0f0f0f0f0f0f', 4000, 2667)
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].keep.name).toBe('a.jpg')
    expect(groups[0].others.map((p) => p.name)).toEqual(['a-kopie.jpg', 'a-klein.jpg'])
  })

  it('trennt Fotos mit anderem Seitenverhältnis oder zu großem Abstand', () => {
    expect(
      findDuplicates([
        photo('quer.jpg', 'f0f0f0f0f0f0f0f0', 4000, 2667),
        photo('hoch.jpg', 'f0f0f0f0f0f0f0f0', 2667, 4000),
        photo('fern.jpg', 'f0f0f0f0f0f0ffff', 4000, 2667)
      ])
    ).toEqual([])
  })

  it('behält bei gleichem Inhalt den Namen, der nicht nach Kopie aussieht', () => {
    const same = (name: string): HashedPhoto => photo(name, 'f0f0f0f0f0f0f0f0', 4000, 2667, 1000)
    expect(findDuplicates([same('IMG_0001 - Kopie.jpg'), same('IMG_0001.jpg')])[0].keep.name).toBe(
      'IMG_0001.jpg'
    )
    expect(findDuplicates([same('foto (2).jpg'), same('foto.jpg')])[0].keep.name).toBe('foto.jpg')
    expect(findDuplicates([same('zebra.jpg'), same('anton.jpg')])[0].keep.name).toBe('anton.jpg')
  })

  it('ignoriert Einträge ohne gültigen Hash', () => {
    expect(findDuplicates([photo('x.jpg', '', 10, 10), photo('y.jpg', 'zz', 10, 10)])).toEqual([])
  })
})
