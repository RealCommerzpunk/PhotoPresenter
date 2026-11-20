import { describe, expect, it } from 'vitest'
import { pushRecent } from './recent'

describe('pushRecent', () => {
  it('setzt ein Foto ans Ende und hält jedes nur einmal', () => {
    expect(pushRecent(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
    expect(pushRecent([], 'x')).toEqual(['x'])
  })

  it('begrenzt die Länge und wirft das Älteste weg', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd'])
  })
})
