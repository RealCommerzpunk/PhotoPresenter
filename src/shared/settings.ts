import { z } from 'zod'
import type { Range, WeightedOption } from './random'
import {
  defaultTexts,
  parseList,
  PRESET_STYLES,
  textItemSchema,
  textStyleSchema,
  type TextItem,
  type TextStyle
} from './text'

/**
 * Einstellungen der Diashow. Jedes Feld hat einen Standardwert und fällt bei
 * ungültigem Inhalt darauf zurück, damit eine beschädigte Datei nie den Start verhindert.
 */

export const SETTINGS_VERSION = 1

const rangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  mode: z.enum(['fixed', 'random'])
})

const weightedSchema = <T extends string>(ids: readonly [T, ...T[]]) =>
  z.array(z.object({ id: z.enum(ids), enabled: z.boolean(), weight: z.number().min(0) }))

function field<S extends z.ZodType>(schema: S, fallback: z.infer<S>) {
  return schema.default(fallback as never).catch(fallback as never) as unknown as z.ZodType<
    z.infer<S>
  >
}

// ---------- Bewegung ----------

export const MOTION_KINDS = ['zoomIn', 'zoomOut', 'pan', 'journey'] as const
export type MotionKind = (typeof MOTION_KINDS)[number]

export const MOTION_LABELS: Record<MotionKind, string> = {
  zoomIn: 'Hineinzoomen',
  zoomOut: 'Herauszoomen',
  pan: 'Schwenk',
  journey: 'Kamerafahrt'
}

const defaultMotionKinds: WeightedOption<MotionKind>[] = [
  { id: 'zoomIn', enabled: true, weight: 2 },
  { id: 'zoomOut', enabled: true, weight: 1 },
  { id: 'pan', enabled: true, weight: 1 },
  { id: 'journey', enabled: true, weight: 2 }
]

// ---------- Randfüllung ----------

export const FILL_MODES = ['blur', 'ambient', 'mirror'] as const
export type FillMode = (typeof FILL_MODES)[number]

export const FILL_LABELS: Record<FillMode, string> = {
  blur: 'Weichgezeichnet',
  ambient: 'Farbverlauf',
  mirror: 'Gespiegelt'
}

const defaultFillModes: WeightedOption<FillMode>[] = [
  { id: 'blur', enabled: true, weight: 3 },
  { id: 'ambient', enabled: true, weight: 1 },
  { id: 'mirror', enabled: true, weight: 1 }
]

// ---------- Übergänge ----------

export const TRANSITIONS = [
  'fade',
  'fadeBlack',
  'wipe',
  'push',
  'circle',
  'zoomBlur',
  'dissolve',
  'clock',
  'pixelize',
  'ripple',
  'glow',
  'blinds',
  'swirl'
] as const
export type TransitionId = (typeof TRANSITIONS)[number]

export const TRANSITION_LABELS: Record<TransitionId, string> = {
  fade: 'Überblenden',
  fadeBlack: 'Über Schwarz',
  wipe: 'Wischen',
  push: 'Schieben',
  circle: 'Kreis öffnen',
  zoomBlur: 'Zoom-Unschärfe',
  dissolve: 'Auflösen',
  clock: 'Uhrzeiger',
  pixelize: 'Verpixeln',
  ripple: 'Welle',
  glow: 'Lichtblende',
  blinds: 'Jalousie',
  swirl: 'Strudel'
}

const defaultTransitions: WeightedOption<TransitionId>[] = TRANSITIONS.map((id) => ({
  id,
  enabled: true,
  weight: id === 'fade' ? 4 : ['zoomBlur', 'dissolve', 'glow', 'wipe'].includes(id) ? 2 : 1
}))

// ---------- Fokus-Person ----------

export const FOCUS_MODES = ['slowZoom', 'fastZoom', 'journey'] as const
export type FocusMode = (typeof FOCUS_MODES)[number]

export const FOCUS_LABELS: Record<FocusMode, string> = {
  slowZoom: 'Langsam anzoomen',
  fastZoom: 'Schnell anzoomen',
  journey: 'Kamerafahrt zum Gesicht'
}

const defaultFocusModes: WeightedOption<FocusMode>[] = [
  { id: 'slowZoom', enabled: true, weight: 2 },
  { id: 'fastZoom', enabled: true, weight: 1 },
  { id: 'journey', enabled: true, weight: 2 }
]

export const PAN_OTHERS = {
  off: 'nie',
  before: 'vorher über die anderen Gesichter',
  after: 'nachher über die anderen Gesichter',
  random: 'zufällig vorher, nachher oder nie'
} as const
export type PanOthers = keyof typeof PAN_OTHERS

const sampleSchema = z.object({ photo: z.string(), face: z.number().int().min(0), emb: z.string() })
export type FaceSample = z.infer<typeof sampleSchema>

export const personSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** Beispielgesichter: Foto (relativ), Nummer des Gesichts im Index, Merkmalsvektor (Base64). */
  samples: z.array(sampleSchema),
  /** Gegenbeispiele: Gesichter, die ausdrücklich NICHT diese Person sind. */
  negatives: z.array(sampleSchema).default([])
})
export type Person = z.infer<typeof personSchema>

// ---------- Textstile für den Zufall ----------

/** Alle Vorlagen aktiv, außer „Untertitel“ (passt nur über Fotos, nicht als Fülltext). */
const defaultTextStyles: WeightedOption[] = PRESET_STYLES.map((st) => ({
  id: st.id,
  enabled: st.id !== 'untertitel',
  weight: 1
}))

