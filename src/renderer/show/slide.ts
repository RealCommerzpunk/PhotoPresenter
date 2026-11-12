import { Container, Sprite } from 'pixi.js'
import { pick, pickWeighted } from '@shared/random'
import type { Settings } from '@shared/settings'
import type { TextItem, TextStyle } from '@shared/text'
import { TextOverlay } from '../text/overlay'
import type { LoadedPhoto } from './loader'
import {
  evaluateShot,
  limitShot,
  planFocusShot,
  planShot,
  zoomLimit,
  type FaceBox,
  type FocusPlan,
  type Shot,
  type Size
} from './motion'
import { OverlayTrack, TimedScene, type Scene } from './scene'

export interface OverlayText {
  item: TextItem
  style: TextStyle
}

/** Fokus-Person auf diesem Foto: ihr Gesicht, die übrigen Gesichter und der Plan. */
export interface FocusTarget {
  face: FaceBox
  others: FaceBox[]
  plan: FocusPlan
  /** Fokus-Partner auf demselben Foto (wird mit angezoomt). */
  partner?: FaceBox
}

/** Ein Foto auf der Bühne: Randfüllung, Foto, Bewegung und ggf. Texte darüber. */
export class Slide extends TimedScene implements Scene {
  readonly view = new Container()
  private readonly backdrop: Sprite
  /** Foto aus Streifen-Sprites, Drehpunkt in der Fotomitte. */
  private readonly photo = new Container()
  private readonly shot: Shot
  private readonly track = new OverlayTrack()

  constructor(
    readonly loaded: LoadedPhoto,
    screen: Size,
    settings: Settings,
    fadeIn: number,
    texts: OverlayText[] = [],
    textHost?: HTMLElement,
    readonly focus?: FocusTarget
  ) {
    super(fadeIn)
    this.display = pick(settings.displayDuration)
    this.fadeOut = pick(settings.transitionDuration)

    this.backdrop = new Sprite(loaded.backdrop)
    this.backdrop.anchor.set(0.5)
    this.backdrop.visible = !loaded.fit.covers

    for (const part of loaded.parts) {
      const strip = new Sprite(part.texture)
      strip.y = part.y
      this.photo.addChild(strip)
    }
    this.photo.pivot.set(loaded.size.w / 2, loaded.size.h / 2)

    this.view.addChild(this.backdrop, this.photo)

    // Zoomgrenze: nie stärker als maxUpscale über die Originalauflösung vergrößern.
    const fitOriginal = (loaded.fit.scale * loaded.size.w) / loaded.original.w
    const maxZoom = zoomLimit(fitOriginal, loaded.pixelRatio, settings.maxUpscale)

    if (focus) {
      this.shot = limitShot(
        planFocusShot(
          loaded.size,
          screen,
          loaded.fit.scale,
          focus.face,
          focus.others,
          focus.plan,
          Math.random,
          focus.partner
        ),
        maxZoom
      )
      // Genug Zeit, damit die Kamera an jedem Gesicht kurz verweilen kann.
      const stations = this.shot.path?.length ?? 2
      this.display = Math.max(this.display, 5, stations * 2)
    } else {
      const kind = pickWeighted(settings.motionKinds) ?? 'zoomIn'
      this.shot = limitShot(
        planShot(loaded.size, screen, loaded.fit.scale, kind, pick(settings.motionIntensity)),
        maxZoom
      )
    }

    // Texte über dem Foto nacheinander; die Standzeit wird bei Bedarf verlängert.
    if (textHost && texts.length) {
      let t = fadeIn + 0.4
      for (const { item, style } of texts) {
        // Mittig gesetzte Stile über Fotos nach unten, damit Gesichter frei bleiben.
        const position = style.position === 'center' ? 'bottom' : style.position
        const overlay = new TextOverlay(textHost, item.text, style, position)
        const end = t + overlay.inDuration + pick(settings.textDuration)
        this.track.add(overlay, t, end)
        t = end + overlay.outDuration + 0.3
      }
      this.display = Math.max(this.display, t - fadeIn)
    }
  }

  get label(): string {
    if (!this.focus) return this.loaded.name
    const who = this.focus.partner ? 'Fokus-Person und Partner' : 'Fokus-Person'
    return `${this.loaded.name} · ${who}`
  }

  get photoName(): string {
    return this.loaded.name
  }

  update(dt: number, screen: Size): void {
    this.elapsed += dt
    this.track.update(this.elapsed)
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

  hurry(fade: number): void {
    this.shorten(fade)
    this.track.leaveAll()
  }

  destroy(): void {
    this.track.destroy()
    this.view.destroy({ children: true })
    this.loaded.destroy()
  }
}
