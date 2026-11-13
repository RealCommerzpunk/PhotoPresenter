import { z } from 'zod'
import { labelMap, tk } from './i18n'

/** Texte, Stile und Animationen. Wird von Show und Einstellungsfenster gemeinsam genutzt. */

// ---------- Schriften (gebündelt über Fontsource, Lizenz OFL) ----------

export const FONTS = {
  playfair: {
    family: 'Playfair Display',
    get label() {
      return `Playfair Display (${tk('font.playfair')})`
    }
  },
  cinzel: {
    family: 'Cinzel',
    get label() {
      return `Cinzel (${tk('font.cinzel')})`
    }
  },
  dancing: {
    family: 'Dancing Script',
    get label() {
      return `Dancing Script (${tk('font.dancing')})`
    }
  },
  caveat: {
    family: 'Caveat',
    get label() {
      return `Caveat (${tk('font.caveat')})`
    }
  },
  bebas: {
    family: 'Bebas Neue',
    get label() {
      return `Bebas Neue (${tk('font.bebas')})`
    }
  },
  montserrat: {
    family: 'Montserrat',
    get label() {
      return `Montserrat (${tk('font.montserrat')})`
    }
  },
  courier: {
    family: 'Courier Prime',
    get label() {
      return `Courier Prime (${tk('font.courier')})`
    }
  },
  pacifico: {
    family: 'Pacifico',
    get label() {
      return `Pacifico (${tk('font.pacifico')})`
    }
  }
} as const
export type FontId = keyof typeof FONTS
const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]]

// ---------- Animationen ----------

const ANIMS_IN_IDS = [
  'fadeUp',
  'letters',
  'typewriter',
  'wordsUp',
  'zoom',
  'handwriting',
  'kinetic',
  'glitch',
  'wave'
] as const
export const ANIMS_IN: Record<(typeof ANIMS_IN_IDS)[number], string> = labelMap(
  'animIn',
  ANIMS_IN_IDS
)
export type AnimIn = keyof typeof ANIMS_IN

const ANIMS_OUT_IDS = ['fade', 'lettersOut', 'zoomOut', 'wordsOut', 'glitchOut'] as const
export const ANIMS_OUT: Record<(typeof ANIMS_OUT_IDS)[number], string> = labelMap(
  'animOut',
  ANIMS_OUT_IDS
)
export type AnimOut = keyof typeof ANIMS_OUT

const EFFECTS_IDS = ['shadow', 'glow', 'outline', 'gradient', 'none'] as const
export const EFFECTS: Record<(typeof EFFECTS_IDS)[number], string> = labelMap(
  'textEffect',
  EFFECTS_IDS
)
const BOXES_IDS = ['none', 'glass', 'band', 'solid'] as const
export const BOXES: Record<(typeof BOXES_IDS)[number], string> = labelMap('box', BOXES_IDS)
const POSITIONS_IDS = ['center', 'top', 'bottom', 'lowerThird'] as const
export const POSITIONS: Record<(typeof POSITIONS_IDS)[number], string> = labelMap(
  'position',
  POSITIONS_IDS
)

const keys = <T extends object>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

export const textStyleSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  custom: z.boolean().optional(),
  font: z.enum(FONT_IDS),
  weight: z.number().min(100).max(900),
  italic: z.boolean(),
  uppercase: z.boolean(),
  /** Zeichenabstand in em. */
  letterSpacing: z.number(),
  /** Schriftgröße in Prozent der Bildschirmhöhe. */
  size: z.number().min(1).max(30),
  color: z.string(),
  /** Zweitfarbe für Leuchten, Kontur und Verlauf. */
  accent: z.string(),
  effect: z.enum(keys(EFFECTS)),
  box: z.enum(keys(BOXES)),
  align: z.enum(['left', 'center', 'right']),
  position: z.enum(keys(POSITIONS)),
  /** Text in Anführungszeichen „…“ setzen. */
  quotes: z.boolean(),
  animIn: z.enum(keys(ANIMS_IN)),
  animOut: z.enum(keys(ANIMS_OUT))
})
export type TextStyle = z.infer<typeof textStyleSchema>

type Preset = Omit<TextStyle, 'custom'>

