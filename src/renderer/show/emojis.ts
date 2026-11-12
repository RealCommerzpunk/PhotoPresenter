import { gsap } from 'gsap'
import { coveredArea, type Rect } from './faceAvoid'

/** Höchstens so viele Emojis gleichzeitig; das älteste weicht. */
const MAX_EMOJIS = 14

interface Floating {
  el: HTMLElement
  /** Mittelpunkt in Prozent der Bühne. */
  x: number
  y: number
  tweens: gsap.core.Tween[]
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a)

/**
 * Große, schwebende Emojis über dem aktuellen Foto (nur per Fernbedienung).
 * HTML + GSAP; sie verschwinden mit dem nächsten Übergang.
 */
export class EmojiLayer {
  private items: Floating[] = []

  constructor(private readonly host: HTMLElement) {}

  get count(): number {
    return this.items.length
  }

  /**
   * Emoji-Glyphen einmal kaum sichtbar in voller Größe zeichnen, damit das erste Emoji in
   * der Show nicht ruckelt (die Farbschrift wird beim ersten Mal teuer gerastert).
   */
  warmUp(emojis: string[]): void {
    const el = document.createElement('div')
    el.className = 'emoji'
    el.textContent = emojis.join('')
    Object.assign(el.style, {
      left: '0',
      top: '0',
      fontSize: '17vmin',
      opacity: '0.01',
      // umbrechen, damit alle Glyphen im Bild liegen und wirklich gezeichnet werden
      width: '100vw',
      lineBreak: 'anywhere'
    })
    this.host.appendChild(el)
    window.setTimeout(() => el.remove(), 1500)
  }

  /** `faces`: Gesichter auf dem Bildschirm (CSS-Pixel), die frei bleiben sollen. */
  show(emoji: string, faces: Rect[] = []): void {
    if (this.items.length >= MAX_EMOJIS) this.remove(this.items[0], 0.3)
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100
    const size = rand(13, 21)
    const { x, y } = this.freeSpot(faces, size * vmin)
    const el = document.createElement('div')
    el.className = 'emoji'
    el.textContent = emoji
    el.style.left = `${x}%`
    el.style.top = `${y}%`
    el.style.fontSize = `${size.toFixed(1)}vmin`
    this.host.appendChild(el)

    const item: Floating = { el, x, y, tweens: [] }
    gsap.set(el, { xPercent: -50, yPercent: -50 })
    const tilt = rand(-12, 12)
    item.tweens.push(
      gsap.fromTo(
        el,
        { scale: 0, rotation: tilt * 3, opacity: 0 },
        { scale: 1, rotation: tilt, opacity: 1, duration: 0.7, ease: 'back.out(2.4)' }
      ),
      // Schweben: auf und ab, seitlich und leicht kippend, jeweils in eigenem Takt.
      gsap.to(el, {
        y: -rand(2.5, 5) * vmin,
        duration: rand(1.5, 2.3),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1
      }),
      gsap.to(el, {
        x: rand(-2.5, 2.5) * vmin,
        duration: rand(2.2, 3.4),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1
      }),
      gsap.to(el, {
        rotation: tilt + rand(-9, 9),
        duration: rand(1.8, 2.8),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 0.7
      })
    )
    this.items.push(item)
  }

  /** Alle Emojis ausblenden (beim Übergang zum nächsten Bild). */
  clear(): void {
    for (const item of [...this.items]) this.remove(item, 0.6)
  }

  private remove(item: Floating, duration: number): void {
    this.items = this.items.filter((i) => i !== item)
    for (const t of item.tweens) t.kill()
    gsap.to(item.el, {
      scale: 0.4,
      opacity: 0,
      y: '-=40',
      duration,
      ease: 'power2.in',
      onComplete: () => item.el.remove()
    })
  }

  /**
   * Platz aus Zufallskandidaten: zuerst keine Gesichter verdecken (Emoji samt Schwebeweg),
   * dann möglichst weit weg von den vorhandenen Emojis.
   */
  private freeSpot(faces: Rect[], sizePx: number): { x: number; y: number } {
    const W = window.innerWidth
    const H = window.innerHeight
    // Glyphe ist etwa so groß wie die Schrift, dazu der Schwebeweg (±2,5 vmin seitlich, 5 hoch)
    const vmin = Math.min(W, H) / 100
    const half = sizePx * 0.55 + 2.5 * vmin
    let best = { x: 50, y: 45 }
    let bestScore = -Infinity
    for (let i = 0; i < 40; i++) {
      const c = { x: rand(12, 88), y: rand(14, 80) }
      const px = (c.x / 100) * W
      const py = (c.y / 100) * H
      const rect = { x: px - half, y: py - half - 5 * vmin, w: 2 * half, h: 2 * half + 5 * vmin }
      const covered = coveredArea(rect, faces) / (rect.w * rect.h)
      const dist = Math.min(100, ...this.items.map((o) => Math.hypot((o.x - c.x) * 1.6, o.y - c.y)))
      // Gesichter frei zu halten ist wichtiger als Abstand zu anderen Emojis.
      const score = dist - covered * 400
      if (score > bestScore) {
        best = c
        bestScore = score
      }
    }
    return best
  }
}
