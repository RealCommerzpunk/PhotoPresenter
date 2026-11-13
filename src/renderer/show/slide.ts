import { t } from '@shared/i18n'
import { Container, Sprite } from 'pixi.js'
import { pick, pickWeighted } from '@shared/random'
import { FOCUS_LABELS, MOTION_LABELS, type MotionKind, type Settings } from '@shared/settings'
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
import { faceOnScreen, type Rect } from './faceAvoid'

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

export interface SlideOptions {
  /** Sekunden, die das Foto zu Beginn ruhig im Gesamtbild steht (z. B. nach der 3D-Welt). */
  stillStart?: number
  /** Alle Gesichter auf dem Foto (null = noch nicht analysiert): Texte weichen ihnen aus. */
  faces?: FaceBox[] | null
}

/** Messwerte für die Info-Einblendung (Taste I). */
export interface SlideStats {
  /** Bewegungsart bzw. Fokus-Modus als Text. */
  motion: string
  /** Aktueller Kamerazoom (1 = eingepasst). */
  zoom: number
  /** Größte erlaubte Vergrößerung (Zoomgrenze). */
  maxZoom: number
  /** Bildschirmpixel je Originalpixel bei eingepasstem Bild bzw. jetzt. */
  baseScale: number
  scale: number
  /** Fortschritt der Bewegung 0–1. */
  progress: number
  frozen: boolean
}

/** Schleife beim Einfrieren: Fortschritt t = c + a · sin(ω · τ + φ). */
interface FreezeLoop {
  c: number
  a: number
  omega: number
  phi: number
  time: number
}

/** Ein Foto auf der Bühne: Randfüllung, Foto, Bewegung und ggf. Texte darüber. */
export class Slide extends TimedScene implements Scene {
  readonly view = new Container()
  private readonly backdrop: Sprite
  /** Foto aus Streifen-Sprites, Drehpunkt in der Fotomitte. */
  private readonly photo = new Container()
  private readonly shot: Shot
  private readonly track = new OverlayTrack()
  private readonly stillStart: number
  private readonly motionText: string
  private readonly maxZoom: number
  /** Verschiebung der Bewegungszeit nach dem Auftauen (Sekunden). */
  private motionShift = 0
  private loop: FreezeLoop | null = null
  private lastProgress = 0
  private lastZoom = 1
  private readonly faces: FaceBox[] | null
  private screen: Size

  constructor(
    readonly loaded: LoadedPhoto,
    screen: Size,
    settings: Settings,
    fadeIn: number,
    texts: OverlayText[] = [],
    textHost?: HTMLElement,
    readonly focus?: FocusTarget,
    options: SlideOptions = {}
  ) {
    super(fadeIn)
    this.stillStart = options.stillStart ?? 0
    this.faces = options.faces ?? null
    this.screen = screen
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
    this.maxZoom = maxZoom

    if (focus) {
      this.shot = limitShot(
        planFocusShot(
          loaded.size,
          screen,
          loaded.fit.scale,
          focus.face,
          focus.others,
          // Nach einer Ruhephase immer vom Gesamtbild aus starten (keine Fahrt von der Seite).
          this.stillStart && focus.plan.mode === 'journey'
            ? { ...focus.plan, mode: 'slowZoom' }
            : focus.plan,
          Math.random,
          focus.partner
        ),
        maxZoom
      )
      const mode = this.stillStart && focus.plan.mode === 'journey' ? 'slowZoom' : focus.plan.mode
      const pan = focus.others.length ? focus.plan.others : 'off'
      this.motionText =
        t('show.motionFocus', { mode: FOCUS_LABELS[mode] }) +
        (pan === 'off' ? '' : pan === 'before' ? t('show.panBefore') : t('show.panAfter'))
      // Genug Zeit, damit die Kamera an jedem Gesicht kurz verweilen kann.
      const stations = this.shot.path?.length ?? 2
      this.display = Math.max(this.display, 5, stations * 2)
    } else {
      // Nach einer Ruhephase vom Gesamtbild aus hineinzoomen, sonst nach Einstellung.
      const kind: MotionKind = this.stillStart
        ? 'zoomIn'
        : (pickWeighted(settings.motionKinds) ?? 'zoomIn')
      this.motionText = MOTION_LABELS[kind]
      this.shot = limitShot(
        planShot(loaded.size, screen, loaded.fit.scale, kind, pick(settings.motionIntensity)),
        maxZoom
      )
    }

    this.display += this.stillStart

    // Texte über dem Foto nacheinander; die Standzeit wird bei Bedarf verlängert.
    if (textHost && texts.length) {
      let t = fadeIn + 0.4
      const placed: { overlay: TextOverlay; from: number; to: number; style: TextStyle }[] = []
      for (const { item, style } of texts) {
        const overlay = new TextOverlay(textHost, item.text, style)
        const end = t + overlay.inDuration + pick(settings.textDuration)
        this.track.add(overlay, t, end)
        placed.push({ overlay, from: t, to: end + overlay.outDuration, style })
        t = end + overlay.outDuration + 0.3
      }
      this.display = Math.max(this.display, t - fadeIn)
      // Erst jetzt steht die Dauer fest: Platz je Text so wählen, dass er die Gesichter
      // in seinem Zeitfenster nicht verdeckt.
      for (const p of placed) {
        p.overlay.placeAvoiding(
          this.preferredPosition(p.style),
          this.facesBetween(this.progressAt(p.from), this.progressAt(p.to))
        )
      }
    }
  }

