import { useEffect, useMemo, useState } from 'react'
import { t } from '@shared/i18n'
import { photoUrl } from '@shared/ipc'

/** Fotoliste des aktuellen Ordners (lädt neu, wenn sich Ordner oder Unterordner-Einstellung ändern). */
export function usePhotoList(folder: string, sub: boolean): string[] {
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

/** Fotos mit Suche nach Dateiname/Ordner und Vorschaubildern; ein Klick wählt ein Foto. */
export function PhotoBrowser({
  files,
  isSelected,
  onPick
}: {
  files: string[]
  isSelected?: (name: string) => boolean
  onPick: (name: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(60)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? files.filter((f) => f.toLowerCase().includes(q)) : files
  }, [files, query])

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setLimit(60)
        }}
        placeholder={t('ui.browser.search')}
        className="mb-3 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none focus:border-indigo-400"
      />
      {files.length === 0 && (
        <div className="text-xs text-white/40">Keine Fotos – erst einen Ordner wählen.</div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
        {matches.slice(0, limit).map((name) => (
          <button
            key={name}
            onClick={() => onPick(name)}
            title={name}
            className={`overflow-hidden rounded-md border text-left ${
              isSelected?.(name) ? 'border-indigo-400 ring-2 ring-indigo-400' : 'border-white/10'
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
          {t('ui.browser.more', { n: matches.length - limit })}
        </button>
      )}
    </div>
  )
}
