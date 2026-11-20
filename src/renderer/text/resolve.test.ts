import { describe, expect, it } from 'vitest'
import { defaultSettings, type Settings } from '@shared/settings'
import { PRESET_STYLES, RANDOM_STYLE, type TextItem } from '@shared/text'
import { resolveStyle } from './resolve'

const item = (text: string, style = RANDOM_STYLE): TextItem =>
  ({
    id: 't',
    text,
    enabled: true,
    kind: 'filler',
    photos: [],
    placement: 'before',
    style
  }) as TextItem

const only = PRESET_STYLES[0]
const settings = (min: number, max: number): Settings => ({
  ...defaultSettings,
  textStyles: [{ id: only.id, enabled: true, weight: 1 }],
  textSizeRandom: { min, max, mode: 'random' }
})

describe('resolveStyle', () => {
  it('skaliert die Schrift bei zufälligem Stil innerhalb des Bereichs', () => {
    const s = settings(0.5, 2)
    expect(resolveStyle(item('Hallo'), s, () => 0).size).toBeCloseTo(only.size * 0.5)
    expect(resolveStyle(item('Hallo'), s, () => 0.999).size).toBeCloseTo(
      Math.min(30, only.size * 1.9985)
    )
  })

  it('lässt lange Texte weniger wachsen', () => {
    const s = settings(2, 2)
    const long = 'x'.repeat(160)
    // 40/160 = ¼ des Zuwachses: Faktor 1,25 statt 2
    expect(
      resolveStyle(item(long), { ...s, textSizeRandom: { min: 2, max: 2, mode: 'fixed' } }).size
    ).toBeCloseTo(only.size * 1.25)
  })

  it('ändert fest gewählte Stile nicht', () => {
    const s = settings(2, 2)
    expect(resolveStyle(item('Hallo', only.id), s).size).toBe(only.size)
  })
})
