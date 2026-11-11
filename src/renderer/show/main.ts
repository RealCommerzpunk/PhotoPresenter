// Ohne eval auskommen, damit die strenge Content-Security-Policy greift.
import 'pixi.js/unsafe-eval'
import { Application, FillGradient, Graphics, Text } from 'pixi.js'

/**
 * Platzhalter-Bühne für Meilenstein 1: prüft, dass Vollbild, WebGL-Rendering
 * und Tastatursteuerung funktionieren. Die eigentliche Diashow folgt in Meilenstein 2.
 */
async function main(): Promise<void> {
  const host = document.getElementById('stage')!
  const app = new Application()
  await app.init({ resizeTo: window, background: '#000000', antialias: true })
  host.appendChild(app.canvas)

  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    colorStops: [
      { offset: 0, color: '#1e1b4b' },
      { offset: 0.5, color: '#4c1d95' },
      { offset: 1, color: '#0f172a' }
    ]
  })
  const bg = new Graphics()
  app.stage.addChild(bg)

  const title = new Text({
    text: 'PhotoPresenter',
    style: { fill: '#ffffff', fontSize: 96, fontWeight: '300', letterSpacing: 8 }
  })
  title.anchor.set(0.5)
  const hint = new Text({
    text: 'Esc beendet die Show',
    style: { fill: '#ffffffaa', fontSize: 24 }
  })
  hint.anchor.set(0.5)
  app.stage.addChild(title, hint)

  let t = 0
  app.ticker.add((ticker) => {
    t += ticker.deltaMS / 1000
    const w = app.screen.width
    const h = app.screen.height
    // Langsamer Ken-Burns-artiger Zoom als Bewegungstest.
    const zoom = 1.1 + 0.1 * Math.sin(t * 0.2)
    bg.clear()
      .rect(-w * 0.1, -h * 0.1, w * 1.2, h * 1.2)
      .fill(gradient)
    bg.pivot.set(w / 2, h / 2)
    bg.position.set(w / 2 + Math.sin(t * 0.13) * 30, h / 2 + Math.cos(t * 0.11) * 20)
    bg.scale.set(zoom)
    title.position.set(w / 2, h / 2)
    title.alpha = 0.75 + 0.25 * Math.sin(t * 0.8)
    hint.position.set(w / 2, h / 2 + 100)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') void window.api.stopShow()
  })
}

void main()
