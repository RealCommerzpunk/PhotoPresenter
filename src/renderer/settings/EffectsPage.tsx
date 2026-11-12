import {
  EFFECT_LABELS,
  TEXT_BACKGROUND_LABELS,
  WORLD_FORMATION_LABELS,
  type Settings
} from '@shared/settings'
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
      <Card title="3D-Fotowelt">
        <Field
          label="Zwischenspiel"
          hint="Viele Fotos fliegen als Kacheln in den Raum und ordnen sich zu einer Formation; die Kamera fliegt hindurch und taucht am Ende in ein Foto ein, mit dem die Show weiterläuft."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Toggle
              checked={s.worldEnabled}
              onChange={(v) => update({ worldEnabled: v })}
              label="3D-Fotowelt aktiv"
            />
            <button
              onClick={() => void window.api.sendShowCommand('world')}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
              title="Startet sofort ein Zwischenspiel in der laufenden Show oder Vorschau"
            >
              🧊 3D jetzt zeigen
            </button>
          </div>
        </Field>
        <Field label="Wie oft" hint="Nach wie vielen Fotos ein Zwischenspiel kommt.">
          <RangeInput
            value={s.worldEvery}
            onChange={(v) => update({ worldEvery: v })}
            min={2}
            max={200}
            step={1}
            unit="Fotos"
          />
        </Field>
        <Field label="Wie lange">
          <RangeInput
            value={s.worldDuration}
            onChange={(v) => update({ worldDuration: v })}
            min={8}
            max={90}
            step={1}
            unit="s"
          />
        </Field>
        <Field label="Fotos im Raum" hint="Wie viele Fotos als Kacheln mitspielen.">
          <RangeInput
            value={s.worldTiles}
            onChange={(v) => update({ worldTiles: v })}
            min={16}
            max={120}
            step={1}
            unit="Fotos"
          />
        </Field>
        <Field label="Kameratempo" hint="100 % = normal.">
          <RangeInput
            value={s.worldCameraSpeed}
            onChange={(v) => update({ worldCameraSpeed: v })}
            min={30}
            max={250}
            step={10}
            unit="%"
            factor={100}
          />
        </Field>
        <Field
          label="Formationen"
          hint="Aus den aktiven wird gewählt; der Regler bestimmt, wie oft."
        >
          <WeightedList
            value={s.worldFormations}
            labels={WORLD_FORMATION_LABELS}
            onChange={(v) => update({ worldFormations: v })}
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
