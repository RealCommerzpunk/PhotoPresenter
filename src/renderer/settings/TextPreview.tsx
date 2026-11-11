import { useEffect, useRef, useState } from 'react'
import type { TextStyle } from '@shared/text'
import { loadFont } from '../text/fonts'
import { TextOverlay } from '../text/overlay'

/**
 * Spielt einen Text mit seinem Stil in einer kleinen 16:9-Fläche ab, in Schleife.
 * Klick spielt sofort neu ab. Optional mit Foto im Hintergrund (scharf oder weichgezeichnet).
 */
export function TextPreview({
  text,
  style,
  background,
  blurBackground = true,
  position
}: {
  text: string
  style: TextStyle
  background?: string
  blurBackground?: boolean
  position?: TextStyle['position']
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [run, setRun] = useState(0)
  // Als Schlüssel, damit jede Stiländerung die Vorschau neu startet.
  const styleKey = JSON.stringify(style)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const st = JSON.parse(styleKey) as TextStyle
    let overlay: TextOverlay | null = null
    let timer = 0
    let cancelled = false
    void loadFont(st).then(() => {
      if (cancelled) return
      overlay = new TextOverlay(el, text.trim() || 'Beispieltext', st, position)
      overlay.playIn()
      const out = overlay
      timer = window.setTimeout(
        () => {
          out.playOut()
          timer = window.setTimeout(() => setRun((r) => r + 1), out.outDuration * 1000 + 800)
        },
        (out.inDuration + 1.8) * 1000
      )
    })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      overlay?.destroy()
    }
  }, [text, styleKey, run, position])

  return (
    <div
      onClick={() => setRun((r) => r + 1)}
      title="Klicken zum erneuten Abspielen"
      className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-[#1b1830] to-[#0c0b14]"
    >
      {background && (
        <img
          src={background}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={
            blurBackground
              ? { filter: 'blur(14px) brightness(0.6)', transform: 'scale(1.15)' }
              : undefined
          }
        />
      )}
      <div ref={host} className="absolute inset-0" style={{ containerType: 'size' }} />
    </div>
  )
}
