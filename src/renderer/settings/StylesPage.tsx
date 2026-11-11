import { useState } from 'react'
import type { Settings } from '@shared/settings'
import {
  allStyles,
  ANIMS_IN,
  ANIMS_OUT,
  BOXES,
  EFFECTS,
  FONTS,
  POSITIONS,
  type TextStyle
} from '@shared/text'
import { Card, Field, Select, Toggle, WeightedList } from './controls'
import { TextPreview } from './TextPreview'

type Update = (patch: Partial<Settings>) => void

const SAMPLE = 'Die schönsten Momente\nsind die geteilten'

const options = (o: Record<string, string>): { value: string; label: string }[] =>
  Object.entries(o).map(([value, label]) => ({ value, label }))

function Slider({
  value,
  min,
  max,
  step,
  unit,
  onChange
}: {
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 text-sm text-white/70">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-48 accent-indigo-500"
      />
      <span>
        {Number(value.toFixed(2))} {unit}
      </span>
    </div>
  )
}

function StyleEditor({
  style,
  onChange,
  onDelete,
  onClose
}: {
  style: TextStyle
  onChange: (patch: Partial<TextStyle>) => void
  onDelete: () => void
  onClose: () => void
}): React.JSX.Element {
  const [sample, setSample] = useState(SAMPLE)
  return (
    <Card title={`Stil bearbeiten: ${style.label}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <input
              value={style.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="w-64 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none focus:border-indigo-400"
            />
          </Field>
          <Field label="Schrift">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={style.font}
                options={Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }))}
                onChange={(v) => onChange({ font: v as TextStyle['font'] })}
              />
              <Select
                value={String(style.weight)}
                options={[200, 300, 400, 500, 600, 700, 800].map((w) => ({
                  value: String(w),
                  label: `Stärke ${w}`
                }))}
                onChange={(v) => onChange({ weight: Number(v) })}
              />
              <Toggle
                checked={style.italic}
                label="kursiv"
                onChange={(v) => onChange({ italic: v })}
              />
              <Toggle
                checked={style.uppercase}
                label="Großbuchstaben"
                onChange={(v) => onChange({ uppercase: v })}
              />
            </div>
          </Field>
          <Field label="Größe" hint="In Prozent der Bildschirmhöhe.">
            <Slider
              value={style.size}
              min={2}
              max={20}
              step={0.5}
              unit="%"
              onChange={(v) => onChange({ size: v })}
            />
          </Field>
          <Field label="Zeichenabstand">
            <Slider
              value={style.letterSpacing}
              min={-0.05}
              max={0.5}
              step={0.01}
              unit="em"
              onChange={(v) => onChange({ letterSpacing: v })}
            />
          </Field>
          <Field label="Farben" hint="Zweitfarbe für Leuchten, Kontur, Verlauf und Fläche.">
            <div className="flex items-center gap-4 text-sm text-white/70">
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  value={style.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                />
                Text
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  value={style.accent}
                  onChange={(e) => onChange({ accent: e.target.value })}
                />
                Zweitfarbe
              </label>
            </div>
          </Field>
          <Field label="Effekt und Kasten">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={style.effect}
                options={options(EFFECTS)}
                onChange={(v) => onChange({ effect: v as TextStyle['effect'] })}
              />
              <Select
                value={style.box}
                options={options(BOXES).map((o) => ({ ...o, label: `Kasten: ${o.label}` }))}
                onChange={(v) => onChange({ box: v as TextStyle['box'] })}
              />
              <Toggle
                checked={style.quotes}
                label="„Anführungszeichen“"
                onChange={(v) => onChange({ quotes: v })}
              />
            </div>
          </Field>
          <Field label="Anordnung">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={style.position}
                options={options(POSITIONS)}
                onChange={(v) => onChange({ position: v as TextStyle['position'] })}
              />
              <Select
                value={style.align}
                options={[
                  { value: 'left', label: 'linksbündig' },
                  { value: 'center', label: 'zentriert' },
                  { value: 'right', label: 'rechtsbündig' }
                ]}
                onChange={(v) => onChange({ align: v as TextStyle['align'] })}
              />
            </div>
          </Field>
          <Field label="Animation">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={style.animIn}
                options={options(ANIMS_IN).map((o) => ({ ...o, label: `Ein: ${o.label}` }))}
                onChange={(v) => onChange({ animIn: v as TextStyle['animIn'] })}
              />
              <Select
                value={style.animOut}
                options={options(ANIMS_OUT).map((o) => ({ ...o, label: `Aus: ${o.label}` }))}
                onChange={(v) => onChange({ animOut: v as TextStyle['animOut'] })}
              />
            </div>
          </Field>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Fertig
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Stil „${style.label}“ löschen?`)) onDelete()
              }}
              className="text-xs text-red-300 hover:text-red-200"
            >
              Stil löschen
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <TextPreview text={sample} style={style} />
          <textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs outline-none focus:border-indigo-400"
          />
        </div>
      </div>
    </Card>
  )
}

export function StylesPage({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const styles = allStyles(s.customStyles)
  const labels = Object.fromEntries(styles.map((st) => [st.id, st.label]))
  const edited = s.customStyles.find((st) => st.id === editing)

  const derive = (base: TextStyle): void => {
    const copy: TextStyle = {
      ...base,
      id: `eigen-${Date.now().toString(36)}`,
      label: `${base.label} (eigen)`,
      custom: true
    }
    update({ customStyles: [...s.customStyles, copy] })
    setEditing(copy.id)
  }

  return (
    <>
      {edited && (
        <StyleEditor
          style={edited}
          onChange={(patch) =>
            update({
              customStyles: s.customStyles.map((st) =>
                st.id === edited.id ? { ...st, ...patch } : st
              )
            })
          }
          onDelete={() => {
            update({ customStyles: s.customStyles.filter((st) => st.id !== edited.id) })
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <Card title="Stile">
        <div className="text-xs text-white/40">
          Klick auf eine Vorschau spielt sie erneut ab. Vorlagen lassen sich nicht ändern, aber als
          eigener Stil ableiten.
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
          {styles.map((st) => (
            <div key={st.id} className="flex flex-col gap-2">
              <TextPreview text={SAMPLE} style={st} />
              <div className="flex items-center justify-between text-sm">
                <span>
                  {st.label}
                  {st.custom && <span className="ml-2 text-xs text-indigo-300">eigener</span>}
                </span>
                <span className="flex gap-3 text-xs">
                  {st.custom && (
                    <button
                      onClick={() => setEditing(st.id)}
                      className="text-indigo-300 hover:text-indigo-200"
                    >
                      Bearbeiten
                    </button>
                  )}
                  <button
                    onClick={() => derive(st)}
                    className="text-indigo-300 hover:text-indigo-200"
                  >
                    Ableiten
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Zufallsauswahl">
        <Field
          label="Aktive Stile"
          hint="Texte mit Stil „Zufall“ wählen aus diesen Stilen; der Regler bestimmt, wie oft."
        >
          <WeightedList
            value={s.textStyles}
            labels={labels}
            onChange={(v) => update({ textStyles: v })}
            columns={2}
          />
        </Field>
      </Card>
    </>
  )
}
