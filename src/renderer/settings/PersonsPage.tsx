import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FaceIndexStatus } from '@shared/faces'
import { photoUrl, type FaceListItem } from '@shared/ipc'
import { FOCUS_LABELS, PAN_OTHERS, type Person, type Settings } from '@shared/settings'
import { Card, Field, RangeInput, Select, Toggle, WeightedList } from './controls'

type Update = (patch: Partial<Settings>) => void

/** Quadratischer Ausschnitt eines Gesichts aus dem Foto (mit etwas Rand). */
function FaceThumb({ item, size = 92 }: { item: FaceListItem; size?: number }): React.JSX.Element {
  const [x, y, w, h] = item.box
  const side = Math.max(w * item.w, h * item.h) * 1.6
  const scale = size / side
  const cx = (x + w / 2) * item.w
  const cy = (y + h / 2) * item.h
  return (
    <div
      className="relative overflow-hidden rounded-md bg-black"
      style={{ width: size, height: size }}
    >
      <img
        src={photoUrl(item.photo)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute max-w-none"
        style={{
          width: item.w * scale,
          height: item.h * scale,
          left: size / 2 - cx * scale,
          top: size / 2 - cy * scale
        }}
      />
    </div>
  )
}

function useFaceStatus(): FaceIndexStatus | null {
  const [status, setStatus] = useState<FaceIndexStatus | null>(null)
  useEffect(() => {
    void window.api.faceStatus().then(setStatus)
    return window.api.onFaceStatus(setStatus)
  }, [])
  return status
}

function FaceGallery({
  person,
  threshold,
  status
}: {
  person: Person
  threshold: number
  status: FaceIndexStatus | null
}): React.JSX.Element {
  const [faces, setFaces] = useState<FaceListItem[]>([])
  const [onlyMatches, setOnlyMatches] = useState(false)
  const [limit, setLimit] = useState(96)
  const sampleKey = person.samples.map((s) => `${s.photo}#${s.face}`).join('|')

  const reload = useCallback(() => {
    void window.api.listFaces(person.id).then(setFaces)
  }, [person.id])

  // Neu laden, wenn sich Beispiele ändern oder die Analyse Fortschritte macht.
  useEffect(reload, [reload, sampleKey, status?.faces])

  const hasSamples = person.samples.length > 0
  const shown = useMemo(
    () =>
      onlyMatches && hasSamples
        ? faces.filter((f) => f.sample || (f.similarity ?? 0) >= threshold)
        : faces,
    [faces, onlyMatches, hasSamples, threshold]
  )
  const matchPhotos = new Set(
    faces.filter((f) => f.sample || (f.similarity ?? 0) >= threshold).map((f) => f.photo)
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
        <span>
          {hasSamples
            ? `${person.samples.length} Beispiel${person.samples.length === 1 ? '' : 'e'} · erkannt auf ${matchPhotos.size} Foto${matchPhotos.size === 1 ? '' : 's'}`
            : 'Klicke auf Gesichter dieser Person, um sie als Beispiele zu hinterlegen (3–10 verschiedene sind ideal).'}
        </span>
        {hasSamples && (
          <Toggle checked={onlyMatches} onChange={setOnlyMatches} label="nur Treffer zeigen" />
        )}
      </div>
      {faces.length === 0 && (
        <div className="text-sm text-white/40">
          Noch keine Gesichter gefunden. Die Analyse läuft im Hintergrund, sobald ein Fotoordner
          gewählt ist.
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
        {shown.slice(0, limit).map((f) => {
          const match = !f.sample && hasSamples && (f.similarity ?? 0) >= threshold
          return (
            <button
              key={`${f.photo}#${f.face}`}
              onClick={() => void window.api.toggleSample(person.id, f.photo, f.face)}
              title={`${f.photo}${f.similarity !== undefined ? ` · Ähnlichkeit ${Math.round(f.similarity * 100)} %` : ''}`}
              className={`flex flex-col items-center gap-1 rounded-lg p-1 ${
                f.sample
                  ? 'bg-indigo-500/30 ring-2 ring-indigo-400'
                  : match
                    ? 'ring-2 ring-emerald-400/70'
                    : 'hover:bg-white/5'
              }`}
            >
              <FaceThumb item={f} />
              <span className="text-[10px] text-white/50">
                {f.sample
                  ? 'Beispiel'
                  : f.similarity !== undefined
                    ? `${Math.round(f.similarity * 100)} %`
                    : ' '}
              </span>
            </button>
          )
        })}
      </div>
      {shown.length > limit && (
        <button
          onClick={() => setLimit(limit + 192)}
          className="self-start text-xs text-indigo-300 hover:text-indigo-200"
        >
          Weitere anzeigen ({shown.length - limit})
        </button>
      )}
    </div>
  )
}

export function PersonsPage({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  const status = useFaceStatus()
  const [selected, setSelected] = useState<string>(s.focusPersonId || s.persons[0]?.id || '')
  const person = s.persons.find((p) => p.id === selected)

  const addPerson = (): void => {
    const p: Person = { id: `p${Date.now().toString(36)}`, name: 'Neue Person', samples: [] }
    update({
      persons: [...s.persons, p],
      focusPersonId: s.focusPersonId || p.id
    })
    setSelected(p.id)
  }
  const patchPerson = (id: string, patch: Partial<Person>): void =>
    update({ persons: s.persons.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const removePerson = (id: string): void => {
    const persons = s.persons.filter((p) => p.id !== id)
    update({
      persons,
      focusPersonId: s.focusPersonId === id ? (persons[0]?.id ?? '') : s.focusPersonId
    })
    if (selected === id) setSelected(persons[0]?.id ?? '')
  }

  const progress = status && status.total ? Math.round((status.done / status.total) * 100) : 0

  return (
    <>
      <Card title="Gesichtserkennung">
        <Field
          label="Analyse"
          hint="Läuft im Hintergrund komplett auf diesem Rechner; Fotos verlassen den PC nicht."
        >
          {status?.error ? (
            <div className="text-sm text-red-300">{status.error}</div>
          ) : status ? (
            <div className="flex flex-col gap-2">
              <div className="h-2 w-72 overflow-hidden rounded bg-white/10">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-xs text-white/60">
                {status.done} von {status.total} Fotos analysiert · {status.faces} Gesichter
                gefunden
                {status.running ? ' · läuft …' : ''}
              </div>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      'Alle Fotos neu analysieren? Die Beispielgesichter bleiben erhalten.'
                    )
                  )
                    void window.api.reindexFaces()
                }}
                className="self-start text-xs text-indigo-300 hover:text-indigo-200"
              >
                Alles neu analysieren
              </button>
            </div>
          ) : null}
        </Field>
      </Card>

      <Card title="Personen">
        <div className="flex flex-wrap items-center gap-2">
          {s.persons.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`rounded-full border px-3 py-1 text-sm ${
                p.id === selected
                  ? 'border-indigo-400 bg-indigo-500/20 text-white'
                  : 'border-white/15 text-white/70 hover:bg-white/5'
              }`}
            >
              {p.name || 'Ohne Namen'}
              {p.id === s.focusPersonId && (
                <span className="ml-2 text-xs text-amber-300">★ Fokus</span>
              )}
            </button>
          ))}
          <button
            onClick={addPerson}
            className="rounded-full bg-indigo-500 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-400"
          >
            + Person
          </button>
        </div>
        {person && (
          <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <input
                value={person.name}
                onChange={(e) => patchPerson(person.id, { name: e.target.value })}
                className="w-56 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none focus:border-indigo-400"
              />
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="radio"
                  className="accent-amber-400"
                  checked={s.focusPersonId === person.id}
                  onChange={() => update({ focusPersonId: person.id })}
                />
                Fokus-Person der Show
              </label>
              <button
                onClick={() => {
                  if (window.confirm(`„${person.name}“ löschen?`)) removePerson(person.id)
                }}
                className="text-xs text-red-300 hover:text-red-200"
              >
                Person löschen
              </button>
            </div>
            <FaceGallery person={person} threshold={s.focusThreshold} status={status} />
          </div>
        )}
      </Card>

      <Card title="Fokus in der Show">
        <Field
          label="Fokus-Person"
          hint="Erkannte Fotos zeigen die Person mit einer Kamerafahrt auf ihr Gesicht."
        >
          <Toggle
            checked={s.focusEnabled}
            onChange={(v) => update({ focusEnabled: v })}
            label="Fokus aktiv"
          />
        </Field>
        <Field
          label="Erkennungsschwelle"
          hint="Niedriger findet mehr Fotos, aber auch mehr Verwechslungen. Grün umrandete Gesichter oben sind Treffer."
        >
          <div className="flex items-center gap-3 text-sm text-white/70">
            <input
              type="range"
              min={20}
              max={70}
              step={1}
              value={Math.round(s.focusThreshold * 100)}
              onChange={(e) => update({ focusThreshold: Number(e.target.value) / 100 })}
              className="w-56 accent-indigo-500"
            />
            <span>{Math.round(s.focusThreshold * 100)} %</span>
          </div>
        </Field>
        <Field label="Kamerabewegung">
          <WeightedList
            value={s.focusModes}
            labels={FOCUS_LABELS}
            onChange={(v) => update({ focusModes: v })}
          />
        </Field>
        <Field
          label="Gesichtsgröße am Ende"
          hint="Anteil der Bildschirmhöhe, den das Gesicht einnimmt."
        >
          <RangeInput
            value={s.focusFaceSize}
            onChange={(v) => update({ focusFaceSize: v })}
            min={10}
            max={70}
            step={1}
            unit="%"
            factor={100}
          />
        </Field>
        <Field
          label="Andere Gesichter"
          hint="Bei Gruppenfotos erst oder danach über die übrigen Gesichter schwenken."
        >
          <Select
            value={s.focusPanOthers}
            options={Object.entries(PAN_OTHERS).map(([value, label]) => ({ value, label }))}
            onChange={(v) => update({ focusPanOthers: v as Settings['focusPanOthers'] })}
          />
        </Field>
        <Field label="Häufiger zeigen" hint="Fotos mit der Person kommen pro Runde zusätzlich vor.">
          <Select
            value={String(s.focusBoost)}
            options={[
              { value: '0', label: 'normal' },
              { value: '1', label: 'etwas häufiger (×2)' },
              { value: '2', label: 'häufiger (×3)' },
              { value: '3', label: 'viel häufiger (×4)' }
            ]}
            onChange={(v) => update({ focusBoost: Number(v) })}
          />
        </Field>
      </Card>
    </>
  )
}
