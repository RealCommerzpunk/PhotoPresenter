import { gsap } from 'gsap'
import type { AnimIn, AnimOut } from '@shared/text'

/** Teile eines Textes, die animiert werden können. */
export interface TextParts {
  /** Kasten mit Hintergrund (Milchglas, Band …). */
  box: HTMLElement
  /** Element mit dem Text. */
  text: HTMLElement
  lines: HTMLElement[]
  words: HTMLElement[]
  chars: HTMLElement[]
  /** Schatten des Stils, um ihn nach Glitch-Effekten wiederherzustellen. */
  textShadow: string
}

type Builder = (p: TextParts) => gsap.core.Timeline

const rnd = gsap.utils.random

/** Versatz zwischen Buchstaben, damit lange Texte nicht ewig dauern. */
function charStagger(p: TextParts, perChar: number, maxTotal: number): number {
  return Math.min(perChar, maxTotal / Math.max(1, p.chars.length))
}

function glitchBurst(
  tl: gsap.core.Timeline,
  p: TextParts,
  at: number | string,
  count: number
): void {
  tl.set(p.text, { textShadow: '0.06em 0 #ff00c8, -0.06em 0 #00f0ff' }, at)
  for (let i = 0; i < count; i++) {
    tl.to(p.text, {
      x: () => rnd(-14, 14),
      skewX: () => rnd(-18, 18),
      clipPath: () => {
        const top = rnd(0, 70)
        return `inset(${top}% 0 ${Math.max(0, 100 - top - rnd(15, 45))}% 0)`
      },
      duration: 0.05,
      ease: 'steps(1)'
    })
  }
  tl.to(p.text, { x: 0, skewX: 0, clipPath: 'inset(-50% -50% -50% -50%)', duration: 0.05 })
  tl.set(p.text, { textShadow: p.textShadow })
}

export const IN: Record<AnimIn, Builder> = {
  fadeUp: (p) =>
    gsap
      .timeline({ paused: true })
      .fromTo(
        p.box,
        { autoAlpha: 0, y: 30, filter: 'blur(10px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.4, ease: 'power3.out' }
      ),

  letters: (p) =>
    gsap
      .timeline({ paused: true })
      .from(p.box, { autoAlpha: 0, duration: 0.4 }, 0)
      .from(
        p.chars,
        {
          autoAlpha: 0,
          y: 12,
          filter: 'blur(8px)',
          duration: 0.8,
          ease: 'power2.out',
          stagger: charStagger(p, 0.05, 1.8)
        },
        0.1
      ),

  typewriter: (p) => {
    const tl = gsap.timeline({ paused: true }).from(p.box, { autoAlpha: 0, duration: 0.3 })
    const caret = document.createElement('span')
    caret.className = 'pp-caret'
    caret.textContent = '▍'
    tl.set(p.chars, { autoAlpha: 0 }, 0)
    tl.call(() => p.chars[0]?.before(caret), [], 0.3)
    const step = charStagger(p, 0.06, 3.5)
    p.chars.forEach((c, i) => {
      tl.set(c, { autoAlpha: 1 }, 0.3 + i * step)
      tl.call(() => c.after(caret), [], 0.3 + i * step)
    })
    tl.to(caret, { autoAlpha: 0, duration: 0.3, repeat: 3, yoyo: true }, '+=0.2')
    tl.call(() => caret.remove())
    return tl
  },

  wordsUp: (p) =>
    gsap.timeline({ paused: true }).from(p.box, { autoAlpha: 0, duration: 0.5 }, 0).from(
      p.words,
      {
        autoAlpha: 0,
        yPercent: 90,
        rotationX: -75,
        transformOrigin: '50% 100%',
        duration: 0.9,
        ease: 'back.out(1.6)',
        stagger: 0.12
      },
      0.15
    ),

  zoom: (p) =>
    gsap
      .timeline({ paused: true })
      .fromTo(
        p.box,
        { autoAlpha: 0, scale: 1.5, filter: 'blur(14px)' },
        { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 1.8, ease: 'expo.out' }
      ),

  handwriting: (p) => {
    const tl = gsap.timeline({ paused: true }).from(p.box, { autoAlpha: 0, duration: 0.2 })
    for (const line of p.lines) {
      tl.fromTo(
        line,
        { clipPath: 'inset(-30% 100% -30% -5%)' },
        {
          clipPath: 'inset(-30% -5% -30% -5%)',
          duration: 0.4 + 0.06 * (line.textContent?.length ?? 10),
          ease: 'none'
        }
      )
    }
    return tl
  },

  kinetic: (p) =>
    gsap.timeline({ paused: true }).from(p.words, {
      autoAlpha: 0,
      scale: 0,
      rotation: () => rnd(-25, 25),
      duration: 0.8,
      ease: 'elastic.out(1, 0.55)',
      stagger: 0.14
    }),

  glitch: (p) => {
    const tl = gsap.timeline({ paused: true }).set(p.box, { autoAlpha: 1 })
    tl.from(p.chars, { autoAlpha: 0, duration: 0.01, stagger: { each: 0.025, from: 'random' } })
    glitchBurst(tl, p, '-=0.2', 6)
    glitchBurst(tl, p, '+=0.3', 3)
    return tl
  },

  wave: (p) =>
    gsap.timeline({ paused: true }).from(p.chars, {
      autoAlpha: 0,
      y: -60,
      duration: 0.9,
      ease: 'bounce.out',
      stagger: charStagger(p, 0.045, 1.6)
    })
}

export const OUT: Record<AnimOut, Builder> = {
  fade: (p) =>
    gsap.timeline({ paused: true }).to(p.box, {
      autoAlpha: 0,
      y: -20,
      filter: 'blur(6px)',
      duration: 1,
      ease: 'power2.in'
    }),

  lettersOut: (p) =>
    gsap
      .timeline({ paused: true })
      .to(p.chars, {
        autoAlpha: 0,
        y: -10,
        filter: 'blur(6px)',
        duration: 0.5,
        ease: 'power2.in',
        stagger: { each: charStagger(p, 0.03, 1), from: 'end' }
      })
      .to(p.box, { autoAlpha: 0, duration: 0.3 }, '-=0.2'),

  zoomOut: (p) =>
    gsap.timeline({ paused: true }).to(p.box, {
      autoAlpha: 0,
      scale: 0.75,
      filter: 'blur(10px)',
      duration: 0.9,
      ease: 'power2.in'
    }),

  wordsOut: (p) =>
    gsap
      .timeline({ paused: true })
      .to(p.words, {
        autoAlpha: 0,
        yPercent: 90,
        rotation: () => rnd(-12, 12),
        duration: 0.6,
        ease: 'power2.in',
        stagger: 0.06
      })
      .to(p.box, { autoAlpha: 0, duration: 0.3 }, '-=0.2'),

  glitchOut: (p) => {
    const tl = gsap.timeline({ paused: true })
    glitchBurst(tl, p, 0, 4)
    tl.to(p.chars, { autoAlpha: 0, duration: 0.01, stagger: { each: 0.02, from: 'random' } })
    tl.set(p.box, { autoAlpha: 0 })
    return tl
  }
}
