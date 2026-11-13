import { t } from '@shared/i18n'
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
      <Card title={t('ui.effects.particles')}>
        <Field label={t('ui.effects.effects')} hint={t('ui.effects.effectsHint')}>
          <div className="flex flex-wrap items-center gap-4">
            <Toggle
              checked={s.effectsEnabled}
              onChange={(v) => update({ effectsEnabled: v })}
              label={t('ui.effects.enabled')}
            />
            <button
              onClick={() => void window.api.sendShowCommand('effect')}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
              title={t('ui.effects.nowTitle')}
            >
              {t('ui.effects.now')}
            </button>
          </div>
        </Field>
        <Field label={t('ui.effects.howOften')} hint={t('ui.effects.howOftenHint')}>
          <RangeInput
            value={s.effectEvery}
            onChange={(v) => update({ effectEvery: v })}
            min={1}
            max={100}
            step={1}
            unit={t('ui.unit.photos')}
          />
        </Field>
        <Field label={t('ui.effects.howLong')} hint={t('ui.effects.howLongHint')}>
          <RangeInput
            value={s.effectDuration}
            onChange={(v) => update({ effectDuration: v })}
            min={1}
            max={60}
            step={0.5}
            unit="s"
          />
        </Field>
        <Field label={t('ui.effects.intensity')} hint={t('ui.effects.intensityHint')}>
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
        <Field label={t('ui.effects.choice')} hint={t('ui.effects.choiceHint')}>
          <WeightedList
            value={s.effects}
            labels={EFFECT_LABELS}
            onChange={(v) => update({ effects: v })}
            columns={2}
          />
        </Field>
      </Card>
      <Card title={t('ui.world.title')}>
        <Field label={t('ui.world.interlude')} hint={t('ui.world.interludeHint')}>
          <div className="flex flex-wrap items-center gap-4">
            <Toggle
              checked={s.worldEnabled}
              onChange={(v) => update({ worldEnabled: v })}
              label={t('ui.world.enabled')}
            />
            <button
              onClick={() => void window.api.sendShowCommand('world')}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
              title={t('ui.world.nowTitle')}
            >
              {t('ui.world.now')}
            </button>
          </div>
        </Field>
        <Field label={t('ui.effects.howOften')} hint={t('ui.world.howOftenHint')}>
          <RangeInput
            value={s.worldEvery}
            onChange={(v) => update({ worldEvery: v })}
            min={2}
            max={200}
            step={1}
            unit={t('ui.unit.photos')}
          />
        </Field>
        <Field label={t('ui.effects.howLong')}>
          <RangeInput
            value={s.worldDuration}
            onChange={(v) => update({ worldDuration: v })}
            min={8}
            max={90}
            step={1}
            unit="s"
          />
        </Field>
        <Field label={t('ui.world.tiles')} hint={t('ui.world.tilesHint')}>
          <RangeInput
            value={s.worldTiles}
            onChange={(v) => update({ worldTiles: v })}
            min={16}
            max={120}
            step={1}
            unit={t('ui.unit.photos')}
          />
        </Field>
        <Field label={t('ui.world.speed')} hint={t('ui.world.speedHint')}>
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
        <Field label={t('ui.world.formations')} hint={t('ui.world.formationsHint')}>
          <WeightedList
            value={s.worldFormations}
            labels={WORLD_FORMATION_LABELS}
            onChange={(v) => update({ worldFormations: v })}
            columns={2}
          />
        </Field>
      </Card>
      <Card title={t('ui.backgrounds.title')}>
        <Field label={t('ui.backgrounds.background')} hint={t('ui.backgrounds.hint')}>
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
