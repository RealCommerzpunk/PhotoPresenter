import { z } from 'zod'

/** Texte, Stile und Animationen. Wird von Show und Einstellungsfenster gemeinsam genutzt. */

// ---------- Schriften (gebündelt über Fontsource, Lizenz OFL) ----------

export const FONTS = {
  playfair: { family: 'Playfair Display', label: 'Playfair Display (elegant)' },
  cinzel: { family: 'Cinzel', label: 'Cinzel (Kino, Versalien)' },
  dancing: { family: 'Dancing Script', label: 'Dancing Script (Handschrift)' },
  caveat: { family: 'Caveat', label: 'Caveat (Notiz)' },
  bebas: { family: 'Bebas Neue', label: 'Bebas Neue (Plakat)' },
  montserrat: { family: 'Montserrat', label: 'Montserrat (modern)' },
  courier: { family: 'Courier Prime', label: 'Courier Prime (Schreibmaschine)' },
  pacifico: { family: 'Pacifico', label: 'Pacifico (Retro)' }
} as const
export type FontId = keyof typeof FONTS
const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]]

// ---------- Animationen ----------

export const ANIMS_IN = {
  fadeUp: 'Sanft einblenden',
  letters: 'Buchstaben erscheinen',
  typewriter: 'Schreibmaschine',
  wordsUp: 'Wörter fliegen hoch',
  zoom: 'Heranzoomen',
  handwriting: 'Schreiben (Handschrift)',
  kinetic: 'Wörter springen',
  glitch: 'Glitch',
  wave: 'Welle'
} as const
export type AnimIn = keyof typeof ANIMS_IN

export const ANIMS_OUT = {
  fade: 'Sanft ausblenden',
  lettersOut: 'Buchstaben verschwinden',
  zoomOut: 'Wegzoomen',
  wordsOut: 'Wörter fallen',
  glitchOut: 'Glitch'
} as const
export type AnimOut = keyof typeof ANIMS_OUT

export const EFFECTS = {
  shadow: 'Schatten',
  glow: 'Leuchten',
  outline: 'Kontur',
  gradient: 'Farbverlauf',
  none: 'ohne'
} as const
export const BOXES = {
  none: 'ohne',
  glass: 'Milchglas',
  band: 'Band',
  solid: 'Fläche'
} as const
export const POSITIONS = {
  center: 'Mitte',
  top: 'Oben',
  bottom: 'Unten',
  lowerThird: 'Unteres Drittel (links)'
} as const

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
    label: 'Elegant',
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
    label: 'Kino',
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
    label: 'Schreibmaschine',
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
    label: 'Handschrift',
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
    label: 'Notiz',
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
    label: 'Plakat',
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
    label: 'Neon',
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
    label: 'Minimal',
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
    label: 'Retro',
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
    label: 'Festlich',
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
    label: 'Untertitel',
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
    label: 'Zitat',
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

export const PLACEMENTS = {
  before: 'vor dem Foto',
  after: 'nach dem Foto',
  over: 'über dem Foto'
} as const

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
  style: z.string()
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
