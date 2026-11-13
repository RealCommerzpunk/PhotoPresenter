import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { de } from '../shared/i18n/de'

const html = readFileSync(join(__dirname, 'remote.html'), 'utf8')
const remoteKeys = Object.keys(de).filter((k) => k.startsWith('remote.'))

describe('Handy-Seite und Wörterbuch', () => {
  it('jeder in der Seite benutzte Schlüssel existiert', () => {
    const used = [...html.matchAll(/\bt\('(remote\.[\w.]+)'/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(20)
    expect(used.filter((k) => !(k in de))).toEqual([])
  })

  it('jeder Eintrag wird entweder per t() benutzt oder steht als deutscher Text in der Seite', () => {
    const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
    const page = norm(html)
    const orphans = remoteKeys.filter((key) => {
      if (html.includes(`'${key}'`)) return false
      return !page.includes(norm(de[key as keyof typeof de]))
    })
    expect(orphans).toEqual([])
  })
})
