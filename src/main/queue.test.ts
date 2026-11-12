import { describe, expect, it } from 'vitest'
import { QueueStore } from './queue'

const names = (q: QueueStore): string[] => q.get().items.map((i) => i.name)

describe('QueueStore', () => {
  it('hängt Fotos an und liefert das nächste', () => {
    const q = new QueueStore()
    q.apply({ op: 'add', name: 'a.jpg' })
    q.apply({ op: 'add', name: 'b.jpg' })
    expect(names(q)).toEqual(['a.jpg', 'b.jpg'])
    expect(q.next()?.name).toBe('a.jpg')
  })

  it('entfernt gezeigte Einträge beim Weiterschalten', () => {
    const q = new QueueStore()
    q.apply({ op: 'add', name: 'a.jpg' })
    q.apply({ op: 'add', name: 'b.jpg' })
    const a = q.next()!
    q.setPlaying(a.id)
    expect(q.get().playing).toBe(a.id)
    expect(q.next()?.name).toBe('b.jpg')
    q.setPlaying(q.next()!.id)
    expect(names(q)).toEqual(['b.jpg'])
    q.setPlaying(null)
    expect(names(q)).toEqual([])
    expect(q.next()).toBeUndefined()
  })

  it('verschiebt Einträge, aber nie vor den laufenden', () => {
    const q = new QueueStore()
    for (const n of ['a', 'b', 'c', 'd']) q.apply({ op: 'add', name: n })
    q.setPlaying(q.next()!.id)
    const d = q.get().items[3]
    q.apply({ op: 'move', id: d.id, to: 0 })
    expect(names(q)).toEqual(['a', 'd', 'b', 'c'])
    q.apply({ op: 'move', id: d.id, to: 3 })
    expect(names(q)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leert die Liste bis auf den laufenden Eintrag', () => {
    const q = new QueueStore()
    for (const n of ['a', 'b', 'c']) q.apply({ op: 'add', name: n })
    q.setPlaying(q.next()!.id)
    q.apply({ op: 'clear' })
    expect(names(q)).toEqual(['a'])
    expect(q.next()).toBeUndefined()
  })

  it('meldet jede Änderung', () => {
    let calls = 0
    const q = new QueueStore(() => calls++)
    q.apply({ op: 'add', name: 'a' })
    q.apply({ op: 'remove', id: q.get().items[0].id })
    expect(calls).toBe(2)
  })
})
