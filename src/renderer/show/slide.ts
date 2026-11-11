import { Container, Sprite } from 'pixi.js'
import { pick, pickWeighted } from '@shared/random'
import type { Settings } from '@shared/settings'
import type { LoadedPhoto } from './loader'
import { evaluateShot, planShot, type Shot, type Size } from './motion'

/** Ein Foto auf der Bühne: Randfüllung, Foto und seine Bewegung über die ganze Lebensdauer. */
export class Slide {
  readonly view = new Container()
  private readonly backdrop: Sprite
  private readonly photo: Sprite
  private readonly shot: Shot

  elapsed = 0
  /** Dauer des Einblendens (= Ausblenddauer des Vorgängers). */
  readonly fadeIn: number
  /** Standzeit nach dem Einblenden; 0 setzt ein vorzeitiges Weiterschalten in Gang. */
  display: number
  /** Dauer der Überblendung zum nächsten Foto. */
  fadeOut: number

  constructor(
    readonly loaded: LoadedPhoto,
    screen: Size,
    settings: Settings,
    fadeIn: number
  ) {
    this.fadeIn = fadeIn
    this.display = pick(settings.displayDuration)
    this.fadeOut = pick(settings.transitionDuration)

    this.backdrop = new Sprite(loaded.backdrop)
    this.backdrop.anchor.set(0.5)
    this.backdrop.visible = !loaded.fit.covers

    this.photo = new Sprite(loaded.photo)
    this.photo.anchor.set(0.5)

    this.view.addChild(this.backdrop, this.photo)

    const kind = pickWeighted(settings.motionKinds) ?? 'zoomIn'
    this.shot = planShot(
      loaded.size,
      screen,
      loaded.fit.scale,
      kind,
      pick(settings.motionIntensity)
    )
  }

  /** Gesamte Lebensdauer: Einblenden, Stehen, Ausblenden. Die Bewegung läuft durchgehend. */
  get lifetime(): number {
    return this.fadeIn + this.display + this.fadeOut
  }

  get readyForNext(): boolean {
    return this.elapsed >= this.fadeIn + this.display
  }

  get fadedIn(): boolean {
    return this.elapsed >= this.fadeIn
  }

  update(dt: number, screen: Size): void {
    this.elapsed += dt
    const { size, fit } = this.loaded
    const t = Math.min(1, this.elapsed / Math.max(0.001, this.lifetime))
    const k = evaluateShot(this.shot, t, size, screen, fit.scale)

    const cx = screen.w / 2
    const cy = screen.h / 2
    this.photo.scale.set(fit.scale * k.zoom)
    this.photo.position.set(cx + k.x, cy + k.y)

    if (this.backdrop.visible) {
      const tex = this.backdrop.texture
      const cover = Math.max(screen.w / tex.width, screen.h / tex.height)
      if (this.loaded.fill === 'mirror') {
        // Spiegelung liegt deckungsgleich unter dem Foto und bewegt sich exakt mit.
        this.backdrop.scale.set(cover * k.zoom)
        this.backdrop.position.set(cx + k.x, cy + k.y)
      } else {
        // Der Hintergrund bewegt sich langsamer und gegenläufig: Das gibt Tiefe.
        this.backdrop.scale.set(cover * 1.12 * (1 + (k.zoom - 1) * 0.35))
        this.backdrop.position.set(cx - k.x * 0.15, cy - k.y * 0.15)
      }
    }
  }

  /** Fortschritt des Einblendens 0..1. */
  get fadeProgress(): number {
    return this.fadeIn > 0 ? Math.min(1, this.elapsed / this.fadeIn) : 1
  }

  destroy(): void {
    this.view.destroy({ children: true })
    this.loaded.destroy()
  }
}
