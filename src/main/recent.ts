import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** So viele zuletzt gezeigte Fotos merkt sich das Programm (reicht für jeden Ordner < 5000). */
export const RECENT_MAX = 5000

/**
 * Welche Fotos zuletzt zu sehen waren (ältestes zuerst, jedes Foto höchstens einmal).
 * Die Show liest den Verlauf beim Start und meldet jedes gezeigte Foto; so kommt nach einem
 * Neustart der Show oder des Programms nicht gleich wieder dasselbe. Gespeichert wird als
 * `recent.json` im Datenordner (Pfade relativ zum Fotoordner).
 */
export class RecentPhotos {
  private list: string[] = []
  private loaded: Promise<void> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly file: () => string) {}

  private load(): Promise<void> {
    this.loaded ??= readFile(this.file(), 'utf8')
      .then((text) => {
        const data: unknown = JSON.parse(text)
        if (Array.isArray(data)) {
          this.list = data.filter((n): n is string => typeof n === 'string').slice(-RECENT_MAX)
        }
      })
      .catch(() => undefined)
    return this.loaded
  }

  async get(): Promise<string[]> {
    await this.load()
    return [...this.list]
  }

  async add(name: string): Promise<void> {
    await this.load()
    this.list = pushRecent(this.list, name)
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.save(), 5000)
  }

  /** Sofort schreiben (beim Beenden). */
  flush(): void {
    if (!this.saveTimer) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    void this.save()
  }

  private async save(): Promise<void> {
    this.saveTimer = null
    const file = this.file()
    try {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(`${file}.tmp`, JSON.stringify(this.list))
      await rename(`${file}.tmp`, file)
    } catch (err) {
      console.warn('Verlauf der gezeigten Fotos nicht gespeichert:', err)
    }
  }
}

/** Foto ans Ende des Verlaufs setzen (früheres Vorkommen fällt weg), Länge begrenzen. */
export function pushRecent(list: string[], name: string, max = RECENT_MAX): string[] {
  const next = list.filter((n) => n !== name)
  next.push(name)
  return next.length > max ? next.slice(next.length - max) : next
}
