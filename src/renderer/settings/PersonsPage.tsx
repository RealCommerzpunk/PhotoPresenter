import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import type { FaceIndexStatus } from '@shared/faces'
import { photoUrl, type FaceListItem, type RelBox } from '@shared/ipc'
import { FOCUS_LABELS, PAN_OTHERS, type Person, type Settings } from '@shared/settings'
import { Card, Field, RangeInput, Select, Toggle, WeightedList } from './controls'
import { PhotoBrowser, usePhotoList } from './PhotoBrowser'

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

/** Schlüssel, der sich ändert, sobald Beispiele oder Gegenbeispiele der Person sich ändern. */
function personKey(person: Person): string {
  return [...person.samples, ...person.negatives].map((s) => s.emb.slice(0, 12)).join('|')
}

/** Beschriftung und Farbe eines Gesichts je nach Zustand. */
function faceState(f: FaceListItem, name: string): { label: string; ring: string } {
  if (f.sample)
    return { label: t('ui.persons.sample'), ring: 'bg-indigo-500/30 ring-2 ring-indigo-400' }
  if (f.negative)
    return { label: t('ui.persons.notName', { name }), ring: 'bg-red-500/20 ring-2 ring-red-400' }
  const pct = f.similarity !== undefined ? `${Math.round(f.similarity * 100)} %` : ' '
  if (f.match) return { label: pct, ring: 'ring-2 ring-emerald-400/70' }
  return { label: pct, ring: '' }
}

function FaceTile({
  f,
  person,
  onChanged
}: {
  f: FaceListItem
  person: Person
  onChanged: () => void
}): React.JSX.Element {
  const state = faceState(f, person.name || t('ui.persons.thisPerson'))
  return (
    <div className={`relative flex flex-col items-center gap-1 rounded-lg p-1 ${state.ring}`}>
      <button
        onClick={() => void window.api.toggleSample(person.id, f.photo, f.face).then(onChanged)}
        title={t('ui.persons.tileTitle', { photo: f.photo, name: person.name })}
        className="rounded-md hover:opacity-90"
      >
        <FaceThumb item={f} />
      </button>
      <button
        onClick={() => void window.api.toggleNegative(person.id, f.photo, f.face).then(onChanged)}
        title={
          f.negative
            ? t('ui.persons.undoExclude')
            : t('ui.persons.isNotTitle', { name: person.name })
        }
        className={`absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
          f.negative
            ? 'bg-red-500 text-white'
            : 'bg-black/60 text-white/70 hover:bg-red-500 hover:text-white'
        }`}
      >
        ✕
      </button>
      {f.manual && (
        <span
          className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px]"
          title={t('ui.persons.manual')}
        >
          ✎
        </span>
      )}
      <span className="max-w-[92px] truncate text-[10px] text-white/50">{state.label}</span>
    </div>
  )
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
  const key = personKey(person)

  const reload = useCallback(() => {
    void window.api.listFaces(person.id).then(setFaces)
  }, [person.id])

  // Neu laden, wenn sich Beispiele, Schwelle oder der Analysestand ändern.
  useEffect(reload, [reload, key, threshold, status?.faces])

  const hasSamples = person.samples.length > 0
  const shown = useMemo(
    () => (onlyMatches && hasSamples ? faces.filter((f) => f.sample || f.match) : faces),
    [faces, onlyMatches, hasSamples]
  )
  const matchPhotos = new Set(faces.filter((f) => f.sample || f.match).map((f) => f.photo))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
        <span>
          {hasSamples
            ? t('ui.persons.samples', { n: person.samples.length }) +
              (person.negatives.length
                ? t('ui.persons.excluded', { n: person.negatives.length })
                : '') +
              t('ui.persons.recognized', { n: matchPhotos.size })
            : t('ui.persons.howTo')}
        </span>
        {hasSamples && (
          <Toggle
            checked={onlyMatches}
            onChange={setOnlyMatches}
            label={t('ui.persons.onlyMatches')}
          />
        )}
      </div>
      <div className="text-[11px] text-white/35">
        {t('ui.persons.legend', { name: person.name || t('ui.persons.thisPerson') })}
      </div>
      {faces.length === 0 && <div className="text-sm text-white/40">{t('ui.persons.noFaces')}</div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
        {shown.slice(0, limit).map((f) => (
          <FaceTile key={`${f.photo}#${f.face}`} f={f} person={person} onChanged={reload} />
        ))}
      </div>
      {shown.length > limit && (
        <button
          onClick={() => setLimit(limit + 192)}
          className="self-start text-xs text-indigo-300 hover:text-indigo-200"
        >
          {t('ui.persons.more', { n: shown.length - limit })}
        </button>
      )}
    </div>
  )
}

