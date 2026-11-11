import { useEffect, useState } from 'react'

const sections = ['Allgemein', 'Bewegung', 'Übergänge', 'Personen', 'Texte', 'Stile'] as const

export function App(): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [active, setActive] = useState<(typeof sections)[number]>('Allgemein')

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
        <div className="mt-auto text-xs text-white/40">Version {version}</div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-8 py-4">
          <h2 className="text-xl font-medium">{active}</h2>
          <button
            onClick={() => void window.api.startShow()}
            className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white shadow hover:bg-indigo-400"
          >
            ▶ Diashow starten
          </button>
        </header>
        <section className="flex-1 overflow-auto p-8 text-white/60">
          Die Einstellungen für „{active}“ folgen in den nächsten Meilensteinen.
        </section>
      </main>
    </div>
  )
}
