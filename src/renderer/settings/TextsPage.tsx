import { useEffect, useMemo, useState } from 'react'
import { photoUrl } from '@shared/ipc'
import type { Settings } from '@shared/settings'
import {
  allStyles,
  newTextId,
  PLACEMENTS,
  RANDOM_STYLE,
  type TextItem,
  type TextStyle
} from '@shared/text'
import { Card, Field, RangeInput, Select } from './controls'
import { TextPreview } from './TextPreview'

type Update = (patch: Partial<Settings>) => void

function usePhotoList(folder: string, sub: boolean): string[] {
  const [files, setFiles] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    void window.api.listPhotos().then((l) => alive && setFiles(l.files))
    return () => {
      alive = false
    }
  }, [folder, sub])
  return files
}

/** Auswahl von Fotos mit Suche und Vorschaubildern. */
function PhotoPicker({
  selected,
  all,
  onChange
}: {
  selected: string[]
  all: string[]
  onChange: (v: string[]) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(60)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? all.filter((f) => f.toLowerCase().includes(q)) : all
  }, [all, query])
  const chosen = new Set(selected)
  const toggle = (name: string): void =>
    onChange(chosen.has(name) ? selected.filter((s) => s !== name) : [...selected, name])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((name) => (
          <span
            key={name}
            className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 py-1 pl-1 pr-2 text-xs"
          >
            <img
              src={photoUrl(name)}
              alt=""
              loading="lazy"
              className="h-7 w-10 rounded object-cover"
            />
            <span className="max-w-48 truncate" title={name}>
              {name}
            </span>
            <button onClick={() => toggle(name)} className="text-white/50 hover:text-white">
              ✕
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen(!open)}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
        >
          {open ? 'Auswahl schließen' : selected.length ? 'Fotos ändern …' : 'Fotos wählen …'}
        </button>
      </div>
      {open && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(60)
            }}
            placeholder="Dateiname suchen …"
            className="mb-3 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none focus:border-indigo-400"
          />
          {all.length === 0 && (
            <div className="text-xs text-white/40">Keine Fotos – erst einen Ordner wählen.</div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
            {matches.slice(0, limit).map((name) => (
              <button
                key={name}
                onClick={() => toggle(name)}
                title={name}
                className={`overflow-hidden rounded-md border text-left ${
                  chosen.has(name) ? 'border-indigo-400 ring-2 ring-indigo-400' : 'border-white/10'
                }`}
              >
                <img
                  src={photoUrl(name)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="truncate px-1 py-0.5 text-[10px] text-white/60">{name}</div>
              </button>
            ))}
          </div>
          {matches.length > limit && (
            <button
              onClick={() => setLimit(limit + 120)}
              className="mt-3 text-xs text-indigo-300 hover:text-indigo-200"
            >
              Weitere anzeigen ({matches.length - limit})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TextEditor({
  item,
  styles,
  styleOptions,
  photos,
  previewStyle,
  onChange,
  onDelete
}: {
  item: TextItem
  styles: TextStyle[]
  styleOptions: { value: string; label: string }[]
  photos: string[]
  previewStyle: TextStyle
  onChange: (patch: Partial<TextItem>) => void
  onDelete: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const firstLine = item.text.trim().split('\n')[0] || 'Leerer Text'
  const styleName =
    item.style === RANDOM_STYLE ? 'Zufall' : styles.find((s) => s.id === item.style)?.label
  const summary =
    item.kind === 'filler'
      ? 'Fülltext'
      : `${PLACEMENTS[item.placement]} · ${item.photos.length} Foto${item.photos.length === 1 ? '' : 's'}`
  const bgPhoto = item.kind === 'photo' ? item.photos[0] : photos[0]

  return (
    <div className="rounded-lg border border-white/10 bg-black/20">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-500"
          checked={item.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          title="Aktiv"
        />
        <button
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={`truncate text-sm ${item.enabled ? 'text-white' : 'text-white/40'}`}>
            {firstLine}
          </span>
          <span className="shrink-0 text-xs text-white/40">
            {summary} · {styleName ?? 'Zufall'}
          </span>
        </button>
        <button onClick={() => setOpen(!open)} className="text-white/50 hover:text-white">
          {open ? '▲' : '▼'}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6 border-t border-white/10 p-4">
          <div className="flex flex-col gap-4">
            <textarea
              value={item.text}
              onChange={(e) => onChange({ text: e.target.value })}
              rows={3}
              placeholder="Text eingeben … (Zeilenumbrüche werden übernommen)"
              className="w-full resize-y rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="accent-indigo-500"
                  checked={item.kind === 'filler'}
                  onChange={() => onChange({ kind: 'filler' })}
                />
                Fülltext zwischen den Fotos
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="accent-indigo-500"
                  checked={item.kind === 'photo'}
                  onChange={() => onChange({ kind: 'photo' })}
                />
                An Fotos gebunden
              </label>
            </div>
            {item.kind === 'photo' && (
              <>
                <div className="flex items-center gap-3 text-sm text-white/70">
                  Einblenden
                  <Select
                    value={item.placement}
                    options={Object.entries(PLACEMENTS).map(([value, label]) => ({ value, label }))}
                    onChange={(v) => onChange({ placement: v as TextItem['placement'] })}
                  />
                </div>
                <PhotoPicker
                  selected={item.photos}
                  all={photos}
                  onChange={(v) => onChange({ photos: v })}
                />
              </>
            )}
            <div className="flex items-center gap-3 text-sm text-white/70">
              Stil
              <Select
                value={item.style}
                options={styleOptions}
                onChange={(v) => onChange({ style: v })}
              />
            </div>
            <div>
              <button
                onClick={() => {
                  if (window.confirm('Diesen Text löschen?')) onDelete()
                }}
                className="text-xs text-red-300 hover:text-red-200"
              >
                Text löschen
              </button>
            </div>
          </div>
          <div>
            <TextPreview
              text={item.text}
              style={previewStyle}
              background={bgPhoto ? photoUrl(bgPhoto) : undefined}
              blurBackground={!(item.kind === 'photo' && item.placement === 'over')}
              position={
                item.kind === 'photo' &&
                item.placement === 'over' &&
                previewStyle.position === 'center'
                  ? 'bottom'
                  : undefined
              }
            />
            {item.style === RANDOM_STYLE && (
              <div className="mt-2 text-xs text-white/40">
                Vorschau mit „{previewStyle.label}“; in der Show wird zufällig gewählt.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function TextsPage({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  const photos = usePhotoList(s.photoFolder, s.includeSubfolders)
  const styles = allStyles(s.customStyles)
  const styleOptions = [
    { value: RANDOM_STYLE, label: 'Zufall (aus den aktiven Stilen)' },
    ...styles.map((st) => ({ value: st.id, label: st.label + (st.custom ? ' (eigener)' : '') }))
  ]
  const firstActive = styles.find((st) => s.textStyles.find((o) => o.id === st.id && o.enabled))

  const setTexts = (texts: TextItem[]): void => update({ texts })
  const add = (): void =>
    setTexts([
      {
        id: newTextId(),
        enabled: true,
        text: '',
        kind: 'filler',
        photos: [],
        placement: 'before',
        style: RANDOM_STYLE
      },
      ...s.texts
    ])

  return (
    <>
      <Card title="Ablauf">
        <Field label="Fülltext alle" hint="Nach wie vielen Fotos ein Fülltext erscheint.">
          <RangeInput
            value={s.textFillerEvery}
            onChange={(v) => update({ textFillerEvery: v })}
            min={1}
            max={200}
            step={1}
            unit="Fotos"
          />
        </Field>
        <Field label="Textdauer" hint="Wie lange ein Text steht, ohne Ein- und Ausblenden.">
          <RangeInput
            value={s.textDuration}
            onChange={(v) => update({ textDuration: v })}
            min={1}
            max={60}
            step={0.5}
            unit="s"
          />
        </Field>
      </Card>
      <Card title={`Texte (${s.texts.length})`}>
        <div>
          <button
            onClick={add}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
          >
            + Neuer Text
          </button>
        </div>
        {s.texts.length === 0 && (
          <div className="text-sm text-white/40">Noch keine Texte angelegt.</div>
        )}
        <div className="flex flex-col gap-2">
          {s.texts.map((item) => (
            <TextEditor
              key={item.id}
              item={item}
              styles={styles}
              styleOptions={styleOptions}
              photos={photos}
              previewStyle={styles.find((st) => st.id === item.style) ?? firstActive ?? styles[0]}
              onChange={(patch) =>
                setTexts(s.texts.map((t) => (t.id === item.id ? { ...t, ...patch } : t)))
              }
              onDelete={() => setTexts(s.texts.filter((t) => t.id !== item.id))}
            />
          ))}
        </div>
      </Card>
    </>
  )
}
