import { describe, expect, it } from 'vitest'
import { areaBounds, looksSpanned } from './display'

const wide = { x: -1920, y: 0, width: 5760, height: 1080 }

describe('areaBounds', () => {
  it('teilt einen breiten Bildschirm in Drittel', () => {
    expect(areaBounds(wide, 'left')).toEqual({ x: -1920, y: 0, width: 1920, height: 1080 })
    expect(areaBounds(wide, 'center')).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
    expect(areaBounds(wide, 'right')).toEqual({ x: 1920, y: 0, width: 1920, height: 1080 })
  })

  it('teilt in Hälften ohne Lücke', () => {
    const odd = { x: 0, y: 0, width: 3841, height: 1080 }
    const l = areaBounds(odd, 'leftHalf')
    const r = areaBounds(odd, 'rightHalf')
    expect(l.x + l.width).toBe(r.x)
    expect(r.x + r.width).toBe(3841)
  })

  it('lässt den ganzen Bildschirm unverändert', () => {
    expect(areaBounds(wide, 'full')).toEqual(wide)
  })
})

describe('looksSpanned', () => {
  it('erkennt zusammengeschaltete Monitore', () => {
    expect(looksSpanned(5760, 1134)).toBe(true)
    expect(looksSpanned(3840, 1080)).toBe(true)
    expect(looksSpanned(2560, 1080)).toBe(false)
    expect(looksSpanned(1920, 1080)).toBe(false)
  })
})
