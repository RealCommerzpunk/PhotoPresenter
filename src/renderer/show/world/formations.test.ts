import { describe, expect, it } from 'vitest'
import { WORLD_FORMATIONS } from '@shared/settings'
import { easeInOut, formationInfo, placement, type Vec3 } from './formations'

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('Formationen', () => {
  it('liefern für jede Kachel endliche Werte und eine Blickrichtung', () => {
    for (const kind of WORLD_FORMATIONS) {
      for (const n of [12, 48, 100]) {
        for (let i = 0; i < n; i++) {
          const p = placement(kind, i, n, 3.7)
          expect([...p.pos, ...p.target].every(Number.isFinite)).toBe(true)
          expect(dist(p.pos, p.target)).toBeGreaterThan(0.01)
        }
      }
      const info = formationInfo(kind, 48)
      expect(info.distance).toBeGreaterThan(0)
    }
  })

  it('verteilt die Kacheln einer Kugel auf dem Radius, ohne Überlagerung', () => {
    const n = 48
    const ps = Array.from({ length: n }, (_, i) => placement('sphere', i, n, 0).pos)
    const r = Math.hypot(...ps[0])
    for (const p of ps) expect(Math.hypot(...p)).toBeCloseTo(r, 5)
    let minGap = Infinity
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) minGap = Math.min(minGap, dist(ps[a], ps[b]))
    expect(minGap).toBeGreaterThan(1.2)
  })

  it('legt die Wand flach und überlappungsfrei an', () => {
    const n = 40
    const ps = Array.from({ length: n }, (_, i) => placement('table', i, n, 0).pos)
    expect(ps.every((p) => p[2] === 0)).toBe(true)
    let minGap = Infinity
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) minGap = Math.min(minGap, dist(ps[a], ps[b]))
    expect(minGap).toBeGreaterThanOrEqual(1.4)
  })

  it('glättet Anfang und Ende', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(0.1)).toBeLessThan(0.1)
  })
})
