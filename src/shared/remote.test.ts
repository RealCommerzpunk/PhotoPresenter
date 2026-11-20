import { describe, expect, it } from 'vitest'
import { REMOTE_EXCLUDED, REMOTE_KEYS } from './remote'
import { settingsSchema } from './settings'

describe('Einstellungen auf der Fernbedienung', () => {
  it('jede Einstellung ist auf der Fernbedienung oder bewusst ausgenommen', () => {
    const remote = new Set<string>(REMOTE_KEYS)
    const excluded = new Set(Object.keys(REMOTE_EXCLUDED))
    const missing = Object.keys(settingsSchema.shape).filter(
      (k) => !remote.has(k) && !excluded.has(k)
    )
    expect(missing).toEqual([])
  })

  it('keine Einstellung ist beides zugleich', () => {
    expect(REMOTE_KEYS.filter((k) => k in REMOTE_EXCLUDED)).toEqual([])
  })
})
