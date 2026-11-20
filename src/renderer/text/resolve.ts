import { pick, pickWeighted, type Rng } from '@shared/random'
import type { Settings } from '@shared/settings'
import { allStyles, PRESET_STYLES, RANDOM_STYLE, type TextItem, type TextStyle } from '@shared/text'

/**
 * Stil eines Textes; bei „Zufall“ aus den aktiven Stilen gewichtet gewählt und die
 * Schriftgröße zusätzlich zufällig skaliert (Einstellung `textSizeRandom`).
 */
export function resolveStyle(
  item: TextItem,
  settings: Settings,
  rng: Rng = Math.random
): TextStyle {
  const styles = allStyles(settings.customStyles)
  const byId = (id: string | undefined): TextStyle | undefined => styles.find((s) => s.id === id)
  if (item.style !== RANDOM_STYLE) {
    const fixed = byId(item.style)
    if (fixed) return fixed
  }
  const known = settings.textStyles.filter((o) => byId(o.id))
  const style = byId(pickWeighted(known, rng)) ?? PRESET_STYLES[0]
  let factor = pick(settings.textSizeRandom, rng)
  if (!(factor > 0) || factor === 1) return style
  // Lange Texte wachsen weniger, damit sie auf den Bildschirm passen.
  if (factor > 1) factor = 1 + (factor - 1) * Math.min(1, 40 / Math.max(1, item.text.length))
  // Grenzen wie im Stil-Schema (1–30 cqh).
  return { ...style, size: Math.min(30, Math.max(1, style.size * factor)) }
}
