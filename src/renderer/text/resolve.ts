import { pickWeighted, type Rng } from '@shared/random'
import type { Settings } from '@shared/settings'
import { allStyles, PRESET_STYLES, RANDOM_STYLE, type TextItem, type TextStyle } from '@shared/text'

/** Stil eines Textes; bei „Zufall“ aus den aktiven Stilen gewichtet gewählt. */
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
  return byId(pickWeighted(known, rng)) ?? PRESET_STYLES[0]
}