export const PRESET_STYLES: Preset[] = [
  {
    id: 'elegant',
    get label() {
      return tk('style.elegant')
    },
    font: 'playfair',
    weight: 400,
    italic: true,
    uppercase: false,
    letterSpacing: 0.01,
    size: 6.5,
    color: '#ffffff',
    accent: '#000000',
    effect: 'shadow',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'fadeUp',
    animOut: 'fade'
  },
  {
    id: 'kino',
    get label() {
      return tk('style.kino')
    },
    font: 'cinzel',
    weight: 600,
    italic: false,
    uppercase: true,
    letterSpacing: 0.25,
    size: 5,
    color: '#f3e6c4',
    accent: '#d4a64a',
    effect: 'glow',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'letters',
    animOut: 'fade'
  },
  {
    id: 'schreibmaschine',
    get label() {
      return tk('style.schreibmaschine')
    },
    font: 'courier',
    weight: 400,
    italic: false,
    uppercase: false,
    letterSpacing: 0,
    size: 4.2,
    color: '#f5f5f0',
    accent: '#000000',
    effect: 'none',
    box: 'band',
    align: 'left',
    position: 'center',
    quotes: false,
    animIn: 'typewriter',
    animOut: 'fade'
  },
  {
    id: 'handschrift',
    get label() {
      return tk('style.handschrift')
    },
    font: 'dancing',
    weight: 600,
    italic: false,
    uppercase: false,
    letterSpacing: 0,
    size: 9,
    color: '#ffffff',
    accent: '#000000',
    effect: 'shadow',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'handwriting',
    animOut: 'fade'
  },
  {
    id: 'notiz',
    get label() {
      return tk('style.notiz')
    },
    font: 'caveat',
    weight: 500,
    italic: false,
    uppercase: false,
    letterSpacing: 0,
    size: 7,
    color: '#fffbe8',
    accent: '#000000',
    effect: 'shadow',
    box: 'glass',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'wordsUp',
    animOut: 'wordsOut'
  },
  {
    id: 'plakat',
    get label() {
      return tk('style.plakat')
    },
    font: 'bebas',
    weight: 400,
    italic: false,
    uppercase: true,
    letterSpacing: 0.04,
    size: 13,
    color: '#ffffff',
    accent: '#ffb347',
    effect: 'gradient',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'kinetic',
    animOut: 'zoomOut'
  },
  {
    id: 'neon',
    get label() {
      return tk('style.neon')
    },
    font: 'montserrat',
    weight: 300,
    italic: false,
    uppercase: false,
    letterSpacing: 0.05,
    size: 6,
    color: '#ffe6fb',
    accent: '#ff3fd2',
    effect: 'glow',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'glitch',
    animOut: 'glitchOut'
  },
  {
    id: 'minimal',
    get label() {
      return tk('style.minimal')
    },
    font: 'montserrat',
    weight: 200,
    italic: false,
    uppercase: true,
    letterSpacing: 0.12,
    size: 4.5,
    color: '#ffffff',
    accent: '#000000',
    effect: 'none',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'letters',
    animOut: 'lettersOut'
  },
  {
    id: 'retro',
    get label() {
      return tk('style.retro')
    },
    font: 'pacifico',
    weight: 400,
    italic: false,
    uppercase: false,
    letterSpacing: 0,
    size: 8,
    color: '#ffd166',
    accent: '#ef476f',
    effect: 'outline',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'wave',
    animOut: 'zoomOut'
  },
  {
    id: 'festlich',
    get label() {
      return tk('style.festlich')
    },
    font: 'cinzel',
    weight: 700,
    italic: false,
    uppercase: false,
    letterSpacing: 0.06,
    size: 6.5,
    color: '#fff4cf',
    accent: '#c99a2e',
    effect: 'gradient',
    box: 'none',
    align: 'center',
    position: 'center',
    quotes: false,
    animIn: 'zoom',
    animOut: 'fade'
  },
  {
    id: 'untertitel',
    get label() {
      return tk('style.untertitel')
    },
    font: 'montserrat',
    weight: 500,
    italic: false,
    uppercase: false,
    letterSpacing: 0.01,
    size: 3.6,
    color: '#ffffff',
    accent: '#000000',
    effect: 'none',
    box: 'band',
    align: 'center',
    position: 'bottom',
    quotes: false,
    animIn: 'fadeUp',
    animOut: 'fade'
  },
  {
    id: 'zitat',
    get label() {
      return tk('style.zitat')
    },
    font: 'playfair',
    weight: 400,
    italic: true,
    uppercase: false,
    letterSpacing: 0,
    size: 5.5,
    color: '#ffffff',
    accent: '#000000',
    effect: 'shadow',
    box: 'glass',
    align: 'center',
    position: 'center',
    quotes: true,
    animIn: 'wordsUp',
    animOut: 'fade'
  }
]

// ---------- Texte ----------

const PLACEMENTS_IDS = ['before', 'after', 'over'] as const
export const PLACEMENTS: Record<(typeof PLACEMENTS_IDS)[number], string> = labelMap(
  'placement',
  PLACEMENTS_IDS
)

export const textItemSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  text: z.string(),
  /** Fülltext statt eines Fotos, oder an bestimmte Fotos gebunden. */
  kind: z.enum(['filler', 'photo']),
  /** Gebundene Fotos (Pfade relativ zum Fotoordner). */
  photos: z.array(z.string()),
  placement: z.enum(keys(PLACEMENTS)),
  /** Stil-ID oder 'random' (Zufall aus den aktiven Stilen). */
  style: z.string(),
  /** Nur auf Abruf (Fernbedienung): kommt nie von selbst im Ablauf. */
  adhoc: z.boolean().optional()
})
export type TextItem = z.infer<typeof textItemSchema>

export const RANDOM_STYLE = 'random'

export function newTextId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export const defaultTexts: TextItem[] = [
  {
    id: 'beispiel-1',
    enabled: true,
    text: 'Die schönsten Momente\nsind die geteilten',
    kind: 'filler',
    photos: [],
    placement: 'over',
    style: RANDOM_STYLE
  },
  {
    id: 'beispiel-2',
    enabled: true,
    text: 'Schön, dass es euch gibt',
    kind: 'filler',
    photos: [],
    placement: 'over',
    style: RANDOM_STYLE
  }
]

/** Alle verfügbaren Stile: Vorlagen und eigene. */
export function allStyles(custom: TextStyle[]): TextStyle[] {
  return [...PRESET_STYLES, ...custom]
}

/** Liest eine Liste und verwirft ungültige Einträge einzeln statt der ganzen Liste. */
export function parseList<T>(raw: unknown, schema: z.ZodType<T>, fallback: T[]): T[] {
  if (!Array.isArray(raw)) return fallback
  const out: T[] = []
  for (const item of raw) {
    const r = schema.safeParse(item)
    if (r.success) out.push(r.data)
  }
  return out
}
