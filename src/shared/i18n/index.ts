import { de, type MessageKey } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'

export type { MessageKey } from './de'

/** Sprachen der Oberfläche; Deutsch ist die Quelle, alle anderen müssen jeden Schlüssel haben. */
export const LANGUAGES = ['de', 'en', 'es', 'fr'] as const
export type Language = (typeof LANGUAGES)[number]
/** Einstellung: fest eine Sprache oder die des Systems. */
export type LanguageSetting = Language | 'auto'

/** Namen der Sprachen in ihrer eigenen Sprache (für die Auswahl). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français'
}

export type Messages = Record<MessageKey, string>

export const MESSAGES: Record<Language, Messages> = { de, en, es, fr }

/** Sprache aus der Einstellung und der Systemsprache (z. B. „en-US“); unbekannt → Englisch. */
export function resolveLanguage(setting: string | undefined, locale: string | undefined): Language {
  if (setting && (LANGUAGES as readonly string[]).includes(setting)) return setting as Language
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0]
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : 'en'
}

let current: Language = 'de'

export function setLanguage(lang: Language): void {
  current = lang
}

export function getLanguage(): Language {
  return current
}

export type Params = Record<string, string | number>

/**
 * Text einsetzen: `{name}` wird ersetzt; „Einzahl|Mehrzahl“ wählt anhand von `n`.
 */
export function format(template: string, params?: Params): string {
  let text = template
  if (text.includes('|') && params && typeof params.n === 'number') {
    const [one, other] = text.split('|')
    text = params.n === 1 ? one : other
  }
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in params ? String(params[key]) : m))
}

/** Übersetzung in der aktuellen Sprache (fehlt ein Schlüssel, Deutsch, sonst der Schlüssel). */
export function t(key: MessageKey, params?: Params): string {
  return format(MESSAGES[current][key] ?? de[key] ?? key, params)
}

/** Übersetzung mit zusammengesetztem Schlüssel (z. B. `transition.${id}`). */
export function tk(key: string, params?: Params): string {
  return t(key as MessageKey, params)
}

/**
 * Bezeichnungen einer Auswahlliste als Objekt, das bei jedem Zugriff übersetzt
 * (`labels.fade` → „Überblenden“ bzw. „Fade“). Verhält sich wie `Record<id, string>`.
 */
export function labelMap<K extends string>(prefix: string, ids: readonly K[]): Record<K, string> {
  const keys = new Set<string>(ids)
  return new Proxy({} as Record<K, string>, {
    get: (_, prop) =>
      typeof prop === 'string' && keys.has(prop) ? tk(`${prefix}.${prop}`) : undefined,
    has: (_, prop) => typeof prop === 'string' && keys.has(prop),
    ownKeys: () => [...ids],
    getOwnPropertyDescriptor: (_, prop) =>
      typeof prop === 'string' && keys.has(prop)
        ? { enumerable: true, configurable: true, value: tk(`${prefix}.${prop}`) }
        : undefined
  })
}
