import { describe, expect, it } from 'vitest'
import { de } from './de'
import { format, labelMap, LANGUAGES, MESSAGES, resolveLanguage, setLanguage, t } from './index'

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('Übersetzungen', () => {
  const keys = Object.keys(de)

  it.each(LANGUAGES)('%s hat genau die Schlüssel der Quelle', (lang) => {
    expect(Object.keys(MESSAGES[lang]).sort()).toEqual([...keys].sort())
  })

  it.each(LANGUAGES.filter((l) => l !== 'de'))(
    '%s: Platzhalter und Mehrzahlform stimmen',
    (lang) => {
      for (const key of keys) {
        const source = de[key as keyof typeof de]
        const text = MESSAGES[lang][key as keyof typeof de]
        expect(text.trim(), `${lang}:${key} ist leer`).not.toBe('')
        expect(placeholders(text), `${lang}:${key} Platzhalter`).toEqual(placeholders(source))
        expect(text.includes('|'), `${lang}:${key} Mehrzahl`).toBe(source.includes('|'))
      }
    }
  )

  it('keine Übersetzung ist bloß die deutsche Quelle (außer Eigennamen und Kurzwörter)', () => {
    // Internationale Wörter und Platzhaltertexte, die in allen Sprachen gleich sind.
    const same = new Set([
      'Glitch',
      'Original',
      'Zoom',
      'Software',
      'Copyright',
      'Port',
      'Live',
      'Version {version}',
      'Text: {text}',
      '100 % = normal.',
      'Error: {error}'
    ])
    const untranslated: string[] = []
    for (const lang of ['en', 'es', 'fr'] as const) {
      for (const key of keys) {
        const source = de[key as keyof typeof de]
        const text = MESSAGES[lang][key as keyof typeof de]
        if (text === source && source.length > 12 && !same.has(source)) {
          untranslated.push(`${lang}:${key}`)
        }
      }
    }
    expect(untranslated).toEqual([])
  })
})

describe('format und t', () => {
  it('setzt Platzhalter ein und wählt die Mehrzahl', () => {
    expect(format('{a} und {b}', { a: 1, b: 'x' })).toBe('1 und x')
    expect(format('{n} Foto|{n} Fotos', { n: 1 })).toBe('1 Foto')
    expect(format('{n} Foto|{n} Fotos', { n: 0 })).toBe('0 Fotos')
    expect(format('{fehlt}', { a: 1 })).toBe('{fehlt}')
  })

  it('übersetzt je nach gesetzter Sprache', () => {
    setLanguage('en')
    expect(t('nav.general')).toBe('General')
    setLanguage('es')
    expect(t('nav.general')).toBe('General')
    expect(t('ui.folder.found', { n: 3 })).toBe('3 fotos encontradas')
    setLanguage('fr')
    expect(t('nav.motion')).toBe('Mouvement')
    setLanguage('de')
    expect(t('nav.motion')).toBe('Bewegung')
  })

  it('labelMap verhält sich wie ein Objekt und folgt der Sprache', () => {
    const labels = labelMap('motion', ['zoomIn', 'zoomOut'] as const)
    setLanguage('de')
    expect(labels.zoomIn).toBe('Hineinzoomen')
    expect(Object.keys(labels)).toEqual(['zoomIn', 'zoomOut'])
    expect(Object.entries(labels).map(([k, v]) => `${k}=${v}`)).toEqual([
      'zoomIn=Hineinzoomen',
      'zoomOut=Herauszoomen'
    ])
    setLanguage('en')
    expect(labels.zoomIn).toBe('Zoom in')
    setLanguage('de')
  })
})

describe('resolveLanguage', () => {
  it('nimmt die feste Einstellung, sonst die Systemsprache, sonst Englisch', () => {
    expect(resolveLanguage('fr', 'de-DE')).toBe('fr')
    expect(resolveLanguage('auto', 'es-MX')).toBe('es')
    expect(resolveLanguage(undefined, 'de_AT')).toBe('de')
    expect(resolveLanguage('auto', 'ja-JP')).toBe('en')
    expect(resolveLanguage('auto', undefined)).toBe('en')
  })
})
