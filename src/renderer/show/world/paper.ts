import { seededRng, type Rng } from '@shared/random'

/** Anzahl verschiedener Rückseiten. */
export const PAPER_COUNT = 12
const W = 256
const H = 192

/** Weißtöne alter Fotopapier-Rückseiten (warm, kühl, vergilbt). */
const TONES: [number, number, number][] = [
  [244, 241, 234],
  [239, 234, 222],
  [247, 245, 240],
  [235, 230, 218],
  [242, 238, 226],
  [236, 235, 231],
  [245, 239, 225],
  [233, 229, 221],
  [240, 238, 233],
  [246, 242, 232],
  [238, 231, 214],
  [241, 241, 238]
]

const rgba = (c: [number, number, number], a: number, k = 1): string =>
  `rgba(${Math.round(c[0] * k)}, ${Math.round(c[1] * k)}, ${Math.round(c[2] * k)}, ${a})`

/** Weicher Fleck (Fingerabdruck, Kaffee, Staub). */
function smudge(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const x = rng() * W
  const y = rng() * H
  const r = 10 + rng() * 45
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  const a = 0.07 + rng() * 0.12
  const brown: [number, number, number] = rng() < 0.5 ? [120, 95, 60] : [90, 90, 90]
  g.addColorStop(0, rgba(brown, a))
  g.addColorStop(0.6, rgba(brown, a * 0.5))
  g.addColorStop(1, rgba(brown, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** Knick quer übers Papier: dunkle Linie, helle Kante daneben und etwas Schatten. */
function crease(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const horizontal = rng() < 0.5
  const p = 0.2 + rng() * 0.6
  const tilt = (rng() - 0.5) * 0.25
  const [x0, y0, x1, y1] = horizontal
    ? [0, H * p, W, H * (p + tilt)]
    : [W * p, 0, W * (p + tilt), H]
  const nx = horizontal ? 0 : 1
  const ny = horizontal ? 1 : 0
  // Schatten auf einer Seite des Knicks
  const g = ctx.createLinearGradient(x0, y0, x0 + nx * 14, y0 + ny * 14)
  g.addColorStop(0, 'rgba(0, 0, 0, 0.13)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x1 + nx * 14, y1 + ny * 14)
  ctx.lineTo(x0 + nx * 14, y0 + ny * 14)
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
  ctx.restore()
  ctx.lineWidth = 1
  ctx.lineWidth = 1.5
  ctx.strokeStyle = `rgba(0, 0, 0, ${0.2 + rng() * 0.12})`
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.beginPath()
  ctx.moveTo(x0 - nx, y0 - ny)
  ctx.lineTo(x1 - nx, y1 - ny)
  ctx.stroke()
}

/** Abgeknickte Ecke: kleines, etwas dunkleres Dreieck mit Kante. */
function dogEar(ctx: CanvasRenderingContext2D, rng: Rng, tone: [number, number, number]): void {
  const s = 14 + rng() * 22
  const corner = Math.floor(rng() * 4)
  const cx = corner % 2 ? W : 0
  const cy = corner < 2 ? 0 : H
  const dx = cx ? -s : s
  const dy = cy ? -s : s
  ctx.beginPath()
  ctx.moveTo(cx + dx, cy)
  ctx.lineTo(cx, cy + dy)
  ctx.lineTo(cx, cy)
  ctx.closePath()
  ctx.fillStyle = rgba(tone, 1, 0.82)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
  ctx.beginPath()
  ctx.moveTo(cx + dx, cy)
  ctx.lineTo(cx, cy + dy)
  ctx.stroke()
}

/** Bleistift-Gekritzel wie eine Notiz auf der Rückseite (unleserlich, nur Andeutung). */
function scribble(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.strokeStyle = `rgba(60, 60, 75, ${0.3 + rng() * 0.2})`
  ctx.lineWidth = 1.2
  const lines = 1 + Math.floor(rng() * 2)
  let y = H * (0.6 + rng() * 0.2)
  for (let l = 0; l < lines; l++) {
    let x = W * (0.12 + rng() * 0.2)
    const end = x + W * (0.25 + rng() * 0.3)
    ctx.beginPath()
    ctx.moveTo(x, y)
    while (x < end) {
      const step = 4 + rng() * 6
      ctx.quadraticCurveTo(x + step / 2, y - 3 - rng() * 5, x + step, y + (rng() - 0.5) * 2)
      x += step
    }
    ctx.stroke()
    y += 12
  }
}

/** Eine Rückseite: Grundton, Vergilbung, Flecken, Knicke, Körnung. */
function drawPaper(index: number): HTMLCanvasElement {
  const rng = seededRng(4711 + index * 97)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const tone = TONES[index % TONES.length]
  ctx.fillStyle = rgba(tone, 1)
  ctx.fillRect(0, 0, W, H)
  // Vergilbung von einer Seite her
  const g = ctx.createLinearGradient(rng() * W, rng() * H, rng() * W, rng() * H)
  g.addColorStop(0, 'rgba(190, 160, 100, 0)')
  g.addColorStop(1, `rgba(185, 150, 85, ${0.14 + rng() * 0.18})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const smudges = 3 + Math.floor(rng() * 4)
  for (let i = 0; i < smudges; i++) smudge(ctx, rng)
  const creases = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < creases; i++) crease(ctx, rng)
  if (rng() < 0.55) dogEar(ctx, rng, tone)
  if (rng() < 0.5) scribble(ctx, rng)
  // Körnung des Papiers
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 18
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  // Rand minimal dunkler (abgegriffen)
  const edge = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62)
  edge.addColorStop(0, 'rgba(0, 0, 0, 0)')
  edge.addColorStop(1, `rgba(60, 50, 30, ${0.14 + rng() * 0.12})`)
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, W, H)
  return canvas
}

let papers: HTMLCanvasElement[] | null = null

/** Die Rückseiten (einmal erzeugt, immer gleich dank festem Startwert). */
export function paperCanvases(): HTMLCanvasElement[] {
  papers ??= Array.from({ length: PAPER_COUNT }, (_, i) => drawPaper(i))
  return papers
}
