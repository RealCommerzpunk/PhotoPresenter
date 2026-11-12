import { useEffect, useState } from 'react'
import type { RemoteInfo } from '@shared/remote'
import type { Settings } from '@shared/settings'
import { Card, Field, Toggle } from './controls'

/** Fernbedienung: QR-Code und Adressen; aktualisiert sich, wenn das Netzwerk wechselt. */
export function RemoteCard({
  s,
  update
}: {
  s: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [info, setInfo] = useState<RemoteInfo | null>(null)
  const [port, setPort] = useState(String(s.remotePort))

  useEffect(() => {
    let alive = true
    const load = (): void => void window.api.remoteInfo().then((i) => alive && setInfo(i))
    load()
    // Netzwerk kann wechseln (Hotspot verbunden/getrennt): regelmäßig neu abfragen.
    const timer = window.setInterval(load, 4000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [s.remoteEnabled, s.remotePort])

  const commitPort = (): void => {
    const n = Number(port)
    if (Number.isInteger(n) && n >= 1024 && n <= 65535 && n !== s.remotePort) {
      update({ remotePort: n })
    } else setPort(String(s.remotePort))
  }

  return (
    <Card title="Fernbedienung">
      <Field
        label="Per Handy steuern"
        hint="Der Presenter öffnet eine kleine Webseite im lokalen Netz (ohne Passwort). Damit lassen sich Dauer, Bewegung, Übergänge, Fokus und Texte während der Show ändern."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Toggle
            checked={s.remoteEnabled}
            onChange={(v) => update({ remoteEnabled: v })}
            label="Fernbedienung aktiv"
          />
          <label className="flex items-center gap-2 text-sm text-white/70">
            Port
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onBlur={commitPort}
              onKeyDown={(e) => e.key === 'Enter' && commitPort()}
              className="w-20 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right text-sm outline-none focus:border-indigo-400"
            />
          </label>
        </div>
      </Field>
      {s.remoteEnabled && info && (
        <Field
          label="Verbinden"
          hint="Handy mit demselben Netz verbinden (z. B. diesen PC mit dem Handy-Hotspot) und den Code scannen. In der Show blendet die Taste Q den Code 30 Sekunden lang ein."
        >
          {info.error && <div className="mb-2 text-sm text-red-300">{info.error}</div>}
          {info.urls.length ? (
            <div className="flex flex-wrap items-start gap-5">
              {info.qrSvg && (
                <div
                  className="w-44 rounded-lg bg-white p-2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: info.qrSvg }}
                />
              )}
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{info.urls[0]}</span>
                {info.urls.slice(1).map((u) => (
                  <span key={u} className="text-white/50">
                    {u}
                  </span>
                ))}
                <span className="mt-3 max-w-md text-xs leading-snug text-white/40">
                  Fragt Windows beim ersten Start nach der Firewall, den Zugriff erlauben – bei
                  einem Handy-Hotspot auch für „öffentliche Netzwerke“, sonst erreicht das Handy den
                  PC nicht.
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-amber-300">
              Kein Netzwerk gefunden. Den PC mit einem WLAN oder dem Handy-Hotspot verbinden – die
              Adresse erscheint dann hier automatisch.
            </div>
          )}
        </Field>
      )}
    </Card>
  )
}
