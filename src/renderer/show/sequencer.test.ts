import { describe, expect, it } from 'vitest'
import { seededRng } from '@shared/random'
import type { TextItem } from '@shared/text'
import { Playlist } from './playlist'
import { Sequencer, type Entry } from './sequencer'

const text = (id: string, patch: Partial<TextItem> = {}): TextItem => ({
  id,
  enabled: true,
  text: `Text ${id}`,
  kind: 'filler',
  photos: [],
  placement: 'over',
  style: 'random',
  ...patch
})

const label = (e: Entry | undefined): string =>
  !e ? '-' : e.kind === 'photo' ? `P:${e.name}${e.overlays.length ? '+' : ''}` : `T:${e.item.id}`

function run(seq: Sequencer, n: number): string[] {
  return Array.from({ length: n }, () => label(seq.next()))
}

describe('Sequencer', () => {
  it('streut Fülltexte im festen Abstand ein', () => {
    const seq = new Sequencer(new Playlist(['a', 'b', 'c', 'd', 'e', 'f']), {
      min: 3,
      max: 3,
      mode: 'fixed'
    })
    seq.setTexts([text('f1')], { min: 3, max: 3, mode: 'fixed' })
    const out = run(seq, 8)
    expect(out.filter((x) => x.startsWith('T'))).toHaveLength(2)
    expect(out[3]).toBe('T:f1')
    expect(out[7]).toBe('T:f1')
  })

  it('zeigt gebundene Texte vor, über und nach ihrem Foto', () => {
    const seq = new Sequencer(new Playlist(['x'], seededRng(1)), {
      min: 99,
      max: 99,
      mode: 'fixed'
    })
    seq.setTexts(
      [
        text('vor', { kind: 'photo', photos: ['x'], placement: 'before' }),
        text('ueber', { kind: 'photo', photos: ['x'], placement: 'over' }),
        text('nach', { kind: 'photo', photos: ['x'], placement: 'after' })
      ],
      { min: 99, max: 99, mode: 'fixed' }
    )
    expect(run(seq, 3)).toEqual(['T:vor', 'P:x+', 'T:nach'])
  })

  it('wiederholt einen Fülltext nicht direkt', () => {
    const seq = new Sequencer(
      new Playlist([], seededRng(3)),
      { min: 1, max: 1, mode: 'fixed' },
      seededRng(4)
    )
    seq.setTexts([text('a'), text('b'), text('c')], { min: 1, max: 1, mode: 'fixed' })
    const out = run(seq, 60)
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1])
  })

  it('ignoriert deaktivierte und leere Texte', () => {
    const seq = new Sequencer(new Playlist(['a', 'b']), { min: 1, max: 1, mode: 'fixed' })
    seq.setTexts([text('aus', { enabled: false }), text('leer', { text: '  ' })], {
      min: 1,
      max: 1,
      mode: 'fixed'
    })
    expect(run(seq, 4).every((x) => x.startsWith('P'))).toBe(true)
  })

  it('springt zurück zum vorigen Foto und überspringt dabei Texte', () => {
    const seq = new Sequencer(new Playlist(['a', 'b', 'c'], seededRng(2)), {
      min: 99,
      max: 99,
      mode: 'fixed'
    })
    seq.setTexts([], { min: 99, max: 99, mode: 'fixed' })
    const first = seq.next() as Extract<Entry, { kind: 'photo' }>
    const second = seq.next() as Extract<Entry, { kind: 'photo' }>
    expect(label(seq.back(second.name))).toBe(`P:${first.name}`)
    expect(label(seq.next())).toBe(`P:${second.name}`)
  })
})
