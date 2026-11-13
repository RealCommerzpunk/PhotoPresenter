import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileFingerprint, parseIndex, sameFile, serializeIndex } from './faceIndexFile'

const folder = resolve('/daten/Fotos')
const outside = resolve('/anderswo/bild.jpg')

describe('Gesichtsindex-Datei', () => {
  it('speichert Fotos im Ordner relativ und andere absolut', () => {
    const index = new Map([
      [join(folder, 'urlaub', 'a.jpg'), { n: 1 }],
      [outside, { n: 2 }]
    ])
    const file = serializeIndex(index, folder)
    expect(file.version).toBe(2)
    expect(Object.keys(file.photos)).toEqual(['urlaub/a.jpg', outside])
  })

  it('lässt für Pakete fremde Pfade weg', () => {
    const index = new Map([
      [join(folder, 'a.jpg'), { n: 1 }],
      [outside, { n: 2 }]
    ])
    expect(Object.keys(serializeIndex(index, folder, true).photos)).toEqual(['a.jpg'])
  })

  it('löst relative Pfade gegen den neuen Fotoordner auf (Index reist mit)', () => {
    const file = serializeIndex(new Map([[join(folder, 'urlaub', 'a.jpg'), { n: 1 }]]), folder)
    const moved = resolve('/stick/PhotoPresenter/Fotos')
    const index = parseIndex<{ n: number }>(JSON.parse(JSON.stringify(file)), moved)
    expect(index.get(join(moved, 'urlaub', 'a.jpg'))).toEqual({ n: 1 })
  })

  it('liest das alte Format mit absoluten Pfaden', () => {
    const index = parseIndex({ version: 1, photos: { [outside]: { n: 3 } } }, folder)
    expect(index.get(outside)).toEqual({ n: 3 })
  })

  it('verwirft Unlesbares', () => {
    expect(parseIndex(null, folder).size).toBe(0)
    expect(parseIndex({ version: 9, photos: {} }, folder).size).toBe(0)
  })
})

describe('fileFingerprint', () => {
  it('hängt nur am Inhalt, nicht an der Änderungszeit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pp-print-'))
    const a = join(dir, 'a.jpg')
    const b = join(dir, 'b.jpg')
    const big = Buffer.alloc(200_000, 7)
    await writeFile(a, big)
    await writeFile(b, big)
    await utimes(b, new Date(2001, 0, 1), new Date(2001, 0, 1))
    expect(await fileFingerprint(a)).toBe(await fileFingerprint(b))
    big[199_999] = 8 // Ende geändert
    await writeFile(b, big)
    expect(await fileFingerprint(a)).not.toBe(await fileFingerprint(b))
    await writeFile(b, Buffer.alloc(10, 7)) // kleine Datei
    expect(await fileFingerprint(b)).toHaveLength(20)
    await rm(dir, { recursive: true })
  })
})

describe('sameFile', () => {
  it('toleriert gerundete Zeiten von USB-Sticks', () => {
    expect(sameFile({ mtime: 1000.4, size: 5 }, { mtimeMs: 2000, size: 5 })).toBe(true)
    expect(sameFile({ mtime: 1000, size: 5 }, { mtimeMs: 5000, size: 5 })).toBe(false)
    expect(sameFile({ mtime: 1000, size: 5 }, { mtimeMs: 1000, size: 6 })).toBe(false)
  })
})