  /**
   * Bevorzugter Platz eines Textes über dem Foto. Ohne Gesichtsanalyse kommen mittige Stile
   * vorsichtshalber nach unten; sind die Gesichter bekannt, darf die Mitte bleiben, wenn frei.
   */
  preferredPosition(style: TextStyle): TextStyle['position'] {
    return this.faces === null && style.position === 'center' ? 'bottom' : style.position
  }

  /** Bewegungsfortschritt (0–1) nach `seconds` Standzeit, ohne Einfrieren. */
  private progressAt(seconds: number): number {
    const moving = Math.max(0, seconds - this.stillStart) + this.motionShift
    return Math.min(1, Math.max(0, moving / this.motionDuration))
  }

  /** Gesichter auf dem Bildschirm, während die Bewegung von t0 bis t1 läuft (Stichproben). */
  private facesBetween(t0: number, t1: number): Rect[] {
    if (!this.faces?.length) return []
    const { size, fit } = this.loaded
    const rects: Rect[] = []
    const steps = Math.abs(t1 - t0) < 0.02 ? 1 : 5
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? t0 : t0 + ((t1 - t0) * i) / (steps - 1)
      const k = evaluateShot(this.shot, t, size, this.screen, fit.scale)
      for (const f of this.faces) rects.push(faceOnScreen(f, size, this.screen, fit.scale, k))
    }
    return rects
  }

  /**
   * Gesichter auf dem Bildschirm in den nächsten `seconds` Sekunden (für Sofort-Texte und
   * Emojis). Eingefroren: über die ganze Schleife.
   */
  upcomingFaces(seconds: number): Rect[] {
    if (this.loop) return this.facesBetween(this.loop.c - this.loop.a, this.loop.c + this.loop.a)
    return this.facesBetween(this.progressAt(this.elapsed), this.progressAt(this.elapsed + seconds))
  }

  get label(): string {
    if (!this.focus) return this.loaded.name
    const who = this.focus.partner ? t('show.focusPartner') : t('show.focus')
    return `${this.loaded.name} · ${who}`
  }

  get photoName(): string {
    return this.loaded.name
  }

  /** Dauer der Bewegung in Sekunden (nach der Ruhephase). */
  private get motionDuration(): number {
    return Math.max(0.001, this.lifetime - this.stillStart)
  }

  get frozen(): boolean {
    return this.loop !== null
  }

  /**
   * Einfrieren: Das Foto bleibt stehen, die Kamera pendelt weich um die aktuelle Stelle
   * der Bewegung (ohne Ruck: Startpunkt und Richtung bleiben erhalten). Auftauen setzt
   * die Bewegung genau an der Stelle fort, an der die Schleife gerade ist.
   */
  setFrozen(on: boolean): void {
    if (on === this.frozen) return
    if (on) {
      const t0 = this.lastProgress
      const a = 0.16
      const c = Math.min(1 - a, Math.max(a, t0))
      const phi = Math.asin(Math.max(-1, Math.min(1, (t0 - c) / a)))
      // Gleiche Geschwindigkeit wie die normale Bewegung, Periode aber zwischen 6 und 24 s.
      const speed = 1 / this.motionDuration
      const omega = Math.min((2 * Math.PI) / 6, Math.max((2 * Math.PI) / 24, speed / a))
      this.loop = { c, a, omega, phi, time: 0 }
    } else {
      const moving = Math.max(0, this.elapsed - this.stillStart)
      this.motionShift = this.lastProgress * this.motionDuration - moving
      this.loop = null
    }
  }

  stats(): SlideStats {
    const { fit, size, original, pixelRatio } = this.loaded
    const baseScale = (fit.scale * size.w * pixelRatio) / original.w
    return {
      motion: this.motionText,
      zoom: this.lastZoom,
      maxZoom: this.maxZoom,
      baseScale,
      scale: baseScale * this.lastZoom,
      progress: this.lastProgress,
      frozen: this.frozen
    }
  }

  update(dt: number, screen: Size): void {
    this.screen = screen
    let t: number
    if (this.loop) {
      // Eingefroren: Standzeit läuft nicht weiter, nur die Schleife.
      const l = this.loop
      l.time += dt
      t = l.c + l.a * Math.sin(l.omega * l.time + l.phi)
    } else {
      this.elapsed += dt
      // Während der Ruhephase steht das Bild; danach läuft die Bewegung über die restliche Zeit.
      const moving = Math.max(0, this.elapsed - this.stillStart) + this.motionShift
      t = Math.min(1, Math.max(0, moving / this.motionDuration))
    }
    this.track.update(this.elapsed)
    const { size, fit } = this.loaded
    const k = evaluateShot(this.shot, t, size, screen, fit.scale)
    this.lastProgress = t
    this.lastZoom = k.zoom

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
    this.setFrozen(false)
    this.shorten(fade)
    this.track.leaveAll()
  }

  destroy(): void {
    this.track.destroy()
    this.view.destroy({ children: true })
    this.loaded.destroy()
  }
}
