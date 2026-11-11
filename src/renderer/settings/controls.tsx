import type { ReactNode } from 'react'
import type { Range, WeightedOption } from '@shared/random'

export function Card({
  title,
  children
}: {
  title: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">{title}</h3>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  )
}

export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-4">
      <div>
        <div className="text-sm text-white/90">{label}</div>
        {hint && <div className="mt-1 text-xs leading-snug text-white/40">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}): React.JSX.Element {
  return (
    <input
      type="number"
      className="w-24 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right text-sm outline-none focus:border-indigo-400"
      value={Number(value.toFixed(3))}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
      }}
    />
  )
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/80">
      <input
        type="checkbox"
        className="h-4 w-4 accent-indigo-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

/**
 * Wert „von … bis“ mit Zufallsschalter.
 * `factor` rechnet für die Anzeige um (z. B. 100 für Prozent).
 */
export function RangeInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  factor = 1
}: {
  value: Range
  onChange: (v: Range) => void
  min: number
  max: number
  step: number
  unit: string
  factor?: number
}): React.JSX.Element {
  const random = value.mode === 'random'
  const set = (patch: Partial<Range>): void => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
      {random && <span>von</span>}
      <NumberInput
        value={value.min * factor}
        min={min}
        max={max}
        step={step}
        onChange={(v) => {
          const next = v / factor
          set({ min: next, max: random ? Math.max(next, value.max) : next })
        }}
      />
      {random && (
        <>
          <span>bis</span>
          <NumberInput
            value={value.max * factor}
            min={min}
            max={max}
            step={step}
            onChange={(v) => {
              const next = v / factor
              set({ max: next, min: Math.min(next, value.min) })
            }}
          />
        </>
      )}
      <span className="w-6">{unit}</span>
      <Toggle
        checked={random}
        label="Zufall"
        onChange={(on) =>
          set(on ? { mode: 'random', max: Math.max(value.max, value.min) } : { mode: 'fixed' })
        }
      />
    </div>
  )
}

/** Liste von Optionen mit An/Aus und Gewichtung (wie oft sie gewählt werden). */
export function WeightedList<T extends string>({
  value,
  labels,
  onChange,
  columns = 1
}: {
  value: WeightedOption<T>[]
  labels: Record<T, string>
  onChange: (v: WeightedOption<T>[]) => void
  /** Zweispaltig für lange Listen, mit Knöpfen „alle an/aus“. */
  columns?: 1 | 2
}): React.JSX.Element {
  const update = (id: T, patch: Partial<WeightedOption<T>>): void =>
    onChange(value.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  const setAll = (enabled: boolean): void => onChange(value.map((o) => ({ ...o, enabled })))
  const linkClass = 'text-xs text-indigo-300 hover:text-indigo-200'
  return (
    <div className="flex flex-col gap-3">
      {columns === 2 && (
        <div className="flex gap-4">
          <button className={linkClass} onClick={() => setAll(true)}>
            alle an
          </button>
          <button className={linkClass} onClick={() => setAll(false)}>
            alle aus
          </button>
        </div>
      )}
      <div className={columns === 2 ? 'grid grid-cols-2 gap-x-8 gap-y-2' : 'flex flex-col gap-2'}>
        {value.map((o) => (
          <div key={o.id} className="flex items-center gap-4">
            <div className={columns === 2 ? 'w-36' : 'w-44'}>
              <Toggle
                checked={o.enabled}
                label={labels[o.id]}
                onChange={(v) => update(o.id, { enabled: v })}
              />
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              disabled={!o.enabled}
              value={o.weight}
              onChange={(e) => update(o.id, { weight: Number(e.target.value) })}
              className={`${columns === 2 ? 'w-20' : 'w-40'} accent-indigo-500 disabled:opacity-30`}
            />
            <span className="text-xs text-white/40">
              {columns === 2 ? o.weight : `Häufigkeit ${o.weight}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
