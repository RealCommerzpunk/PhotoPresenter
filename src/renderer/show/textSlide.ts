import { t } from '@shared/i18n'
import { Container, FillGradient, Graphics, ImageSource, Sprite, Texture } from 'pixi.js'
import { pick } from '@shared/random'
import type { Settings, TextBackgroundId } from '@shared/settings'
import type { TextItem, TextStyle } from '@shared/text'
import { TextOverlay } from '../text/overlay'
import { AnimatedBackground, colorsFrom } from './effects/backgrounds'
import type { Size } from './motion'
import { OverlayTrack, TimedScene, type Scene } from './scene'

/**
 * Textfolie statt eines Fotos. Hintergrund ist das zugehörige Foto, stark weichgezeichnet
 * und langsam zoomend, oder ein dunkler Verlauf, wenn es kein Foto dazu gibt.
 */
export class TextSlide extends TimedScene implements Scene {
  readonly view = new Container()
  private readonly bg: Sprite | null = null
  private readonly gradient: Graphics | null = null
  private readonly shade = new Graphics()
  private readonly track = new OverlayTrack()
  private readonly texture: Texture | null = null
  private readonly animated: AnimatedBackground | null = null
  private readonly zoomFrom = 1.08 + Math.random() * 0.05
  private readonly zoomTo = 1.18 + Math.random() * 0.08

  constructor(
    readonly item: TextItem,
    style: TextStyle,
    private readonly background: ImageBitmap | null,
    settings: Settings,
    fadeIn: number,
    textHost: HTMLElement,
    /** Hintergrund: weichgezeichnetes Foto oder ein animierter Hintergrund. */
    backgroundKind: TextBackgroundId = 'photo'
  ) {
    super(fadeIn)
    if (backgroundKind !== 'photo') {
      // Animierter Hintergrund in den Farben des Fotos.
      const [a, b] = colorsFrom(background)
      this.animated = new AnimatedBackground(backgroundKind, a, b)
      this.view.addChild(this.animated.view)
    } else if (background) {
      this.texture = new Texture({ source: new ImageSource({ resource: background }) })
      this.bg = new Sprite(this.texture)
      this.bg.anchor.set(0.5)
      this.view.addChild(this.bg)
    } else {
      this.gradient = new Graphics()
      this.view.addChild(this.gradient)
    }
    this.view.addChild(this.shade)

    const overlay = new TextOverlay(textHost, item.text, style)
    const start = fadeIn * 0.5
    const hold = pick(settings.textDuration)
    this.display = Math.max(
      0.5,
      start - fadeIn + overlay.inDuration + hold + overlay.outDuration + 0.4
    )
    this.track.add(overlay, start, fadeIn + this.display - overlay.outDuration - 0.3)
    this.fadeOut = pick(settings.transitionDuration)
  }

  get label(): string {
    const first = this.item.text.trim().split('\n')[0]
    return t('show.textLabel', { text: first.length > 50 ? first.slice(0, 50) + '…' : first })
  }

  readonly photoName = undefined

  update(dt: number, screen: Size): void {
    this.elapsed += dt
    this.track.update(this.elapsed)
    const t = Math.min(1, this.elapsed / Math.max(0.001, this.lifetime))

    if (this.animated) {
      this.animated.update(dt, screen)
    } else if (this.bg) {
      const cover = Math.max(screen.w / this.bg.texture.width, screen.h / this.bg.texture.height)
      this.bg.scale.set(cover * (this.zoomFrom + (this.zoomTo - this.zoomFrom) * t))
      this.bg.position.set(screen.w / 2, screen.h / 2)
    } else if (this.gradient && this.gradient.width !== screen.w) {
      const fill = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        colorStops: [
          { offset: 0, color: '#1b1830' },
          { offset: 1, color: '#0c0b14' }
        ]
      })
      this.gradient.clear().rect(0, 0, screen.w, screen.h).fill(fill)
    }
    // leicht abdunkeln, damit der Text gut lesbar ist
    if (this.shade.width !== screen.w) {
      const dim = this.animated ? 0.12 : 0.25
      this.shade.clear().rect(0, 0, screen.w, screen.h).fill({ color: 0x000000, alpha: dim })
    }
  }

  hurry(fade: number): void {
    this.shorten(fade)
    this.track.leaveAll()
  }

  destroy(): void {
    this.track.destroy()
    this.animated?.destroy()
    this.view.destroy({ children: true })
    this.texture?.destroy(true)
    this.background?.close()
  }
}
