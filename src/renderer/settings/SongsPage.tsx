import { useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import type { SongList } from '@shared/ipc'
import { SONG_POSITION_LABELS, SONG_POSITIONS, type Settings } from '@shared/settings'
import { Card, Field, Select } from './controls'
import { SongSync } from './SongSync'

type Update = (patch: Partial<Settings>) => void

const inputClass =
  'w-24 rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-indigo-400'

/** Sekunden als Zahl aus dem Eingabefeld; leer oder ungültig = null (automatisch). */
function seconds(text: string): number | null {
  const n = Number(text.replace(',', '.'))
  return text.trim() && Number.isFinite(n) && n >= 0 ? n : null
}

/** Zeit des Gesangs für ein Lied: beide Felder gefüllt = eigene Werte, sonst automatisch. */
function TimingRow({
  name,
  title,
  s,
  update
}: {
  name: string
  title: string
  s: Settings
  update: Update
}): React.JSX.Element {
  const saved = s.songTiming[name]
  const [start, setStart] = useState(saved ? String(saved.start) : '')
  const [end, setEnd] = useState(saved ? String(saved.end) : '')

  const commit = (a: string, b: string): void => {
    const from = seconds(a)
    const to = seconds(b)
    const next = { ...s.songTiming }
    if (from !== null && to !== null && to > from) next[name] = { start: from, end: to }
    else delete next[name]
    update({ songTiming: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-1.5 text-sm">
      <span className="min-w-40 flex-1 truncate text-white/80" title={title}>
        {title}
      </span>
      <label className="flex items-center gap-2 text-white/60">
        {t('ui.songs.start')}
        <input
          value={start}
          placeholder={t('ui.songs.auto')}
          onChange={(e) => setStart(e.target.value)}
          onBlur={() => commit(start, end)}
          className={inputClass}
        />
        s
      </label>
      <label className="flex items-center gap-2 text-white/60">
        {t('ui.songs.end')}
        <input
          value={end}
          placeholder={t('ui.songs.auto')}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => commit(start, end)}
          className={inputClass}
        />
        s
      </label>
      <button
        onClick={() => {
          setStart('')
          setEnd('')
          commit('', '')
        }}
        className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs hover:bg-white/10"
      >
        {t('ui.songs.reset')}
      </button>
    </div>
  )
}

/** Songs: MP3 mit gleichnamiger TXT, in der Show als Karaoke (Taste S). */
export function SongsPage({ s, update }: { s: Settings; update: Update }): React.JSX.Element {
  const [list, setList] = useState<SongList | null>(null)
  const [draft, setDraft] = useState(s.songsFolder)
  const [syncing, setSyncing] = useState<{ name: string; title: string } | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.listSongs().then((l) => {
      if (!alive) return
      setList(l)
      // Nur zum Testen: Adresse „#Songs/sync“ öffnet gleich das Zeiten-Setzen des ersten Liedes.
      const first = l.songs.find((x) => x.lyrics)
      if (first && window.location.hash.endsWith('/sync')) {
        setSyncing({ name: first.name, title: first.title })
      }
    })
    return () => {
      alive = false
    }
  }, [s.songsFolder])

  const commit = (): void => {
    if (draft.trim() !== s.songsFolder) update({ songsFolder: draft.trim() })
  }

  if (syncing) {
    return (
      <SongSync
        key={syncing.name}
        name={syncing.name}
        title={syncing.title}
        onClose={() => {
          setSyncing(null)
          void window.api.listSongs().then(setList)
        }}
      />
    )
  }

  return (
    <>
      <Card title={t('ui.songs.title')}>
        <Field label={t('ui.songs.folder')} hint={t('ui.songs.folderHint')}>
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
                placeholder={t('ui.songs.folderPlaceholder')}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              {list?.folder && (
                <button
                  onClick={() => void window.api.openPath(list.folder)}
                  className="shrink-0 whitespace-nowrap rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                >
                  {t('ui.songs.open')}
                </button>
              )}
            </div>
            {list && (
              <span className="truncate text-xs text-white/40" title={list.folder}>
                {list.songs.length
                  ? t('ui.songs.found', { n: list.songs.length })
                  : t('ui.songs.none')}
                {' · '}
                {list.folder}
              </span>
            )}
          </div>
        </Field>
        <Field label={t('ui.songs.play')} hint={t('ui.songs.playHint')}>
          <div className="flex flex-col gap-2">
            {list?.songs.map((song) => (
              <div key={song.name} className="flex items-center gap-3 text-sm">
                <button
                  onClick={() => void window.api.sendShowCommand('song', song.name)}
                  title={t('ui.songs.playTitle')}
                  className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                >
                  ▶ {t('ui.songs.play')}
                </button>
                <span className="truncate text-white/80">{song.title}</span>
                <button
                  onClick={() => setSyncing({ name: song.name, title: song.title })}
                  disabled={!song.lyrics}
                  title={t('ui.sync.openTitle')}
                  className="rounded-md border border-indigo-400/40 bg-indigo-500/15 px-3 py-1 text-xs hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('ui.sync.open')}
                </button>
                {!song.lyrics && (
                  <span className="text-xs text-amber-300/80">{t('ui.songs.noText')}</span>
                )}
              </div>
            ))}
            <div>
              <button
                onClick={() => void window.api.sendShowCommand('songStop')}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
              >
                ⏹ {t('ui.songs.stop')}
              </button>
            </div>
          </div>
        </Field>
        <Field label={t('ui.songs.volume')}>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(s.songVolume * 100)}
              onChange={(e) => update({ songVolume: Number(e.target.value) / 100 })}
              className="w-56 accent-indigo-500"
            />
            <span>{Math.round(s.songVolume * 100)} %</span>
          </div>
        </Field>
        <Field label={t('ui.songs.position')}>
          <Select
            value={s.songLyricsPosition}
            onChange={(v) => update({ songLyricsPosition: v as Settings['songLyricsPosition'] })}
            options={SONG_POSITIONS.map((p) => ({ value: p, label: SONG_POSITION_LABELS[p] }))}
          />
        </Field>
      </Card>
      {list && list.songs.some((x) => x.lyrics) && (
        <Card title={t('ui.songs.timing')}>
          <p className="mb-2 text-xs leading-relaxed text-white/50">{t('ui.songs.timingHint')}</p>
          {list.songs
            .filter((x) => x.lyrics)
            .map((song) => (
              <TimingRow
                key={song.name}
                name={song.name}
                title={song.title}
                s={s}
                update={update}
              />
            ))}
        </Card>
      )}
    </>
  )
}
