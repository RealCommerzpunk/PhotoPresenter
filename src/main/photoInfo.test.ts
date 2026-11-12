import { describe, expect, it, vi } from 'vitest'

// photoInfo.ts lädt über photos.ts Electron; für die reine Formatierung genügt eine Attrappe.
vi.mock('./photos', () => ({ resolvePhoto: () => null }))

const { formatExif, formatExposure } = await import('./photoInfo')

describe('formatExposure', () => {
  it('zeigt kurze Zeiten als Bruch', () => {
    expect(formatExposure(0.008)).toBe('1/125 s')
    expect(formatExposure(1 / 60)).toBe('1/60 s')
  })
  it('zeigt lange Zeiten in Sekunden', () => {
    expect(formatExposure(2)).toBe('2 s')
  })
})

describe('formatExif', () => {
  it('fasst Kamera und Belichtung zusammen', () => {
    const rows = Object.fromEntries(
      formatExif({
        Make: 'Canon',
        Model: 'Canon EOS 5D',
        ExposureTime: 0.004,
        FNumber: 2.8,
        ISO: 400,
        FocalLength: 50,
        Flash: 'Flash did not fire',
        latitude: 52.52,
        longitude: 13.405
      })
    )
    expect(rows['Kamera']).toBe('Canon EOS 5D')
    expect(rows['Belichtung']).toBe('1/250 s · f/2,8 · ISO 400')
    expect(rows['Brennweite']).toBe('50 mm')
    expect(rows['Blitz']).toBe('nein')
    expect(rows['Ort (GPS)']).toBe('52,52, 13,405')
  })

  it('setzt Hersteller vor das Modell, wenn es fehlt', () => {
    const rows = Object.fromEntries(formatExif({ Make: 'SONY', Model: 'ILCE-7M3' }))
    expect(rows['Kamera']).toBe('SONY ILCE-7M3')
  })

  it('lässt leere Angaben weg', () => {
    expect(formatExif({})).toEqual([])
  })
})
