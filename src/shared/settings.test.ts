import { describe, expect, it } from 'vitest'
import { defaultSettings, MOTION_KINDS, parseSettings, TRANSITIONS } from './settings'

describe('parseSettings', () => {
  it('liefert Standardwerte für leere oder kaputte Eingaben', () => {
    expect(parseSettings(undefined)).toEqual(defaultSettings)
    expect(parseSettings('quatsch')).toEqual(defaultSettings)
  })

  it('ersetzt nur ungültige Felder und behält gültige', () => {
    const s = parseSettings({ photoFolder: 'C:/Fotos', maxCrop: 'viel', displayDuration: 5 })
    expect(s.photoFolder).toBe('C:/Fotos')
    expect(s.maxCrop).toBe(defaultSettings.maxCrop)
    expect(s.displayDuration).toEqual(defaultSettings.displayDuration)
  })

  it('ergänzt neue Optionen in alten Auswahllisten und behält die Werte des Nutzers', () => {
    // Stand 0.2.0: noch ohne Kamerafahrt und ohne Übergangsliste
    const s = parseSettings({
      motionKinds: [
        { id: 'zoomIn', enabled: false, weight: 5 },
        { id: 'zoomOut', enabled: true, weight: 1 },
        { id: 'pan', enabled: true, weight: 1 }
      ]
    })
    expect(s.motionKinds.map((o) => o.id)).toEqual([...MOTION_KINDS])
    expect(s.motionKinds[0]).toEqual({ id: 'zoomIn', enabled: false, weight: 5 })
    expect(s.motionKinds.find((o) => o.id === 'journey')?.enabled).toBe(true)
    expect(s.transitions.map((o) => o.id)).toEqual([...TRANSITIONS])
  })
})
