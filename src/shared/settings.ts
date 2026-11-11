import { z } from 'zod'
import type { Range, WeightedOption } from './random'

/**
 * Einstellungen der Diashow. Jedes Feld hat einen Standardwert und fällt bei
 * ungültigem Inhalt darauf zurück, damit eine beschädigte Datei nie den Start verhindert.
 */

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

export const MOTION_KINDS = ['zoomIn', 'zoomOut', 'pan'] as const
export type MotionKind = (typeof MOTION_KINDS)[number]

export const MOTION_LABELS: Record<MotionKind, string> = {
  zoomIn: 'Hineinzoomen',
  zoomOut: 'Herauszoomen',
  pan: 'Schwenk'
}

const defaultMotionKinds: WeightedOption<MotionKind>[] = [
  { id: 'zoomIn', enabled: true, weight: 2 },
  { id: 'zoomOut', enabled: true, weight: 1 },
  { id: 'pan', enabled: true, weight: 1 }
]

export const settingsSchema = z.object({
  /** Fotoordner (absoluter Pfad), leer = noch nicht gewählt. */
  photoFolder: field(z.string(), ''),
  includeSubfolders: field(z.boolean(), true),
  /** Anzeigedauer pro Foto in Sekunden (ohne Überblendung). */
  displayDuration: field(rangeSchema, { min: 6, max: 10, mode: 'random' } satisfies Range),
  /** Überblenddauer in Sekunden. */
  transitionDuration: field(rangeSchema, { min: 1.2, max: 2.5, mode: 'random' } satisfies Range),
  /** Bewegungsintensität: zusätzlicher Zoom, 0.15 = 15 %. */
  motionIntensity: field(rangeSchema, { min: 0.08, max: 0.2, mode: 'random' } satisfies Range),
  motionKinds: field(weightedSchema(MOTION_KINDS), defaultMotionKinds),
  /**
   * Bis zu diesem Anteil darf ein Foto beschnitten werden, um den Bildschirm ganz zu füllen.
   * Darüber wird eingepasst und der Rand aufgefüllt. 0.12 = 12 %.
   */
  maxCrop: field(z.number().min(0).max(0.5), 0.12)
})

export type Settings = z.infer<typeof settingsSchema>

export function parseSettings(raw: unknown): Settings {
  const input = raw && typeof raw === 'object' ? raw : {}
  return settingsSchema.parse(input)
}

export const defaultSettings: Settings = parseSettings({})
