import type { Container } from 'pixi.js'
import type { TextOverlay } from '../text/overlay'
import type { Size } from './motion'

/** Gemeinsame Schnittstelle von Foto- und Textfolien für den Ablauf in der Show. */
export interface Scene {
  readonly view: Container
  /** Angezeigter Name für die Info-Einblendung (Taste I). */
  readonly label: string
  /** Foto der Folie, falls es eine Fotofolie ist (für Zurückblättern). */
  readonly photoName?: string
  elapsed: number
  readonly fadeIn: number
  display: number
  fadeOut: number
  readonly readyForNext: boolean
  readonly fadedIn: boolean
  readonly fadeProgress: number
  update(dt: number, screen: Size): void
  /** Vorzeitig weiterschalten (Pfeiltasten): Texte ausblenden, kurze Überblendung. */
  hurry(fade: number): void
  destroy(): void
}

interface Cue {
  overlay: TextOverlay
  start: number
  end: number
}

/**
 * Zeitplan für Texte auf einer Folie: Jeder Text blendet zu `start` ein und
 * beginnt zu `end` auszublenden (Sekunden seit Beginn der Folie).
 */
export class OverlayTrack {
  private cues: Cue[] = []

  add(overlay: TextOverlay, start: number, end: number): void {
    this.cues.push({ overlay, start, end })
  }

  update(elapsed: number): void {
    for (const c of this.cues) {
      if (elapsed >= c.end) c.overlay.playOut()
      else if (elapsed >= c.start) c.overlay.playIn()
    }
  }

  leaveAll(): void {
    for (const c of this.cues) c.overlay.playOut()
  }

  destroy(): void {
    for (const c of this.cues) c.overlay.destroy()
    this.cues = []
  }
}

/** Basis für die Zeitsteuerung: Einblenden, Stehen, Ausblenden. */
export abstract class TimedScene {
  elapsed = 0
  display = 0
  fadeOut = 0
  // Nicht readonly: Die 3D-Szene wird vorab gebaut und erfährt ihre Einblenddauer erst beim Start.
  constructor(public fadeIn: number) {}

  get lifetime(): number {
    return this.fadeIn + this.display + this.fadeOut
  }

  get readyForNext(): boolean {
    return this.elapsed >= this.fadeIn + this.display
  }

  get fadedIn(): boolean {
    return this.elapsed >= this.fadeIn
  }

  get fadeProgress(): number {
    return this.fadeIn > 0 ? Math.min(1, this.elapsed / this.fadeIn) : 1
  }

  protected shorten(fade: number): void {
    this.display = Math.min(this.display, Math.max(0, this.elapsed - this.fadeIn))
    this.fadeOut = fade
  }
}
