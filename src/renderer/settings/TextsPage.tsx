import { useState } from 'react'
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
import { PhotoBrowser, usePhotoList } from './PhotoBrowser'
import { TextPreview } from './TextPreview'

type Update = (patch: Partial<Settings>) => void

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
      {open && <PhotoBrowser files={all} isSelected={(n) => chosen.has(n)} onPick={toggle} />}
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
