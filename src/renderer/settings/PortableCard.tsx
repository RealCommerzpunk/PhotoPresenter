import { useEffect, useState } from 'react'
import type { DataInfo, ExportProgress, ExportResult } from '@shared/ipc'
import { Card, Field } from './controls'

/** Wo die Daten liegen und Weitergabe-Paket (Programm + Fotos + Einstellungen). */
export function PortableCard(): React.JSX.Element {
  const [info, setInfo] = useState<DataInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)

  useEffect(() => {
    void window.api.dataInfo().then(setInfo)
    return window.api.onExportProgress(setProgress)
  }, [])

  const start = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    setProgress(null)
    try {
      const r = await window.api.exportPackage()
      if (r) setResult(r)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <Card title="Mitnehmen">
      <Field
        label="Daten"
        hint="Einstellungen, Texte, Personen und Gesichtsindex. Liegen sie neben dem Programm, reisen sie mit, wenn der Ordner kopiert wird."
      >
        {info && (
          <div className="flex flex-col gap-1 text-sm">
            <span className={info.portable ? 'text-emerald-300' : 'text-white/70'}>
              {info.portable ? 'Portabel – neben dem Programm' : 'Im Benutzerordner dieses Rechners'}
            </span>
            <button
              onClick={() => void window.api.openPath(info.dir)}
              className="self-start truncate text-left text-xs text-indigo-300 hover:text-indigo-200"
              title="Ordner öffnen"
            >
              {info.dir}
            </button>
            {info.migrated && (
              <span className="text-xs text-white/50">
                Beim ersten Start aus dem Benutzerordner übernommen.
              </span>
            )}
            {info.problem && <span className="text-xs text-amber-300">{info.problem}</span>}
          </div>
        )}
      </Field>
      <Field
        label="Weitergeben"
        hint="Erstellt einen Ordner „PhotoPresenter“ mit Programm, allen Fotos und den aktuellen Einstellungen. Den Ordner einfach weitergeben (USB-Stick, Cloud) – dort die Programmdatei starten, fertig."
      >
        <div className="flex flex-col gap-2 text-sm">
          <button
            disabled={busy}
            onClick={() => void start()}
            className="self-start rounded-md bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {busy ? 'Paket wird erstellt …' : 'Paket für die Weitergabe erstellen …'}
          </button>
          {info?.dev && (
            <span className="text-xs text-white/40">
              Entwicklungsversion: Das Paket enthält Fotos und Daten, aber kein Programm.
            </span>
          )}
          {busy && progress && (
            <div className="flex flex-col gap-1">
              <span className="text-white/70">
                {progress.step}
                {progress.total > 0 && ` ${progress.done} / ${progress.total}`}
              </span>
              {progress.total > 0 && (
                <div className="h-1.5 w-64 overflow-hidden rounded bg-white/10">
                  <div
                    className="h-full bg-indigo-400"
                    style={{ width: `${(100 * progress.done) / progress.total}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {result && (
            <div className="flex flex-col gap-1">
              <span className={result.ok ? 'text-emerald-300' : 'text-red-300'}>
                {result.ok ? 'Fertig: ' : 'Fehler: '}
                {result.ok ? result.path : result.error}
              </span>
              {result.notes.map((n) => (
                <span key={n} className="text-xs text-amber-300">
                  {n}
                </span>
              ))}
              {result.ok && (
                <button
                  onClick={() => void window.api.openPath(result.path)}
                  className="self-start text-xs text-indigo-300 hover:text-indigo-200"
                >
                  Ordner öffnen
                </button>
              )}
            </div>
          )}
        </div>
      </Field>
    </Card>
  )
}