const looseWeighted = z.array(
  z.object({ id: z.string(), enabled: z.boolean(), weight: z.number().min(0) })
)

// ---------- Schema ----------

export const settingsSchema = z.object({
  /** Version des Einstellungsformats, für spätere Umstellungen. */
  version: field(z.number(), SETTINGS_VERSION),
  /** Fotoordner (absoluter Pfad), leer = noch nicht gewählt. */
  photoFolder: field(z.string(), ''),
  includeSubfolders: field(z.boolean(), true),
  /** Anzeigedauer pro Foto in Sekunden (ohne Überblendung). */
  displayDuration: field(rangeSchema, { min: 6, max: 10, mode: 'random' } satisfies Range),
  /** Überblenddauer in Sekunden. */
  transitionDuration: field(rangeSchema, { min: 1.2, max: 2.5, mode: 'random' } satisfies Range),
  transitions: field(weightedSchema(TRANSITIONS), defaultTransitions),
  /** Bewegungsintensität: zusätzlicher Zoom, 0.15 = 15 %. */
  motionIntensity: field(rangeSchema, { min: 0.08, max: 0.2, mode: 'random' } satisfies Range),
  motionKinds: field(weightedSchema(MOTION_KINDS), defaultMotionKinds),
  /**
   * Bis zu diesem Anteil darf ein Foto beschnitten werden, um den Bildschirm ganz zu füllen.
   * Darüber wird eingepasst und der Rand aufgefüllt. 0.12 = 12 %.
   */
  maxCrop: field(z.number().min(0).max(0.5), 0.12),
  fillModes: field(weightedSchema(FILL_MODES), defaultFillModes),
  /** Nach wie vielen Fotos ein Fülltext erscheint. */
  textFillerEvery: field(rangeSchema, { min: 8, max: 15, mode: 'random' } satisfies Range),
  /** Wie lange ein Text steht (ohne Ein- und Ausblenden), in Sekunden. */
  textDuration: field(rangeSchema, { min: 4, max: 6, mode: 'random' } satisfies Range),
  /** Stile, aus denen bei „Zufall“ gewählt wird (Vorlagen und eigene). */
  textStyles: field(looseWeighted, defaultTextStyles),
  /** Fokus-Person: Gesicht in Fotos suchen und anzoomen. */
  focusEnabled: field(z.boolean(), true),
  focusPersonId: field(z.string(), ''),
  /** Ab dieser Ähnlichkeit (Kosinus) gilt ein Gesicht als die Person. */
  focusThreshold: field(z.number().min(0).max(1), 0.38),
  focusModes: field(weightedSchema(FOCUS_MODES), defaultFocusModes),
  /** Gesichtshöhe am Ende des Anzoomens, Anteil der Bildschirmhöhe. */
  focusFaceSize: field(rangeSchema, { min: 0.28, max: 0.42, mode: 'random' } satisfies Range),
  focusPanOthers: field(z.enum(['off', 'before', 'after', 'random']), 'random'),
  /** Fotos mit der Person häufiger zeigen: 0 = normal, 1–3 = zusätzliche Male je Runde. */
  focusBoost: field(z.number().int().min(0).max(3), 1),
  /** Texte, eigene Stile und Personen werden einzeln geprüft (siehe parseSettings). */
  texts: z.unknown().optional(),
  customStyles: z.unknown().optional(),
  persons: z.unknown().optional()
})

type ParsedSchema = z.infer<typeof settingsSchema>
export type Settings = Omit<ParsedSchema, 'texts' | 'customStyles' | 'persons'> & {
  texts: TextItem[]
  customStyles: TextStyle[]
  persons: Person[]
}

/**
 * Gespeicherte Auswahllisten um neue Optionen ergänzen (aus den Standardwerten),
 * Doppelte entfernen und in die Standardreihenfolge bringen. So bleiben die Werte
 * des Nutzers erhalten, wenn eine neue Version Effekte hinzufügt.
 */
function completeWeighted<T extends string>(
  saved: WeightedOption<T>[],
  defaults: WeightedOption<T>[]
): WeightedOption<T>[] {
  const byId = new Map<T, WeightedOption<T>>()
  for (const o of saved) if (!byId.has(o.id)) byId.set(o.id, o)
  return defaults.map((d) => byId.get(d.id) ?? d)
}

export function parseSettings(raw: unknown): Settings {
  const input = raw && typeof raw === 'object' ? raw : {}
  const s = settingsSchema.parse(input)
  const customStyles = parseList(s.customStyles, textStyleSchema, []).map((st) => ({
    ...st,
    custom: true
  }))
  const styleDefaults: WeightedOption[] = [
    ...defaultTextStyles,
    ...customStyles.map((st) => ({ id: st.id, enabled: true, weight: 1 }))
  ]
  return {
    ...s,
    version: SETTINGS_VERSION,
    texts: parseList(s.texts, textItemSchema, defaultTexts),
    customStyles,
    persons: parseList(s.persons, personSchema, []),
    focusModes: completeWeighted(s.focusModes, defaultFocusModes),
    textStyles: completeWeighted(s.textStyles, styleDefaults),
    transitions: completeWeighted(s.transitions, defaultTransitions),
    motionKinds: completeWeighted(s.motionKinds, defaultMotionKinds),
    fillModes: completeWeighted(s.fillModes, defaultFillModes)
  }
}

export const defaultSettings: Settings = parseSettings({})
