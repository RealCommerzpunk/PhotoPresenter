import { useEffect, useState } from 'react'
import { MOTION_LABELS, type Settings } from '@shared/settings'
import type { PhotoList } from '@shared/ipc'
import { Card, Field, RangeInput, Toggle, WeightedList } from './controls'
import { useSettings } from './useSettings'

const sections = ['Allgemein', 'Bewegung', 'Übergänge', 'Personen', 'Texte', 'Stile'] as const
type Section = (typeof sections)[number]

type Update = (patch: Partial<Settings>) => void

function General({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  const [photos, setPhotos] = useState<PhotoList | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.listPhotos().then((list) => alive && setPhotos(list))
    return () => {
      alive = false
    }
  }, [s.photoFolder, s.includeSubfolders])

  const pick = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) update({ photoFolder: folder })
  }

  return (
    <>
      <Card title="Fotos">
        <Field label="Fotoordner">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => void pick()}
              className="shrink-0 whitespace-nowrap rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Ordner wählen …
            </button>
            <span className="min-w-0 truncate text-sm text-white/70" title={s.photoFolder}>
              {s.photoFolder || <em className="text-white/40">nicht gewählt</em>}
            </span>
          </div>
          {photos && s.photoFolder && (
            <div className={`mt-2 text-xs ${photos.error ? 'text-red-400' : 'text-white/40'}`}>
              {photos.error ?? `${photos.files.length} Fotos gefunden`}
            </div>
          )}
        </Field>
        <Field label="Unterordner">
          <Toggle
            checked={s.includeSubfolders}
            onChange={(v) => update({ includeSubfolders: v })}
            label="Fotos aus Unterordnern einbeziehen"
          />
        </Field>
      </Card>
      <Card title="Bildschirm füllen">
        <Field
          label="Höchstens beschneiden"
          hint="Weicht das Seitenverhältnis nur wenig ab, wird das Foto leicht beschnitten und füllt den Bildschirm. Darüber wird der Rand aus dem Foto weich aufgefüllt."
        >
          <div className="flex items-center gap-3 text-sm text-white/70">
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={Math.round(s.maxCrop * 100)}
              onChange={(e) => update({ maxCrop: Number(e.target.value) / 100 })}
              className="w-56 accent-indigo-500"
            />
            <span>{Math.round(s.maxCrop * 100)} %</span>
          </div>
        </Field>
      </Card>
    </>
  )
}

function Motion({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  return (
    <Card title="Bewegung">
      <Field label="Anzeigedauer" hint="Wie lange ein Foto steht, ohne Überblendung.">
        <RangeInput
          value={s.displayDuration}
          onChange={(v) => update({ displayDuration: v })}
          min={1}
          max={120}
          step={0.5}
          unit="s"
        />
      </Field>
      <Field label="Intensität" hint="Wie stark gezoomt wird: 10 % ist ruhig, 30 % deutlich.">
        <RangeInput
          value={s.motionIntensity}
          onChange={(v) => update({ motionIntensity: v })}
          min={0}
          max={60}
          step={1}
          unit="%"
          factor={100}
        />
      </Field>
      <Field label="Bewegungsarten" hint="Aus den aktiven Arten wird pro Foto zufällig gewählt.">
        <WeightedList
          value={s.motionKinds}
          labels={MOTION_LABELS}
          onChange={(v) => update({ motionKinds: v })}
        />
      </Field>
    </Card>
  )
}

function Transitions({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  return (
    <Card title="Übergänge">
      <Field label="Überblenddauer">
        <RangeInput
          value={s.transitionDuration}
          onChange={(v) => update({ transitionDuration: v })}
          min={0}
          max={10}
          step={0.1}
          unit="s"
        />
      </Field>
      <Field label="Effekte" hint="Weitere Übergangseffekte folgen in Meilenstein 4.">
        <span className="text-sm text-white/50">Weiches Überblenden</span>
      </Field>
    </Card>
  )
}

export function App(): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [active, setActive] = useState<Section>('Allgemein')
  const [settings, update] = useSettings()

  useEffect(() => {
    void window.api.appVersion().then(setVersion)
  }, [])

  return (
    <div className="flex h-full">
      <aside className="flex w-56 flex-col border-r border-white/10 bg-black/30 p-4">
        <h1 className="mb-6 text-lg font-semibold tracking-wide">PhotoPresenter</h1>
        <nav className="flex flex-col gap-1">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={`rounded-md px-3 py-2 text-left text-sm transition ${
                active === s ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="mt-auto text-xs leading-relaxed text-white/40">
          <div>In der Show: Esc beenden · Leertaste Pause · ←/→ blättern · I Dateiname · D fps</div>
          <div className="mt-2">Version {version}</div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/10 px-8 py-4">
          <h2 className="text-xl font-medium">{active}</h2>
          <button
            onClick={() => void window.api.startShow()}
            disabled={!settings?.photoFolder}
            className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white shadow hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶ Diashow starten
          </button>
        </header>
        <section className="flex-1 overflow-auto p-8">
          {!settings ? null : active === 'Allgemein' ? (
            <General s={settings} update={update} />
          ) : active === 'Bewegung' ? (
            <Motion s={settings} update={update} />
          ) : active === 'Übergänge' ? (
            <Transitions s={settings} update={update} />
          ) : (
            <p className="text-white/50">
              Die Einstellungen für „{active}“ folgen in späteren Meilensteinen.
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
