import { t } from '@shared/i18n'
import { Container, Sprite } from 'pixi.js'
import { pick, pickWeighted } from '@shared/random'
import {
  FOCUS_LABELS,
  MOTION_LABELS,
  type FillMode,
  type MotionKind,
  type Settings
} from '@shared/settings'
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
  type Keyframe,
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
  /**
   * Nach der 3D-Welt: Das Foto beginnt im Gesamtbild (wie die Zielkachel) und die Bewegung
   * läuft weich an, statt mit Tempo zu starten.
   */
  softStart?: boolean
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

/** Anlaufzeit der Bewegung nach der 3D-Welt (Sekunden). */
const MOTION_RAMP = 1.5

/**
 * Randfüllung zur Kamera `k` legen (k = Gesamtbild: zoom 1, x = y = 0). Auch die 3D-Welt
 * nutzt das, damit ihr Rand beim Ein- und Austauchen genau dem des Fotos entspricht.
 */
export function placeBackdrop(sprite: Sprite, fill: FillMode, screen: Size, k: Keyframe): void {
  const tex = sprite.texture
  const cover = Math.max(screen.w / tex.width, screen.h / tex.height)
  const cx = screen.w / 2
  const cy = screen.h / 2
  if (fill !== 'blur') {
    // Spiegelung und Farbverlauf liegen deckungsgleich unter dem Foto und bewegen sich mit.
    sprite.scale.set(cover * k.zoom)
    sprite.position.set(cx + k.x, cy + k.y)
  } else {
    // Der Hintergrund bewegt sich langsamer und gegenläufig: Das gibt Tiefe.
    sprite.scale.set(cover * 1.12 * (1 + (k.zoom - 1) * 0.35))
    sprite.position.set(cx - k.x * 0.15, cy - k.y * 0.15)
  }
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
  private shot: Shot
  private readonly track = new OverlayTrack()
  /** Nach der 3D-Welt: vom Gesamtbild aus, Bewegung läuft weich an. */
  private readonly softStart: boolean
  private motionText: string
  private readonly maxZoom: number
  /** Verschiebung der Bewegungszeit nach dem Auftauen (Sekunden). */
  private motionShift = 0
  private loop: FreezeLoop | null = null
  private lastProgress = 0
  private lastZoom = 1
  private readonly faces: FaceBox[] | null
  private screen: Size
  /** Rückzug ins Gesamtbild vor der 3D-Welt (Beginn und Dauer in Sekunden Standzeit). */
  private settle: { start: number; len: number } | null = null
  /** Standzeit, ab der die Bewegung nach einem Neu-Fokus neu läuft (null = kein Neu-Fokus). */
  private restart: number | null = null
  /** Per Taste gestarteter Fokus (ersetzt `focus` für Anzeige und Info). */
  private activeFocus?: FocusTarget
  /** Kamera im letzten Frame (Startpunkt für einen Neu-Fokus). */
  private lastKey: Keyframe = { zoom: 1, x: 0, y: 0 }

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
    this.softStart = options.softStart ?? false
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
          // Nach der 3D-Welt immer vom Gesamtbild aus starten (keine Fahrt von der Seite).
          this.softStart && focus.plan.mode === 'journey'
            ? { ...focus.plan, mode: 'slowZoom' }
            : focus.plan,
          Math.random,
          focus.partner
        ),
        maxZoom
      )
      const mode = this.softStart && focus.plan.mode === 'journey' ? 'slowZoom' : focus.plan.mode
      const pan = focus.others.length ? focus.plan.others : 'off'
      this.motionText =
        t('show.motionFocus', { mode: FOCUS_LABELS[mode] }) +
        (pan === 'off' ? '' : pan === 'before' ? t('show.panBefore') : t('show.panAfter'))
      // Fotos mit der Fokus-Person (und dem Partner) stehen länger, je nach Einstellung.
      this.display += Math.max(
        0,
        pick(focus.partner ? settings.focusPairExtraTime : settings.focusExtraTime)
      )
      // Genug Zeit, damit die Kamera an jedem Gesicht kurz verweilen kann.
      const stations = this.shot.path?.length ?? 2
      this.display = Math.max(this.display, 5, stations * 2)
    } else {
      // Nach der 3D-Welt vom Gesamtbild aus hineinzoomen, sonst nach Einstellung.
      const kind: MotionKind = this.softStart
        ? 'zoomIn'
        : (pickWeighted(settings.motionKinds) ?? 'zoomIn')
      this.motionText = MOTION_LABELS[kind]
      this.shot = limitShot(
        planShot(loaded.size, screen, loaded.fit.scale, kind, pick(settings.motionIntensity)),
        maxZoom
      )
    }

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

  /**
   * Bewegungszeit nach `seconds` Standzeit. Nach der 3D-Welt läuft die Bewegung gegen Ende
   * des Überblendens weich an (Tempo steigt über MOTION_RAMP Sekunden von 0).
   */
  private movingTime(seconds: number): number {
    // Nach einem Neu-Fokus (Taste p/P) beginnt die Bewegung an dieser Stelle neu.
    if (this.restart !== null) return Math.max(0, seconds - this.restart)
    if (!this.softStart) return seconds
    const m = Math.max(0, seconds - this.fadeIn * 0.5)
    return m < MOTION_RAMP ? (m * m) / (2 * MOTION_RAMP) : m - MOTION_RAMP / 2
  }

  /** Bewegungsfortschritt (0–1) nach `seconds` Standzeit, ohne Einfrieren. */
  private progressAt(seconds: number): number {
    const moving = this.movingTime(seconds) + this.motionShift
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
    const focus = this.activeFocus ?? this.focus
    if (!focus) return this.loaded.name
    const who = focus.partner ? t('show.focusPartner') : t('show.focus')
    return `${this.loaded.name} · ${who}`
  }

  get photoName(): string {
    return this.loaded.name
  }

  /** Dauer der Bewegung in Sekunden (nach der Ruhephase). */
  private get motionDuration(): number {
    return Math.max(0.001, this.movingTime(this.lifetime))
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
      const moving = this.movingTime(this.elapsed)
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
      const moving = this.movingTime(this.elapsed) + this.motionShift
      t = Math.min(1, Math.max(0, moving / this.motionDuration))
    }
    this.track.update(this.elapsed)
    const { size, fit } = this.loaded
    let k = evaluateShot(this.shot, t, size, screen, fit.scale)
    // Vor der 3D-Welt: Kamera weich zurück ins Gesamtbild – so steht das Foto am Ende genau
    // so da wie die Kachel, mit der die Welt beginnt (den Rand blendet dann die Welt aus).
    if (this.settle) {
      const u = Math.min(1, Math.max(0, (this.elapsed - this.settle.start) / this.settle.len))
      const settled = u * u * (3 - 2 * u)
      k = { zoom: k.zoom + (1 - k.zoom) * settled, x: k.x * (1 - settled), y: k.y * (1 - settled) }
    }
    this.lastProgress = t
    this.lastZoom = k.zoom
    this.lastKey = k

    const cx = screen.w / 2
    const cy = screen.h / 2
    this.photo.scale.set(fit.scale * k.zoom)
    this.photo.position.set(cx + k.x, cy + k.y)
    if (this.backdrop.visible) placeBackdrop(this.backdrop, this.loaded.fill, screen, k)
  }

  /**
   * Neu-Fokus (Taste p bzw. P): Die laufende Bewegung geht weich ins Gesamtbild über
   * (`settleLen` Sekunden), danach fährt die Kamera die Person bzw. Person und Partner an.
   * Das Foto steht dafür so lange, wie ein Fokus-Foto stehen würde (inkl. Verlängerung).
   * Vor der 3D-Welt (Rückzug läuft schon) passiert nichts.
   */
  refocus(target: FocusTarget, settings: Settings, settleLen = 1.5): boolean {
    if (this.settle) return false
    this.setFrozen(false)
    const { size, fit, original, pixelRatio } = this.loaded
    // Nicht stärker zoomen, als die geladene Auflösung hergibt (ohne Fokus wird das Foto
    // kleiner geladen) und als die Zoomgrenze erlaubt.
    const texCap = size.w < original.w ? 1.3 / Math.max(1e-6, fit.scale * pixelRatio) : Infinity
    const cap = Math.max(1, Math.min(this.maxZoom, texCap))
    // Fahrten von der Seite passen nicht: Es geht immer vom Gesamtbild aus.
    const plan: FocusPlan =
      target.plan.mode === 'journey' ? { ...target.plan, mode: 'slowZoom' } : target.plan
    const focusShot = limitShot(
      planFocusShot(
        size,
        this.screen,
        fit.scale,
        target.face,
        target.others,
        plan,
        Math.random,
        target.partner
      ),
      cap
    )
    const stations = focusShot.path ?? [
      { ...focusShot.from, t: 0 },
      { ...focusShot.to, t: 1 }
    ]
    const extra = pick(target.partner ? settings.focusPairExtraTime : settings.focusExtraTime)
    const duration = Math.max(
      pick(settings.displayDuration) + Math.max(0, extra),
      5,
      stations.length * 2
    )
    const total = settleLen + duration + this.fadeOut
    const a = settleLen / total
    const from = { ...this.lastKey, t: 0 }
    const wide = { zoom: 1, x: 0, y: 0, t: a }
    const path = [from, wide, ...stations.slice(1).map((s) => ({ ...s, t: a + s.t * (1 - a) }))]
    this.shot = { from, to: path[path.length - 1], path }
    this.restart = this.elapsed
    this.motionShift = 0
    this.display = this.elapsed - this.fadeIn + settleLen + duration
    this.activeFocus = target
    const pan = target.others.length ? plan.others : 'off'
    this.motionText =
      t('show.motionFocus', { mode: FOCUS_LABELS[plan.mode] }) +
      (pan === 'off' ? '' : pan === 'before' ? t('show.panBefore') : t('show.panAfter'))
    return true
  }

  /**
   * Vor der 3D-Welt: in den letzten `len` Sekunden (bzw. ab jetzt, `now`) weich ins
   * Gesamtbild zurück und die Randfüllung ausblenden. Verlängert die Standzeit bei Bedarf.
   */
  settleToWhole(len: number, now = false): void {
    if (this.settle) return
    this.setFrozen(false)
    const start = now ? this.elapsed : Math.max(this.elapsed, this.fadeIn + this.display - len)
    this.settle = { start, len }
    this.display = now
      ? start + len - this.fadeIn
      : Math.max(this.display, start + len - this.fadeIn)
  }

  get settling(): boolean {
    return this.settle !== null
  }

  hurry(fade: number): void {
    this.setFrozen(false)
    this.shorten(fade)
    this.track.leaveAll()
  }

  leaveTexts(): void {
    this.track.leaveAll()
  }

  destroy(): void {
    this.track.destroy()
    this.view.destroy({ children: true })
    this.loaded.destroy()
  }
}
