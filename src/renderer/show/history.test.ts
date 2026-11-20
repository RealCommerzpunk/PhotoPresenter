import { describe, expect, it } from 'vitest'
import { ShowHistory, type HistoryRecord } from './history'

const photo = (name: string): HistoryRecord => ({
  entry: { kind: 'photo', name, overlays: [] }
})
const world = (): HistoryRecord => ({ entry: { kind: 'world' } })

describe('ShowHistory', () => {
  it('blättert Eintrag für Eintrag zurück und wieder vor, auch über Welten und Texte', () => {
    const h = new ShowHistory()
    const items = [photo('a'), world(), photo('b'), photo('c')]
    for (const r of items) h.push(r)
    expect(h.forward()).toBeUndefined()
    // zurück: c → b → Welt → a
    expect(h.back()).toBe(items[2])
    h.show(items[2])
    expect(h.back()).toBe(items[1])
    h.show(items[1])
    expect(h.back()).toBe(items[0])
    h.show(items[0])
    expect(h.back()).toBeUndefined()
    // vor: dieselbe Reihenfolge
    expect(h.forward()).toBe(items[1])
    h.show(items[1])
    expect(h.forward()).toBe(items[2])
  })

  it('verwirft beim neuen Eintrag mitten im Verlauf, was danach lag', () => {
    const h = new ShowHistory()
    const [a, b, c] = [photo('a'), photo('b'), photo('c')]
    h.push(a)
    h.push(b)
    h.show(a)
    h.push(c)
    expect(h.back()).toBe(a)
    expect(h.forward()).toBeUndefined()
    expect(h.length).toBe(2)
  })

  it('hält höchstens max Einträge', () => {
    const h = new ShowHistory(3)
    const items = ['a', 'b', 'c', 'd'].map(photo)
    for (const r of items) h.push(r)
    expect(h.length).toBe(3)
    h.show(items[1])
    expect(h.back()).toBeUndefined()
  })
})
