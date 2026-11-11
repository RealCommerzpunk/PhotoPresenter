import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '@shared/settings'

/** Einstellungen aus dem Main-Prozess, aktuell gehalten; Änderungen werden sofort gespeichert. */
export function useSettings(): [Settings | null, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
    return window.api.onSettingsChanged(setSettings)
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    void window.api.setSettings(patch)
  }, [])

  return [settings, update]
}
