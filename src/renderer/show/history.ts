import type { FillMode, TextBackgroundId, WorldFormation } from '@shared/settings'
import type { TextStyle } from '@shared/text'
import type { Entry } from './sequencer'

/** Was eine 3D-Welt zum Wiederholen braucht (gleiche Kacheln, Form, Dauer, Zielkachel). */
export interface WorldReplay {
  formation: WorldFormation
  tiles: string[]
  duration: number
  cameraSpeed: number
  density: number
  /** Kachel, in die die Kamera eingetaucht ist (erst nach dem Eintauchen bekannt). */
  finalIndex?: number
}

/**
 * Ein gezeigter Eintrag der Show mit den Zufallsentscheidungen, die ihn ausmachen
 * (Randfüllung, Textstile, Hintergrund der Textfolie, Aufbau der 3D-Welt). So sieht er
 * beim Zurück- und wieder Vorblättern gleich aus.
 */
export interface HistoryRecord {
  entry: Entry
  fill?: FillMode
  /** Stile der Texte über dem Foto bzw. der Textfolie (in derselben Reihenfolge). */
  styles?: TextStyle[]
  background?: TextBackgroundId
  world?: WorldReplay
}

/**
 * Verlauf der Show für ← und →: alles, was zu sehen war, in Reihenfolge – Fotos, Textfolien
 * und 3D-Welten. Zurück geht Eintrag für Eintrag; vor geht erst den Verlauf wieder entlang,
 * am Ende kommen neue Einträge. Ein neuer Eintrag mitten im Verlauf verwirft, was danach lag.
 */
export class ShowHistory {
  private items: HistoryRecord[] = []
  private cursor = -1

  constructor(private readonly max = 300) {}

  get length(): number {
    return this.items.length
  }

  /** Ein neuer Eintrag wird gezeigt. */
  push(record: HistoryRecord): void {
    this.items.splice(this.cursor + 1)
    this.items.push(record)
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max)
    this.cursor = this.items.length - 1
  }

  /** Ein Eintrag aus dem Verlauf wird (wieder) gezeigt. */
  show(record: HistoryRecord): void {
    const i = this.items.lastIndexOf(record)
    if (i >= 0) this.cursor = i
  }

  /** Eintrag entfernen (z. B. weil das Foto nicht mehr ladbar ist). */
  remove(record: HistoryRecord): void {
    const i = this.items.lastIndexOf(record)
    if (i < 0) return
    this.items.splice(i, 1)
    if (i <= this.cursor) this.cursor--
  }

  /** Eintrag vor dem aktuellen (für ←). */
  back(): HistoryRecord | undefined {
    return this.items[this.cursor - 1]
  }

  /** Eintrag nach dem aktuellen, falls zurückgeblättert wurde (sonst undefined). */
  forward(): HistoryRecord | undefined {
    return this.items[this.cursor + 1]
  }
}
