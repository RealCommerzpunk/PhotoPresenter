// Gebündelte Schriften (Fontsource, Lizenz OFL). Die App braucht kein Internet.
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/400-italic.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/cinzel/400.css'
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/dancing-script/400.css'
import '@fontsource/dancing-script/600.css'
import '@fontsource/dancing-script/700.css'
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/700.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/montserrat/200.css'
import '@fontsource/montserrat/300.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/pacifico/400.css'
import { FONTS, type TextStyle } from '@shared/text'

export function fontFamily(style: TextStyle): string {
  return `"${FONTS[style.font].family}", system-ui, sans-serif`
}

/** Lädt die Schrift eines Stils, bevor der Text gezeigt wird (sonst springt die Darstellung). */
export async function loadFont(style: TextStyle): Promise<void> {
  const spec = `${style.italic ? 'italic ' : ''}${style.weight} 32px "${FONTS[style.font].family}"`
  try {
    await document.fonts.load(spec)
  } catch {
    // Ohne Schrift weiter: Der Browser nimmt eine Ersatzschrift.
  }
}
