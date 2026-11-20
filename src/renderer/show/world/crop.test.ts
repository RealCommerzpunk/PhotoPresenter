import { describe, expect, it } from 'vitest'
import { tileCropCenter } from './crop'

const TILE = 4 / 3

describe('tileCropCenter', () => {
  it('lässt Fotos im Seitenverhältnis der Kachel unbeschnitten', () => {
    expect(tileCropCenter(TILE, TILE, [])).toEqual([0.5, 0.5])
  })

  it('setzt ohne Gesichter waagrecht mittig, senkrecht etwas nach oben', () => {
    // Querformat 16:9 → nur waagrecht beschnitten
    const [cx, cy] = tileCropCenter(16 / 9, TILE, [])
    expect(cx).toBeCloseTo(0.5)
    expect(cy).toBe(0.5)
    // Hochformat 3:4 → senkrecht beschnitten, Ausschnitt oberhalb der Mitte
    const [, py] = tileCropCenter(3 / 4, TILE, [])
    expect(py).toBeLessThan(0.5)
  })

  it('rückt den Ausschnitt so, dass das Gesicht der Fokus-Person zu sehen ist', () => {
    // Panorama, Fokus-Person ganz rechts, ein anderes Gesicht links
    const faces = [
      { box: [0.05, 0.3, 0.05, 0.1] as [number, number, number, number] },
      { box: [0.88, 0.3, 0.05, 0.1] as [number, number, number, number], focus: true }
    ]
    const image = 3
    const [cx] = tileCropCenter(image, TILE, faces)
    const r = TILE / image
    // Gesicht samt Rand liegt im Ausschnitt
    expect(cx - r / 2).toBeLessThanOrEqual(0.88)
    expect(cx + r / 2).toBeGreaterThanOrEqual(0.93)
    expect(cx + r / 2).toBeLessThanOrEqual(1)
  })

  it('verschiebt nur so weit wie nötig (Gesicht schon drin → mittig)', () => {
    const faces = [{ box: [0.45, 0.2, 0.1, 0.1] as [number, number, number, number] }]
    expect(tileCropCenter(16 / 9, TILE, faces)[0]).toBeCloseTo(0.5)
  })

  it('zeigt beim Hochformat den Kopf auch weit oben', () => {
    const faces = [{ box: [0.4, 0.02, 0.2, 0.12] as [number, number, number, number] }]
    const image = 2 / 3
    const [, cy] = tileCropCenter(image, TILE, faces)
    const r = image / TILE
    expect(cy - r / 2).toBeCloseTo(0)
  })
})
