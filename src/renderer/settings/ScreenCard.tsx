import { useEffect, useState } from 'react'
import { looksSpanned } from '@shared/display'
import type { DisplayInfo } from '@shared/ipc'
import { SHOW_AREAS, SHOW_AREA_LABELS, type Settings, type ShowArea } from '@shared/settings'
import { Card, Field, Select } from './controls'

/** Auf welchem Bildschirm (und in welchem Teil davon) die Show läuft. */
export function ScreenCard({
  s,
  update
}: {
  s: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    let alive = true
    const load = (): void => void window.api.listDisplays().then((d) => alive && setDisplays(d))
    load()
    // Monitore können an- und abgesteckt werden: beim Zurückkehren ins Fenster neu lesen.
    window.addEventListener('focus', load)
    return () => {
      alive = false
      window.removeEventListener('focus', load)
    }
  }, [])

  const chosen = displays.find((d) => d.id === s.showDisplay)
  const missing = s.showDisplay !== '' && displays.length > 0 && !chosen
  const spanned = displays.filter((d) => looksSpanned(d.width, d.height))
  const describe = (d: DisplayInfo): string =>
    `${d.number}: ${d.label} · ${d.width} × ${d.height}` + (d.primary ? ' · Hauptbildschirm' : '')

  return (
    <Card title="Bildschirm">
      <Field
        label="Show auf"
        hint="Die Nummern zeigt der Knopf daneben kurz auf jedem Bildschirm an. Gilt ab dem nächsten Start der Show."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={missing ? '' : s.showDisplay}
            options={[
              { value: '', label: 'Wo gerade die Maus ist' },
              ...displays.map((d) => ({ value: d.id, label: describe(d) }))
            ]}
            onChange={(v) => update({ showDisplay: v })}
          />
          <button
            onClick={() => void window.api.identifyDisplays()}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            Bildschirme anzeigen
          </button>
        </div>
        {missing && (
          <p className="mt-1 text-xs text-amber-300">
            Der gewählte Bildschirm ist gerade nicht angeschlossen – die Show nimmt den mit der Maus.
          </p>
        )}
      </Field>
      <Field
        label="Bereich"
        hint="Für zusammengeschaltete Monitore, die Windows als einen breiten Bildschirm meldet: Die Show füllt dann nur diesen Teil."
      >
        <Select
          value={s.showArea}
          options={SHOW_AREAS.map((a) => ({ value: a, label: SHOW_AREA_LABELS[a] }))}
          onChange={(v) => update({ showArea: v as ShowArea })}
        />
        {spanned.length > 0 && (
          <p className="mt-1 text-xs text-white/50">
            Sehr breit und vermutlich zusammengeschaltet:{' '}
            {spanned.map((d) => `Bildschirm ${d.number} (${d.width} × ${d.height})`).join(', ')}.
            {s.showArea === 'full' && ' Mit „mittleres Drittel“ o. Ä. läuft die Show nur auf einem Monitor.'}
          </p>
        )}
      </Field>
    </Card>
  )
}
