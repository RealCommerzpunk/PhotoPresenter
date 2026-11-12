import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'
import type { TextStyle } from '@shared/text'
import { IN, OUT, type TextParts } from './animations'
import { fontFamily } from './fonts'
import { bestPlace, type Rect } from '../show/faceAvoid'
import './overlay.css'

gsap.registerPlugin(SplitText)

/** Positionen der Stile plus zusätzliche Ecken, auf die Texte über Fotos ausweichen können. */
export type Position = TextStyle['position'] | 'upperLeft' | 'upperRight' | 'lowerRight'

/** Ausweichplätze über Fotos in der Reihenfolge der Vorliebe (nach der Position des Stils). */
const FALLBACKS: Position[] = [
  'bottom',
  'top',
  'lowerThird',
  'lowerRight',
  'upperLeft',
  'upperRight',
  'center'
]

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function shadowFor(style: TextStyle): string {
  switch (style.effect) {
    case 'shadow':
      return '0 0.04em 0.25em rgba(0,0,0,0.65), 0 0 0.05em rgba(0,0,0,0.4)'
    case 'glow':
      return `0 0 0.12em ${style.accent}, 0 0 0.4em ${style.accent}, 0 0 0.9em ${style.accent}`
    case 'outline':
      return '0 0.05em 0.2em rgba(0,0,0,0.5)'
    default:
      return 'none'
  }
}

const POSITION_CSS: Record<Position, Partial<CSSStyleDeclaration>> = {
  center: { justifyContent: 'center', alignItems: 'center' },
  top: { justifyContent: 'center', alignItems: 'flex-start', paddingTop: '9cqh' },
  bottom: { justifyContent: 'center', alignItems: 'flex-end', paddingBottom: '7cqh' },
  lowerThird: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingBottom: '13cqh',
    paddingLeft: '7cqw'
  },
  upperLeft: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingTop: '9cqh',
    paddingLeft: '7cqw'
  },
  upperRight: {
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingTop: '9cqh',
    paddingRight: '7cqw'
  },
  lowerRight: {
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: '13cqh',
    paddingRight: '7cqw'
  }
}

/**
 * Ein animierter Text über dem Bild. Der umgebende Container braucht
 * `container-type: size`, weil die Schriftgröße in `cqh` angegeben ist.
 */
export class TextOverlay {
  private readonly root: HTMLDivElement
  private readonly box: HTMLDivElement
  private readonly split: SplitText
  private readonly tlIn: gsap.core.Timeline
  private readonly tlOut: gsap.core.Timeline
  private state: 'idle' | 'in' | 'out' | 'done' = 'idle'

  constructor(host: HTMLElement, text: string, style: TextStyle, position?: Position) {
    const root = document.createElement('div')
    root.className = 'pp-text-root'

    const box = document.createElement('div')
    box.className = `pp-text-box pp-box-${style.box}`
    if (style.box === 'solid') box.style.background = style.accent

    const el = document.createElement('div')
    el.className = 'pp-text'
    const shown = style.quotes ? `„${text.trim()}“` : text.trim()
    el.innerHTML = escapeHtml(shown).replace(/\n/g, '<br>')
    Object.assign(el.style, {
      fontFamily: fontFamily(style),
      fontWeight: String(style.weight),
      fontStyle: style.italic ? 'italic' : 'normal',
      textTransform: style.uppercase ? 'uppercase' : 'none',
      letterSpacing: `${style.letterSpacing}em`,
      fontSize: `${style.size}cqh`,
      color: style.color,
      textAlign: style.align,
      textShadow: shadowFor(style)
    } satisfies Partial<CSSStyleDeclaration>)
    if (style.effect === 'outline') {
      el.style.setProperty('-webkit-text-stroke', `0.035em ${style.accent}`)
      el.style.setProperty('paint-order', 'stroke fill')
    }

    box.appendChild(el)
    root.appendChild(box)
    host.appendChild(root)
    this.root = root
    this.box = box
    this.setPosition(position ?? style.position)

    this.split = SplitText.create(el, { type: 'lines,words,chars', linesClass: 'pp-line' })
    if (style.effect === 'gradient') {
      // Verlauf je Buchstabe (senkrecht), damit er auch bei animierten Buchstaben stimmt.
      const grad = `linear-gradient(180deg, ${style.color} 25%, ${style.accent} 100%)`
      for (const c of this.split.chars as HTMLElement[]) {
        c.style.backgroundImage = grad
        c.style.setProperty('-webkit-background-clip', 'text')
        c.style.backgroundClip = 'text'
        c.style.color = 'transparent'
      }
    }

    const parts: TextParts = {
      box,
      text: el,
      lines: this.split.lines as HTMLElement[],
      words: this.split.words as HTMLElement[],
      chars: this.split.chars as HTMLElement[],
      textShadow: el.style.textShadow
    }
    this.tlIn = IN[style.animIn](parts)
    this.tlOut = OUT[style.animOut](parts)
    this.tlOut.eventCallback('onComplete', () => {
      this.state = 'done'
    })
  }

  setPosition(position: Position): void {
    const s = this.root.style
    s.paddingTop = s.paddingBottom = s.paddingLeft = s.paddingRight = ''
    Object.assign(s, POSITION_CSS[position])
  }

  /**
   * Platz wählen, an dem der Text möglichst keine Gesichter verdeckt: zuerst `preferred`,
   * dann die Ausweichplätze. Gemessen wird der Textkasten ohne Animations-Transform.
   */
  placeAvoiding(preferred: Position, faces: Rect[]): Position {
    const order = [preferred, ...FALLBACKS.filter((p) => p !== preferred)]
    if (!faces.length) {
      this.setPosition(preferred)
      return preferred
    }
    const candidates = order.map((value) => {
      this.setPosition(value)
      const b = this.box
      return {
        value,
        rect: { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }
      }
    })
    const chosen = bestPlace(candidates, faces)
    this.setPosition(chosen)
    return chosen
  }

  /** Dauer des Einblendens in Sekunden. */
  get inDuration(): number {
    return this.tlIn.duration()
  }

  get outDuration(): number {
    return this.tlOut.duration()
  }

  get finished(): boolean {
    return this.state === 'done'
  }

  playIn(): void {
    if (this.state !== 'idle') return
    this.state = 'in'
    this.root.style.visibility = 'visible'
    this.tlIn.play(0)
  }

  /** Ausblenden; läuft das Einblenden noch, wird es abgebrochen. */
  playOut(): void {
    if (this.state === 'out' || this.state === 'done') return
    if (this.state === 'idle') {
      this.state = 'done'
      return
    }
    this.tlIn.progress(1).pause()
    this.state = 'out'
    this.tlOut.play(0)
  }

  destroy(): void {
    this.tlIn.kill()
    this.tlOut.kill()
    this.split.revert()
    this.root.remove()
  }
}
