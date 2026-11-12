import { Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js'
import type { EffectId } from '@shared/settings'
import type { Size } from '../motion'

/** Formen in der gemeinsamen Partikel-Textur (alle Partikel eines Containers teilen sie). */
const SHAPES = ['dot', 'rect', 'heart', 'star', 'petal', 'ring'] as const
type Shape = (typeof SHAPES)[number]
const CELL = 64

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number): void {
  const c = CELL / 2
  ctx.save()
  ctx.translate(x + c, y + c)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  switch (shape) {
    case 'dot': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.35, 'rgba(255,255,255,0.8)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(-c, -c, CELL, CELL)
      break
    }
    case 'rect':
      ctx.fillRect(-10, -20, 20, 40)
      break
    case 'heart':
      ctx.beginPath()
      ctx.moveTo(0, 18)
      ctx.bezierCurveTo(-30, -2, -18, -26, 0, -12)
      ctx.bezierCurveTo(18, -26, 30, -2, 0, 18)
      ctx.fill()
      break
    case 'star': {
      // Vierzackiger Glanzstern mit weichem Kern
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.2, 'rgba(255,255,255,0.6)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? c : 5
        const a = (i * Math.PI) / 4
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'petal':
      ctx.beginPath()
      ctx.ellipse(0, 0, 13, 24, 0.3, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'ring': {
      const g = ctx.createRadialGradient(-8, -8, 2, 0, 0, 28)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(0.25, 'rgba(255,255,255,0.12)')
      g.addColorStop(0.85, 'rgba(255,255,255,0.25)')
      g.addColorStop(1, 'rgba(255,255,255,0.8)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, 28, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

let atlas: Record<Shape, Texture> | null = null

/** Gemeinsame Textur mit allen Formen, einmal erzeugt. */
function shapes(): Record<Shape, Texture> {
  if (atlas) return atlas
  const canvas = document.createElement('canvas')
  canvas.width = CELL * SHAPES.length
  canvas.height = CELL
  const ctx = canvas.getContext('2d')!
  SHAPES.forEach((s, i) => drawShape(ctx, s, i * CELL, 0))
  const base = Texture.from(canvas)
  atlas = Object.fromEntries(
    SHAPES.map((s, i) => [
      s,
      new Texture({ source: base.source, frame: new Rectangle(i * CELL, 0, CELL, CELL) })
    ])
  ) as Record<Shape, Texture>
  return atlas
}

/** Zustand eines Partikels zusätzlich zu Position, Größe und Farbe. */
interface Sim {
  p: Particle
  vx: number
  vy: number
  /** Beschleunigung nach unten (Schwerkraft) in px/s². */
  gravity: number
  spin: number
  life: number
  maxLife: number
  scale: number
  /** Seitliches Pendeln: Stärke und Phase. */
  sway: number
  phase: number
  alpha: number
  /** Konfetti dreht sich um die eigene Achse (Größe wechselt). */
  flip: boolean
  twinkle: boolean
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a)
const pickOf = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

const PALETTES = {
  confetti: [0xff4d6d, 0xffd166, 0x06d6a0, 0x4cc9f0, 0x9b5de5, 0xf15bb5, 0xffffff],
  hearts: [0xff4d6d, 0xff758f, 0xff8fab, 0xc9184a, 0xffb3c1],
  petals: [0xffc8dd, 0xffafcc, 0xfde2e4, 0xfad2e1, 0xffffff],
  gold: [0xffd166, 0xffe5a0, 0xfff1c1, 0xf4c95d],
  fireworks: [0xff4d6d, 0xffd166, 0x4cc9f0, 0x80ffdb, 0xf15bb5, 0xffffff]
}

interface EffectSpec {
  /** Partikel pro Sekunde bei voller Intensität (Feuerwerk: Explosionen pro Sekunde). */
  rate: number
  max: number
  additive: boolean
  spawn(screen: Size, k: number, speed: number): Omit<Sim, 'p'> & { shape: Shape; tint: number }
}

/** Grundgrößen beziehen sich auf 1080 px Bildschirmhöhe (k skaliert). */
const SPECS: Record<Exclude<EffectId, 'fireworks'>, EffectSpec> = {
  confetti: {
    rate: 70,
    max: 450,
    additive: false,
    spawn: (s, k, v) => ({
      shape: 'rect',
      tint: pickOf(PALETTES.confetti),
      ...base(rnd(0, s.w), -30 * k, rnd(-40, 40) * k, rnd(140, 260) * k * v, 9999),
      scale: rnd(0.55, 0.95) * k,
      spin: rnd(-6, 6),
      sway: rnd(20, 60) * k,
      flip: true
    })
  },
  snow: {
    rate: 45,
    max: 400,
    additive: false,
    spawn: (s, k, v) => ({
      shape: 'dot',
      tint: 0xffffff,
      ...base(rnd(-0.1, 1.1) * s.w, -20 * k, rnd(-15, 15) * k, rnd(35, 90) * k * v, 9999),
      scale: rnd(0.25, 0.85) * k,
      sway: rnd(10, 35) * k,
      alpha: rnd(0.55, 0.95)
    })
  },
  sparkles: {
    rate: 28,
    max: 160,
    additive: true,
    spawn: (s, k) => ({
      shape: 'star',
      tint: pickOf([0xffffff, 0xfff1c1, 0xffe5a0, 0xd0f4ff]),
      ...base(rnd(0, s.w), rnd(0, s.h), 0, 0, rnd(0.7, 1.6)),
      scale: rnd(0.5, 1.3) * k,
      spin: rnd(-0.5, 0.5),
      twinkle: true
    })
  },
  hearts: {
    rate: 14,
    max: 120,
    additive: false,
    spawn: (s, k, v) => ({
      shape: 'heart',
      tint: pickOf(PALETTES.hearts),
      ...base(rnd(0.05, 0.95) * s.w, s.h + 40 * k, 0, -rnd(70, 140) * k * v, 9999),
      scale: rnd(0.7, 1.4) * k,
      sway: rnd(15, 45) * k,
      alpha: rnd(0.75, 1)
    })
  },
  bubbles: {
    rate: 10,
    max: 90,
    additive: false,
    spawn: (s, k, v) => ({
      shape: 'ring',
      tint: pickOf([0xffffff, 0xd0f4ff, 0xffe0f0, 0xe0ffe8]),
      ...base(rnd(0, 1) * s.w, s.h + 60 * k, 0, -rnd(45, 95) * k * v, 9999),
      scale: rnd(0.7, 1.9) * k,
      sway: rnd(15, 40) * k,
      alpha: rnd(0.55, 0.85)
    })
  },
  petals: {
    rate: 18,
    max: 200,
    additive: false,
    spawn: (s, k, v) => ({
      shape: 'petal',
      tint: pickOf(PALETTES.petals),
      ...base(rnd(-0.3, 0.9) * s.w, -30 * k, rnd(25, 70) * k * v, rnd(40, 90) * k * v, 9999),
      scale: rnd(0.55, 1) * k,
      spin: rnd(-2.5, 2.5),
      sway: rnd(20, 50) * k,
      flip: true,
      alpha: rnd(0.75, 1)
    })
  },
  goldDust: {
    rate: 40,
    max: 300,
    additive: true,
    spawn: (s, k, v) => ({
      shape: 'dot',
      tint: pickOf(PALETTES.gold),
      ...base(rnd(0, s.w), rnd(0.3, 1.05) * s.h, rnd(-10, 10) * k, -rnd(10, 35) * k * v, rnd(3, 6)),
      scale: rnd(0.12, 0.35) * k,
      sway: rnd(5, 15) * k,
      twinkle: true
    })
  }
}

function base(
  x: number,
  y: number,
  vx: number,
  vy: number,
  maxLife: number
): Omit<Sim, 'p'> & { x: number; y: number } {
  return {
    x,
    y,
    vx,
    vy,
    gravity: 0,
    spin: 0,
    life: 0,
    maxLife,
    scale: 1,
    sway: 0,
    phase: Math.random() * Math.PI * 2,
    alpha: 1,
    flip: false,
    twinkle: false
  }
}

/**
 * Ein laufender Partikel-Effekt. Er erzeugt während `duration` Sekunden neue Partikel
 * und läuft dann aus, bis der letzte Partikel verschwunden ist.
 */
export class ParticleEffect {
  readonly view: ParticleContainer
  private readonly sims: Sim[] = []
  private elapsed = 0
  private carry = 0
  private readonly speed: number
  private readonly rate: number
  private readonly maxCount: number
  private readonly alphaScale: number

  constructor(
    readonly kind: EffectId,
    intensity: number,
    private readonly duration: number
  ) {
    const i = Math.min(1, Math.max(0, intensity))
    this.speed = 0.8 + 0.4 * i
    const spec = kind === 'fireworks' ? { rate: 1.6, max: 900, additive: true } : SPECS[kind]
    this.rate = spec.rate * (0.2 + 1.2 * i)
    this.maxCount = Math.round(spec.max * (0.4 + 0.8 * i))
    this.alphaScale = 0.6 + 0.4 * i
    const textures = shapes()
    this.view = new ParticleContainer({
      texture: textures.dot,
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true }
    })
    this.view.blendMode = spec.additive ? 'add' : 'normal'
  }

  /** Restzeit des schnellen Ausblendens (null = läuft normal). */
  private fading: number | null = null
  /** Per Hand ausgelöst: endet mit dem nächsten Übergang. */
  manual = false

  get done(): boolean {
    if (this.fading !== null && this.fading <= 0) return true
    return this.elapsed > this.duration && this.sims.length === 0
  }

  /** Keine neuen Partikel mehr, die vorhandenen in kurzer Zeit ausblenden. */
  fadeOut(seconds = 0.7): void {
    if (this.fading === null) this.fading = seconds
  }

  private add(init: Omit<Sim, 'p'> & { shape: Shape; tint: number; x: number; y: number }): void {
    if (this.sims.length >= this.maxCount) return
    const p = new Particle({
      texture: shapes()[init.shape],
      x: init.x,
      y: init.y,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: init.scale,
      scaleY: init.scale
    })
    p.tint = init.tint
    p.alpha = 0
    this.view.addParticle(p)
    this.sims.push({ ...init, p })
  }

  /** Feuerwerk: eine Explosion an zufälliger Stelle im oberen Bildbereich. */
  private burst(screen: Size, k: number): void {
    const cx = rnd(0.15, 0.85) * screen.w
    const cy = rnd(0.12, 0.5) * screen.h
    const tint = pickOf(PALETTES.fireworks)
    const n = Math.round(rnd(50, 90))
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rnd(-0.05, 0.05)
      const v = rnd(120, 320) * k * this.speed
      this.add({
        ...base(cx, cy, Math.cos(a) * v, Math.sin(a) * v, rnd(1.1, 1.9)),
        shape: 'dot',
        tint,
        gravity: 140 * k,
        scale: rnd(0.2, 0.38) * k
      })
    }
  }

  update(dt: number, screen: Size): void {
    this.elapsed += dt
    const k = screen.h / 1080
    if (this.fading !== null) this.fading -= dt
    const fadeFactor = this.fading === null ? 1 : Math.max(0, this.fading / 0.7)
    // Neue Partikel nur während der Laufzeit, mit sanftem Anlauf in der ersten halben Sekunde.
    if (this.elapsed <= this.duration && this.fading === null) {
      const ramp = Math.min(1, this.elapsed / 0.5)
      this.carry += this.rate * ramp * dt
      while (this.carry >= 1) {
        this.carry -= 1
        if (this.kind === 'fireworks') this.burst(screen, k)
        else this.add(SPECS[this.kind].spawn(screen, k, this.speed) as never)
      }
    }

    for (let i = this.sims.length - 1; i >= 0; i--) {
      const s = this.sims[i]
      s.life += dt
      s.vy += s.gravity * dt
      s.phase += dt * 1.6
      const p = s.p
      p.x += (s.vx + Math.sin(s.phase) * s.sway) * dt
      p.y += s.vy * dt
      p.rotation += s.spin * dt
      const t = s.life / s.maxLife
      let alpha = s.alpha * this.alphaScale * fadeFactor
      if (s.twinkle)
        alpha *= Math.sin(Math.PI * Math.min(1, t)) * (0.75 + 0.25 * Math.sin(s.phase * 5))
      else if (s.maxLife < 100) alpha *= 1 - t * t
      // sanft einblenden
      alpha *= Math.min(1, s.life / 0.25)
      p.alpha = Math.max(0, alpha)
      if (s.flip) {
        p.scaleY = s.scale * Math.abs(Math.cos(s.phase * 1.7))
        p.scaleX = s.scale
      }
      const gone =
        t >= 1 ||
        p.y > screen.h + 80 * k ||
        p.y < -120 * k ||
        p.x < -120 * k ||
        p.x > screen.w + 120 * k
      if (gone) {
        this.view.removeParticle(p)
        this.sims.splice(i, 1)
      }
    }
  }

  destroy(): void {
    this.view.destroy()
  }
}

/** Verwaltet laufende Effekte über der Bühne. */
export class EffectLayer {
  private readonly effects: ParticleEffect[] = []

  constructor(private readonly host: { addChild(c: ParticleContainer): void }) {}

  start(kind: EffectId, intensity: number, duration: number, manual = false): void {
    const effect = new ParticleEffect(kind, intensity, duration)
    effect.manual = manual
    this.effects.push(effect)
    this.host.addChild(effect.view)
  }

  /** Per Hand ausgelöste Effekte beenden (beim Übergang zum nächsten Bild). */
  endManual(): void {
    for (const e of this.effects) if (e.manual) e.fadeOut()
  }

  update(dt: number, screen: Size): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]
      e.update(dt, screen)
      if (e.done) {
        e.destroy()
        this.effects.splice(i, 1)
      }
    }
  }
}