/** Foto groß anzeigen, vorhandene Gesichter einzeichnen, neuen Rahmen aufziehen. */
function ManualMarker({
  person,
  files,
  onClose
}: {
  person: Person
  files: string[]
  onClose: () => void
}): React.JSX.Element {
  const [photo, setPhoto] = useState<string | null>(null)
  const [faces, setFaces] = useState<FaceListItem[]>([])
  const [draft, setDraft] = useState<RelBox | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const start = useRef<[number, number] | null>(null)
  const name = person.name || t('ui.persons.thisPerson')

  const reload = useCallback(() => {
    if (photo) void window.api.listFaces(person.id, photo).then(setFaces)
  }, [person.id, photo])
  useEffect(reload, [reload, personKey(person)])

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = area.current!.getBoundingClientRect()
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    ]
  }
  const onDown = (e: React.PointerEvent): void => {
    if (busy) return
    area.current!.setPointerCapture(e.pointerId)
    start.current = pos(e)
    setDraft(null)
    setMessage(null)
  }
  const onMove = (e: React.PointerEvent): void => {
    if (!start.current) return
    const [x0, y0] = start.current
    const [x1, y1] = pos(e)
    setDraft([Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)])
  }
  const onUp = (): void => {
    start.current = null
    setDraft((d) => (d && d[2] > 0.01 && d[3] > 0.01 ? d : null))
  }

  const commit = async (negative: boolean): Promise<void> => {
    if (!photo || !draft) return
    setBusy(true)
    setMessage(t('ui.persons.computing'))
    const res = await window.api.markFace(person.id, photo, draft, negative)
    setBusy(false)
    setDraft(null)
    setMessage(
      res.ok
        ? negative
          ? t('ui.persons.takenNot', { name })
          : t('ui.persons.takenSample', { name })
        : t('ui.persons.error', { error: res.error ?? '' })
    )
    reload()
  }

  const pct = (v: number): string => `${v * 100}%`

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-indigo-400/30 bg-indigo-500/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{t('ui.persons.markTitle')}</div>
        <button onClick={onClose} className="text-xs text-white/60 hover:text-white">
          {t('ui.persons.close')}
        </button>
      </div>
      {!photo ? (
        <>
          <div className="text-xs text-white/50">{t('ui.persons.pickHint')}</div>
          <PhotoBrowser files={files} onPick={setPhoto} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <button
              onClick={() => {
                setPhoto(null)
                setDraft(null)
                setMessage(null)
              }}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:bg-white/10"
            >
              {t('ui.persons.otherPhoto')}
            </button>
            <span className="truncate">{photo}</span>
          </div>
          <div className="text-xs text-white/50">{t('ui.persons.drawHint')}</div>
          <div className="flex justify-center">
            <div className="relative inline-block select-none">
              <img
                src={photoUrl(photo)}
                alt=""
                draggable={false}
                className="block max-h-[60vh] max-w-full"
              />
              <div
                ref={area}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                className="absolute inset-0 cursor-crosshair"
              >
                {faces.map((f) => {
                  const color = f.sample
                    ? 'border-indigo-400'
                    : f.negative
                      ? 'border-red-400'
                      : f.match
                        ? 'border-emerald-400'
                        : 'border-white/70'
                  return (
                    <div
                      key={f.face}
                      className={`absolute border-2 ${color}`}
                      style={{
                        left: pct(f.box[0]),
                        top: pct(f.box[1]),
                        width: pct(f.box[2]),
                        height: pct(f.box[3])
                      }}
                    >
                      <div
                        className="absolute -top-6 left-0 flex gap-1"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            void window.api.toggleSample(person.id, f.photo, f.face).then(reload)
                          }
                          title={t('ui.persons.isName', { name })}
                          className={`rounded px-1 text-[11px] ${f.sample ? 'bg-indigo-500 text-white' : 'bg-black/70 text-white/80 hover:bg-indigo-500'}`}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() =>
                            void window.api.toggleNegative(person.id, f.photo, f.face).then(reload)
                          }
                          title={t('ui.persons.isNotName', { name })}
                          className={`rounded px-1 text-[11px] ${f.negative ? 'bg-red-500 text-white' : 'bg-black/70 text-white/80 hover:bg-red-500'}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
                {draft && (
                  <div
                    className="absolute border-2 border-dashed border-amber-300 bg-amber-300/10"
                    style={{
                      left: pct(draft[0]),
                      top: pct(draft[1]),
                      width: pct(draft[2]),
                      height: pct(draft[3])
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={!draft || busy}
              onClick={() => void commit(false)}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {t('ui.persons.markIs', { name })}
            </button>
            <button
              disabled={!draft || busy}
              onClick={() => void commit(true)}
              className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-40"
            >
              {t('ui.persons.markIsNot', { name })}
            </button>
            {draft && !busy && (
              <button
                onClick={() => setDraft(null)}
                className="text-xs text-white/60 hover:text-white"
              >
                {t('ui.persons.discard')}
              </button>
            )}
            {message && <span className="text-xs text-white/70">{message}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export function PersonsPage({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  const status = useFaceStatus()
  const files = usePhotoList(s.photoFolder, s.includeSubfolders)
  const [selected, setSelected] = useState<string>(s.focusPersonId || s.persons[0]?.id || '')
  const [marking, setMarking] = useState(false)
  const person = s.persons.find((p) => p.id === selected)

  const addPerson = (): void => {
    const p: Person = {
      id: `p${Date.now().toString(36)}`,
      name: t('ui.persons.newPerson'),
      samples: [],
      negatives: []
    }
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
      focusPersonId: s.focusPersonId === id ? (persons[0]?.id ?? '') : s.focusPersonId,
      focusPartnerId: s.focusPartnerId === id ? '' : s.focusPartnerId
    })
    if (selected === id) setSelected(persons[0]?.id ?? '')
  }

  const progress = status && status.total ? Math.round((status.done / status.total) * 100) : 0

  return (
    <>
      <Card title={t('ui.persons.detection')}>
        <Field label={t('ui.persons.analysisLabel')} hint={t('ui.persons.analysisHint')}>
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
                {t('ui.persons.analysis', {
                  done: status.done,
                  total: status.total,
                  faces: status.faces
                })}
                {status.running ? t('ui.persons.running') : ''}
              </div>
              <button
                onClick={() => {
                  if (window.confirm(t('ui.persons.reindexConfirm'))) void window.api.reindexFaces()
                }}
                className="self-start text-xs text-indigo-300 hover:text-indigo-200"
              >
                {t('ui.persons.reindex')}
              </button>
            </div>
          ) : null}
        </Field>
      </Card>

      <Card title={t('ui.persons.title')}>
        <div className="flex flex-wrap items-center gap-2">
          {s.persons.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(p.id)
                setMarking(false)
              }}
              className={`rounded-full border px-3 py-1 text-sm ${
                p.id === selected
                  ? 'border-indigo-400 bg-indigo-500/20 text-white'
                  : 'border-white/15 text-white/70 hover:bg-white/5'
              }`}
            >
              {p.name || t('ui.persons.unnamed')}
              {p.id === s.focusPersonId && (
                <span className="ml-2 text-xs text-amber-300">{t('ui.persons.focusTag')}</span>
              )}
              {p.id === s.focusPartnerId && (
                <span className="ml-2 text-xs text-sky-300">{t('ui.persons.partnerTag')}</span>
              )}
            </button>
          ))}
          <button
            onClick={addPerson}
            className="rounded-full bg-indigo-500 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-400"
          >
            {t('ui.persons.addPerson')}
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
                  onChange={() =>
                    update({
                      focusPersonId: person.id,
                      // Eine Person kann nicht beides sein.
                      focusPartnerId: s.focusPartnerId === person.id ? '' : s.focusPartnerId
                    })
                  }
                />
                {t('ui.persons.focusPerson')}
              </label>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={s.focusPartnerId === person.id}
                  onChange={(e) =>
                    update({
                      focusPartnerId: e.target.checked ? person.id : '',
                      focusPersonId: s.focusPersonId === person.id ? '' : s.focusPersonId
                    })
                  }
                />
                {t('ui.persons.focusPartner')}
              </label>
              {!marking && (
                <button
                  onClick={() => setMarking(true)}
                  className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                >
                  {t('ui.persons.markButton')}
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm(t('ui.persons.deleteConfirm', { name: person.name })))
                    removePerson(person.id)
                }}
                className="text-xs text-red-300 hover:text-red-200"
              >
                {t('ui.persons.delete')}
              </button>
            </div>
            {marking && (
              <ManualMarker person={person} files={files} onClose={() => setMarking(false)} />
            )}
            <FaceGallery person={person} threshold={s.focusThreshold} status={status} />
          </div>
        )}
      </Card>

      <Card title={focusTitle(s)}>
        <Field label={t('ui.persons.focusLabel')} hint={t('ui.persons.focusHint')}>
          <Toggle
            checked={s.focusEnabled}
            onChange={(v) => update({ focusEnabled: v })}
            label={t('ui.persons.focusEnabled')}
          />
        </Field>
        <Field label={t('ui.persons.together')} hint={t('ui.persons.togetherHint')}>
          <div className="flex flex-col gap-1">
            <Toggle
              checked={s.focusTogether}
              onChange={(v) => update({ focusTogether: v })}
              label={t('ui.persons.togetherToggle')}
            />
            {!s.focusPartnerId && (
              <span className="text-xs text-white/40">{t('ui.persons.noPartner')}</span>
            )}
          </div>
        </Field>
        <Field label={t('ui.persons.threshold')} hint={t('ui.persons.thresholdHint')}>
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
        <Field label={t('ui.persons.camera')}>
          <WeightedList
            value={s.focusModes}
            labels={FOCUS_LABELS}
            onChange={(v) => update({ focusModes: v })}
          />
        </Field>
        <Field label={t('ui.persons.faceSize')} hint={t('ui.persons.faceSizeHint')}>
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
        <Field label={t('ui.persons.others')} hint={t('ui.persons.othersHint')}>
          <Select
            value={s.focusPanOthers}
            options={Object.entries(PAN_OTHERS).map(([value, label]) => ({ value, label }))}
            onChange={(v) => update({ focusPanOthers: v as Settings['focusPanOthers'] })}
          />
        </Field>
        <Field label={t('ui.persons.boost')} hint={t('ui.persons.boostHint')}>
          <Select
            value={String(s.focusBoost)}
            options={[
              { value: '0', label: t('ui.persons.boostNormal') },
              { value: '1', label: t('ui.persons.boost1') },
              { value: '2', label: t('ui.persons.boost2') },
              { value: '3', label: t('ui.persons.boost3') }
            ]}
            onChange={(v) => update({ focusBoost: Number(v) })}
          />
        </Field>
      </Card>
    </>
  )
}

/** Überschrift der Fokus-Karte mit den gewählten Personen, damit klar ist, wofür sie gilt. */
function focusTitle(s: Settings): string {
  const name = (id: string): string | undefined =>
    s.persons.find((p) => p.id === id)?.name || undefined
  const focus = name(s.focusPersonId)
  const partner = name(s.focusPartnerId)
  if (!focus) return t('ui.persons.focusNone')
  return partner
    ? t('ui.persons.focusForBoth', { focus, partner })
    : t('ui.persons.focusFor', { focus })
}
