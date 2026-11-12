import { describe, expect, it } from 'vitest'
import { seededRng } from '@shared/random'
import { MOTION_KINDS } from '@shared/settings'
import {
  evaluateShot,
  fitImage,
  limitShot,
  maxOffset,
  planFocusShot,
  planShot,
  zoomLimit
} from './motion'

const screen = { w: 1920, h: 1080 }

describe('fitImage', () => {
  it('füllt den Bildschirm bei kleinem Unterschied im Seitenverhältnis', () => {
    // 3:2-Foto auf 16:9 verliert ca. 16 % – bei 20 % erlaubtem Beschnitt wird gefüllt
    expect(fitImage({ w: 3000, h: 2000 }, screen, 0.2).covers).toBe(true)
  })

  it('passt Hochformat ein', () => {
    const fit = fitImage({ w: 2000, h: 3000 }, screen, 0.12)
    expect(fit.covers).toBe(false)
    expect(fit.scale).toBeCloseTo(1080 / 3000)
  })
})

describe('planShot / evaluateShot', () => {
  const images = [
    { w: 4000, h: 3000 },
    { w: 2000, h: 3000 },
    { w: 6000, h: 1500 },
    { w: 1920, h: 1080 }
  ]

  it('zeigt nie Leere jenseits des Bildrands', () => {
    const rng = seededRng(7)
    for (const img of images) {
      const { scale } = fitImage(img, screen, 0.12)
      for (const kind of MOTION_KINDS) {
        for (let i = 0; i < 50; i++) {
          const shot = planShot(img, screen, scale, kind, 0.05 + rng() * 0.3, rng)
          for (let t = 0; t <= 1; t += 0.05) {
            const k = evaluateShot(shot, t, img, screen, scale)
            const lim = maxOffset(img, screen, scale, k.zoom)
            expect(Math.abs(k.x)).toBeLessThanOrEqual(lim.w + 1e-6)
            expect(Math.abs(k.y)).toBeLessThanOrEqual(lim.h + 1e-6)
            expect(k.zoom).toBeGreaterThanOrEqual(1 - 1e-9)
          }
        }
      }
    }
  })

  it('zoomt beim Hineinzoomen von 1 auf 1 + Intensität', () => {
    const img = { w: 4000, h: 3000 }
    const { scale } = fitImage(img, screen, 0.12)
    const shot = planShot(img, screen, scale, 'zoomIn', 0.2, seededRng(1))
    expect(evaluateShot(shot, 0, img, screen, scale).zoom).toBeCloseTo(1)
    expect(evaluateShot(shot, 1, img, screen, scale).zoom).toBeCloseTo(1.2)
  })
})

describe('planFocusShot', () => {
  const img = { w: 4000, h: 3000 }
  const { scale } = fitImage(img, screen, 0.12)
  const face: [number, number, number, number] = [0.6, 0.3, 0.08, 0.12]
  const others: [number, number, number, number][] = [
    [0.1, 0.35, 0.07, 0.1],
    [0.3, 0.32, 0.07, 0.1]
  ]

  it('zoomt am Ende auf die gewünschte Gesichtsgröße und holt das Gesicht zur Mitte', () => {
    for (const mode of ['slowZoom', 'fastZoom', 'journey'] as const) {
      const shot = planFocusShot(
        img,
        screen,
        scale,
        face,
        [],
        { mode, faceSize: 0.35, others: 'off' },
        seededRng(2)
      )
      const end = evaluateShot(shot, 1, img, screen, scale)
      const faceOnScreen = face[3] * img.h * scale * end.zoom
      expect(faceOnScreen / screen.h).toBeGreaterThan(0.34)
      // Gesichtsmitte liegt nahe der Bildschirmmitte (Versatz wurde nicht begrenzt)
      const cx = (face[0] + face[2] / 2 - 0.5) * img.w * scale * end.zoom + end.x
      expect(Math.abs(cx)).toBeLessThan(screen.w * 0.05)
    }
  })

  it('besucht bei Schwenk vorher erst die anderen Gesichter, endet auf der Fokus-Person', () => {
    const shot = planFocusShot(img, screen, scale, face, others, {
      mode: 'slowZoom',
      faceSize: 0.35,
      others: 'before'
    })
    expect(shot.path!.length).toBe(5)
    const xs = shot.path!.map((k) => k.x)
    // links stehende Gesichter → Bild nach rechts verschoben (positives x), Fokus rechts → negativ
    expect(xs[1]).toBeGreaterThan(0)
    expect(xs[xs.length - 1]).toBeLessThan(0)
    const ts = shot.path!.map((k) => k.t)
    expect(ts).toEqual([...ts].sort((a, b) => a - b))
  })

  it('bleibt auch mit Gesicht am Bildrand innerhalb des Bildes', () => {
    const edge: [number, number, number, number] = [0.95, 0.02, 0.05, 0.06]
    const shot = planFocusShot(img, screen, scale, edge, others, {
      mode: 'journey',
      faceSize: 0.4,
      others: 'after'
    })
    for (let t = 0; t <= 1; t += 0.02) {
      const k = evaluateShot(shot, t, img, screen, scale)
      const lim = maxOffset(img, screen, scale, k.zoom)
      expect(Math.abs(k.x)).toBeLessThanOrEqual(lim.w + 1e-6)
      expect(Math.abs(k.y)).toBeLessThanOrEqual(lim.h + 1e-6)
    }
  })
})

describe('Zoomgrenze', () => {
  it('erlaubt bei großen Fotos mehr Zoom als bei kleinen', () => {
    // 4000 px breit auf 1920 px eingepasst: Skalierung 0,48
    expect(zoomLimit(0.48, 1, 1.25)).toBeCloseTo(2.604, 2)
    // Foto genau so groß wie der Bildschirm
    expect(zoomLimit(1, 1, 1.25)).toBeCloseTo(1.25)
    // Foto kleiner als der Bildschirm: kein Zoom
    expect(zoomLimit(1.9, 1, 1.25)).toBe(1)
    // Hohe Pixeldichte (z. B. 4K mit Skalierung 2) halbiert den Spielraum
    expect(zoomLimit(0.48, 2, 1.25)).toBeCloseTo(1.302, 2)
  })

  it('kappt Kamerapfade und behält das Ziel bei', () => {
    const img = { w: 4000, h: 3000 }
    const { scale } = fitImage(img, screen, 0.12)
    const face: [number, number, number, number] = [0.52, 0.42, 0.05, 0.07]
    const shot = limitShot(
      planFocusShot(img, screen, scale, face, [], {
        mode: 'slowZoom',
        faceSize: 0.4,
        others: 'off'
      }),
      1.5
    )
    const end = evaluateShot(shot, 1, img, screen, scale)
    expect(end.zoom).toBeCloseTo(1.5)
    // Gesichtsmitte weiterhin (so weit möglich) mittig
    const cx = (face[0] + face[2] / 2 - 0.5) * img.w * scale * end.zoom + end.x
    expect(Math.abs(cx)).toBeLessThan(screen.w * 0.05)
    for (const kind of MOTION_KINDS) {
      const s = limitShot(planShot(img, screen, scale, kind, 0.6, seededRng(3)), 1.2)
      for (let t = 0; t <= 1; t += 0.1) {
        expect(evaluateShot(s, t, img, screen, scale).zoom).toBeLessThanOrEqual(1.2 + 1e-9)
      }
    }
  })
})
