import { EFFECT_LABELS, TEXT_BACKGROUND_LABELS, type Settings } from '@shared/settings'
import { Card, Field, RangeInput, Toggle, WeightedList } from './controls'

type Update = (patch: Partial<Settings>) => void

export function EffectsPage({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  return (
    <>
      <Card title="Partikel-Effekte">
        <Field
          label="Effekte"
          hint="Konfetti, Schnee, Funkeln und mehr über den Fotos. Sie laufen auch über Fotowechsel hinweg weiter."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Toggle
              checked={s.effectsEnabled}
              onChange={(v) => update({ effectsEnabled: v })}
              label="Effekte aktiv"
            />
            <button
              onClick={() => void window.api.sendShowCommand('effect')}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
              title="Startet sofort einen zufälligen Effekt in der laufenden Show oder Vorschau"
            >
              ✨ Effekt jetzt zeigen
            </button>
          </div>
        </Field>
        <Field label="Wie oft" hint="Nach wie vielen Fotos ein Effekt kommt.">
          <RangeInput
            value={s.effectEvery}
            onChange={(v) => update({ effectEvery: v })}
            min={1}
            max={100}
            step={1}
            unit="Fotos"
          />
        </Field>
        <Field label="Wie lange" hint="So lange entstehen neue Partikel; danach laufen sie aus.">
          <RangeInput
            value={s.effectDuration}
            onChange={(v) => update({ effectDuration: v })}
            min={1}
            max={60}
            step={0.5}
            unit="s"
          />
        </Field>
        <Field label="Wie intensiv" hint="Menge, Tempo und Deckkraft der Partikel.">
          <RangeInput
            value={s.effectIntensity}
            onChange={(v) => update({ effectIntensity: v })}
            min={5}
            max={100}
            step={5}
            unit="%"
            factor={100}
          />
        </Field>
        <Field
          label="Auswahl"
          hint="Pro Effekt-Moment wird einer gewählt; der Regler bestimmt, wie oft."
        >
          <WeightedList
            value={s.effects}
            labels={EFFECT_LABELS}
            onChange={(v) => update({ effects: v })}
            columns={2}
          />
        </Field>
      </Card>
      <Card title="Hintergründe der Textfolien">
        <Field
          label="Hintergrund"
          hint="Animierte Hintergründe in den Farben des zugehörigen Fotos. Pro Textfolie wird einer gewählt."
        >
          <WeightedList
            value={s.textBackgrounds}
            labels={TEXT_BACKGROUND_LABELS}
            onChange={(v) => update({ textBackgrounds: v })}
            columns={2}
          />
        </Field>
      </Card>
    </>
  )
}
