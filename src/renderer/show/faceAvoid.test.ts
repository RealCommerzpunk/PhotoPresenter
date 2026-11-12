import { describe, expect, it } from 'vitest'
import { bestPlace, coveredArea, faceOnScreen, overlap } from './faceAvoid'

describe('faceOnScreen', () => {
  it('liegt bei Zoom 1 ohne Versatz an der Bildposition (mit Rand ums Gesicht)', () => {
    // Bild 1000×500 auf 1000×500, Gesicht in der Mitte 100×100
    const r = faceOnScreen([0.45, 0.4, 0.1, 0.2], { w: 1000, h: 500 }, { w: 1000, h: 500 }, 1, {
      zoom: 1,
      x: 0,
      y: 0
    })
    expect(r.x).toBeCloseTo(450 - 30)
    expect(r.y).toBeCloseTo(200 - 45)
    expect(r.w).toBeCloseTo(160)
    expect(r.h).toBeCloseTo(180)
  })

  it('folgt Zoom und Versatz der Kamera', () => {
    const r = faceOnScreen([0.5, 0.5, 0.1, 0.1], { w: 1000, h: 1000 }, { w: 1000, h: 1000 }, 1, {
      zoom: 2,
      x: -100,
      y: 0
    })
    // linke Gesichtskante: Mitte 500 − 100 + 0 · 2000 = 400, Breite 200 → mit Rand 400 − 60
    expect(r.x).toBeCloseTo(340)
    expect(r.w).toBeCloseTo(320)
  })
})

describe('Überdeckung', () => {
  it('rechnet Schnittflächen', () => {
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25)
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(0)
    expect(
      coveredArea({ x: 0, y: 0, w: 10, h: 10 }, [
        { x: 0, y: 0, w: 2, h: 2 },
        { x: 8, y: 8, w: 5, h: 5 }
      ])
    ).toBe(8)
  })

  it('nimmt den bevorzugten Platz, wenn er frei ist, sonst den am wenigsten verdeckenden', () => {
    const face = { x: 400, y: 700, w: 200, h: 200 }
    const bottom = { value: 'bottom', rect: { x: 300, y: 750, w: 400, h: 100 } }
    const top = { value: 'top', rect: { x: 300, y: 100, w: 400, h: 100 } }
    const center = { value: 'center', rect: { x: 300, y: 450, w: 400, h: 100 } }
    expect(bestPlace([bottom, top, center], [])).toBe('bottom')
    expect(bestPlace([bottom, top, center], [face])).toBe('top')
    const everywhere = [face, { x: 0, y: 0, w: 1000, h: 250 }, { x: 350, y: 450, w: 50, h: 50 }]
    expect(bestPlace([bottom, top, center], everywhere)).toBe('center')
  })
})
