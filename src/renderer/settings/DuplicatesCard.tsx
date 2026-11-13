import { useEffect, useState } from 'react'
import type { HashedPhoto } from '@shared/dupes'
import { photoUrl, type CleanResult, type DuplicateInfo } from '@shared/ipc'
import type { Settings } from '@shared/settings'
import { Card, Field, Toggle } from './controls'

/** So viele Gruppen werden angezeigt (der Rest nur gezählt). */
const MAX_GROUPS = 40

function Thumb({ photo, keep }: { photo: HashedPhoto; keep?: boolean }): React.JSX.Element {
  return (
    <figure className="m-0 w-28 shrink-0" title={photo.name}>
      <div className="relative">
        <img
          src={photoUrl(photo.name)}
          loading="lazy"
          alt=""
          className={`h-20 w-28 rounded-md object-cover ${keep ? 'ring-2 ring-emerald-400' : 'opacity-70'}`}
        />
        {keep && (
          <span className="absolute left-1 top-1 rounded bg-emerald-500/90 px-1.5 text-[10px] font-semibold text-black">
            bleibt
          </span>
        )}
      </div>
      <figcaption className="mt-1 truncate text-[11px] text-white/50">
        {photo.w} × {photo.h} · {Math.round(photo.size / 1024)} KB
      </figcaption>
    </figure>
  )
}

/** Doppelte Fotos: Prüfstand, Überspringen in der Show, Aufräumen. */
export function DuplicatesCard({
  s,
  update
}: {
  s: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [info, setInfo] = useState<DuplicateInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<(CleanResult & { mode: 'move' | 'trash' }) | null>(null)

  useEffect(() => {
    const load = (): void => void window.api.getDuplicates().then(setInfo)
    load()
    // Während die Analyse läuft, kommen Hashes hinzu.
    let timer: number | undefined
    const later = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 800)
    }
    const offStatus = window.api.onFaceStatus(later)
    const offPhotos = window.api.onPhotosChanged(load)
    return () => {
      window.clearTimeout(timer)
      offStatus()
      offPhotos()
    }
  }, [s.photoFolder, s.includeSubfolders])

  const extra = info ? info.groups.reduce((n, g) => n + g.others.length, 0) : 0

  const clean = async (mode: 'move' | 'trash'): Promise<void> => {
    const question =
      mode === 'move'
        ? `${extra} doppelte Fotos in den Unterordner „Duplicates“ verschieben? Die hochauflösendste Fassung bleibt jeweils stehen.`
        : `${extra} doppelte Fotos in den Papierkorb legen? Die hochauflösendste Fassung bleibt jeweils stehen.`
    if (!window.confirm(question)) return
    setBusy(true)
    try {
      setResult({ ...(await window.api.cleanDuplicates(mode)), mode })
      setInfo(await window.api.getDuplicates())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Doppelte Fotos">
      <Field
        label="Prüfung"
        hint="Vergleicht den Bildinhalt, nicht nur Name und Größe: Auch verkleinerte, neu gespeicherte oder umbenannte Kopien werden erkannt. Behalten wird jeweils die Fassung mit der höchsten Auflösung."
      >
        <div className="flex flex-col gap-2 text-sm">
          {!info ? (
            <span className="text-white/50">Lade …</span>
          ) : info.checked < info.total ? (
            <span className="text-white/70">
              Prüfe Bildinhalte … {info.checked} von {info.total} Fotos
              {info.groups.length > 0 && ` · bisher ${extra} doppelte`}
            </span>
          ) : info.groups.length === 0 ? (
            <span className="text-emerald-300">
              Alle {info.total} Fotos geprüft – keine doppelten gefunden.
            </span>
          ) : (
            <span className="text-amber-300">
              {extra} doppelte {extra === 1 ? 'Foto' : 'Fotos'} in {info.groups.length}{' '}
              {info.groups.length === 1 ? 'Gruppe' : 'Gruppen'} ({info.total} Fotos geprüft)
            </span>
          )}
          <Toggle
            checked={s.dupesSkip}
            onChange={(v) => update({ dupesSkip: v })}
            label="Doppelte in der Show überspringen (nur die hochauflösendste Fassung zeigen)"
          />
        </div>
      </Field>

      {info && info.groups.length > 0 && (
        <>
          <Field
            label="Gefunden"
            hint="Grün umrandet: diese Fassung bleibt. Daneben die schwächeren Kopien."
          >
            <div className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
              {info.groups.slice(0, MAX_GROUPS).map((g) => (
                <div key={g.keep.name} className="flex shrink-0 gap-2 overflow-x-auto overflow-y-hidden pb-1">
                  <Thumb photo={g.keep} keep />
                  {g.others.map((p) => (
                    <Thumb key={p.name} photo={p} />
                  ))}
                </div>
              ))}
              {info.groups.length > MAX_GROUPS && (
                <span className="text-xs text-white/50">
                  … und {info.groups.length - MAX_GROUPS} weitere Gruppen
                </span>
              )}
            </div>
          </Field>
          <Field
            label="Aufräumen"
            hint="Verschieben ist rückgängig zu machen: Die Fotos liegen danach im Unterordner „Duplicates“ des Fotoordners, den die Show nicht mehr einliest. Löschen legt sie in den Papierkorb."
          >
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => void clean('move')}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
              >
                In Unterordner „Duplicates“ verschieben
              </button>
              <button
                disabled={busy}
                onClick={() => void clean('trash')}
                className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-40"
              >
                Löschen (Papierkorb)
              </button>
            </div>
          </Field>
        </>
      )}

      {result && (
        <div className="px-1 pb-1 text-sm text-white/70">
          {result.mode === 'move'
            ? `${result.done} Fotos verschoben nach ${result.folder}.`
            : `${result.done} Fotos in den Papierkorb gelegt.`}
          {result.failed.length > 0 && (
            <span className="text-amber-300">
              {' '}
              {result.failed.length} nicht möglich: {result.failed.join(', ')}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}
