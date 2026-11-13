import { useEffect, useState } from 'react'
import { looksSpanned } from '@shared/display'
import { t } from '@shared/i18n'
import type { DisplayInfo } from '@shared/ipc'
import { SHOW_AREAS, SHOW_AREA_LABELS, type Settings, type ShowArea } from '@shared/settings'
import { Card, Field, Select } from './controls'

/** Auf welchem Bildschirm (und in welchem Teil davon) die Show läuft. */
export function ScreenCard({
  s,
  update
}: {
  s: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    let alive = true
    const load = (): void => void window.api.listDisplays().then((d) => alive && setDisplays(d))
    load()
    // Monitore können an- und abgesteckt werden: beim Zurückkehren ins Fenster neu lesen.
    window.addEventListener('focus', load)
    return () => {
      alive = false
      window.removeEventListener('focus', load)
    }
  }, [])

  const chosen = displays.find((d) => d.id === s.showDisplay)
  const missing = s.showDisplay !== '' && displays.length > 0 && !chosen
  const spanned = displays.filter((d) => looksSpanned(d.width, d.height))
  const describe = (d: DisplayInfo): string =>
    `${d.number}: ${d.label} · ${d.width} × ${d.height}` +
    (d.primary ? ` · ${t('ui.screen.primary')}` : '')

  return (
    <Card title={t('ui.screen.title')}>
      <Field label={t('ui.screen.showOn')} hint={t('ui.screen.showOnHint')}>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={missing ? '' : s.showDisplay}
            options={[
              { value: '', label: t('ui.screen.mouse') },
              ...displays.map((d) => ({ value: d.id, label: describe(d) }))
            ]}
            onChange={(v) => update({ showDisplay: v })}
          />
          <button
            onClick={() => void window.api.identifyDisplays()}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            {t('ui.screen.identify')}
          </button>
        </div>
        {missing && <p className="mt-1 text-xs text-amber-300">{t('ui.screen.missing')}</p>}
      </Field>
      <Field label={t('ui.screen.area')} hint={t('ui.screen.areaHint')}>
        <Select
          value={s.showArea}
          options={SHOW_AREAS.map((a) => ({ value: a, label: SHOW_AREA_LABELS[a] }))}
          onChange={(v) => update({ showArea: v as ShowArea })}
        />
        {spanned.length > 0 && (
          <p className="mt-1 text-xs text-white/50">
            {t('ui.screen.spanned')}{' '}
            {spanned
              .map((d) =>
                t('ui.screen.spannedItem', { number: d.number, width: d.width, height: d.height })
              )
              .join(', ')}
            .{s.showArea === 'full' && ` ${t('ui.screen.spannedTip')}`}
          </p>
        )}
      </Field>
    </Card>
  )
}
