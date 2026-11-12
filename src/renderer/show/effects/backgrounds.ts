import { Geometry, Mesh, Shader } from 'pixi.js'
import type { TextBackgroundId } from '@shared/settings'
import type { Size } from '../motion'

/**
 * Animierte Hintergründe für Textfolien als Shader (Polarlicht, Nebel, Wellen, Lichter,
 * Sterne). Sie laufen durch dieselbe Übergangs-Engine wie die Fotos und bekommen ihre
 * Farben aus dem zugehörigen Foto.
 */

const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`

const header = /* glsl */ `
in vec2 vUV;
uniform float uTime;
uniform float uRatio;
uniform vec3 uColorA;
uniform vec3 uColorB;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
`

const bodies: Record<Exclude<TextBackgroundId, 'photo'>, string> = {
  aurora: /* glsl */ `
void main() {
  vec2 uv = vUV;
  // dunkler Nachthimmel, zum Horizont etwas heller
  vec3 col = mix(vec3(0.01, 0.015, 0.04), uColorB * 0.18, smoothstep(0.2, 1.0, uv.y));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * uRatio;
    // Unterkante des Vorhangs, sanft wogend
    float edge = 0.38 + fi * 0.08 + 0.1 * sin(x * (0.9 + fi * 0.3) + uTime * (0.12 + fi * 0.04) + fi * 2.1)
               + 0.06 * fbm(vec2(x * 1.2 + fi, uTime * 0.08));
    // senkrechte Lichtstreifen
    float rays = pow(fbm(vec2(x * (7.0 + fi * 3.0) + fi * 10.0, uTime * 0.18)), 2.0) * 2.2;
    // hell an der Unterkante, nach oben ausfadend
    float below = smoothstep(edge + 0.02, edge - 0.01, uv.y);
    float fade = exp(-(edge - uv.y) * (3.5 + fi));
    float curtain = below * fade * (0.35 + rays);
    vec3 c = mix(uColorA, uColorB, fi * 0.5);
    col += c * curtain * (1.1 - fi * 0.25);
  }
  gl_FragColor = vec4(col, 1.0);
}`,

  nebula: /* glsl */ `
void main() {
  vec2 p = vec2(vUV.x * uRatio, vUV.y) * 2.2;
  float t = uTime * 0.04;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 2.5 * q + t);
  vec3 col = mix(vec3(0.02, 0.02, 0.05), uColorA * 0.7, smoothstep(0.2, 0.8, f));
  col = mix(col, uColorB * 0.9, smoothstep(0.55, 1.0, q.x * f * 1.6));
  col *= 0.75 + 0.35 * f;
  gl_FragColor = vec4(col, 1.0);
}`,

  waves: /* glsl */ `
void main() {
  vec2 uv = vUV;
  vec3 col = mix(vec3(0.02, 0.03, 0.07), uColorA * 0.35, smoothstep(0.0, 1.0, uv.y));
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x = uv.x * uRatio;
    float y = 0.42 + fi * 0.085
            + 0.045 * sin(x * (1.6 + fi * 0.5) + uTime * (0.35 + fi * 0.07) + fi * 1.3)
            + 0.02 * sin(x * (4.0 + fi) - uTime * 0.5);
    float d = uv.y - y;
    vec3 c = mix(uColorA, uColorB, fi / 5.0);
    // Wasserkörper unter der Welle, Kamm als leuchtende Linie
    col = mix(col, c * (0.35 + 0.08 * fi), smoothstep(0.0, 0.03, d) * 0.55);
    col += c * exp(-abs(d) * 160.0) * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
}`,

  bokeh: /* glsl */ `
void main() {
  vec2 uv = vec2(vUV.x * uRatio, vUV.y);
  vec3 col = mix(vec3(0.03, 0.03, 0.06), uColorA * 0.22, vUV.y);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    vec2 seed = vec2(fi * 1.37, fi * 2.11);
    vec2 c = vec2(hash(seed) * uRatio, hash(seed + 3.1));
    c += 0.07 * vec2(sin(uTime * 0.13 + fi), cos(uTime * 0.11 + fi * 1.7));
    float r = 0.04 + 0.11 * hash(seed + 7.7);
    float d = length(uv - c);
    // Scheibe mit hellerem Rand wie bei einer unscharfen Linse
    float disc = smoothstep(r, r * 0.88, d) * (0.55 + 0.45 * smoothstep(r * 0.5, r * 0.95, d));
    float pulse = 0.65 + 0.35 * sin(uTime * (0.3 + hash(seed) * 0.5) + fi);
    col += mix(uColorA, uColorB, hash(seed + 1.9)) * disc * 0.55 * pulse;
  }
  gl_FragColor = vec4(col, 1.0);
}`,

  stars: /* glsl */ `
void main() {
  vec2 uv = vec2(vUV.x * uRatio, vUV.y);
  vec3 col = mix(vec3(0.005, 0.01, 0.03), uColorA * 0.2, smoothstep(0.0, 1.0, vUV.y));
  // Milchstraßen-Schleier
  col += uColorB * 0.35 * fbm(uv * 1.8 + uTime * 0.01) * smoothstep(0.35, 0.85, fbm(uv * 0.9 + 3.0));
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float s = 22.0 + fl * 18.0;
    vec2 g = uv * s + vec2(uTime * 0.05 * (fl + 1.0), 0.0);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash(id + fl * 13.0);
    if (h > 0.82) {
      vec2 off = vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5;
      float d = length(f - off * 0.7);
      float tw = 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
      float size = 0.04 + 0.06 * hash(id + 5.5);
      float core = smoothstep(size, 0.0, d);
      float glow = exp(-d * 18.0) * 0.35;
      col += mix(vec3(1.0), uColorB, 0.25) * (core + glow) * tw * (1.0 - fl * 0.25);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`
}

/** Bildschirmfüllender Hintergrund, der sich mit der Zeit bewegt. */
export class AnimatedBackground {
  readonly view: Mesh<Geometry, Shader>
  private time = Math.random() * 100

  constructor(
    kind: Exclude<TextBackgroundId, 'photo'>,
    colorA: [number, number, number],
    colorB: [number, number, number]
  ) {
    const geometry = new Geometry({
      attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1], aUV: [0, 0, 1, 0, 1, 1, 0, 1] },
      indexBuffer: [0, 1, 2, 0, 2, 3]
    })
    const shader = Shader.from({
      gl: { vertex, fragment: header + bodies[kind], name: `background-${kind}` },
      resources: {
        bgUniforms: {
          uTime: { value: 0, type: 'f32' },
          uRatio: { value: 16 / 9, type: 'f32' },
          uColorA: { value: new Float32Array(colorA), type: 'vec3<f32>' },
          uColorB: { value: new Float32Array(colorB), type: 'vec3<f32>' }
        }
      }
    })
    this.view = new Mesh({ geometry, shader })
  }

  update(dt: number, screen: Size): void {
    this.time += dt
    const u = this.view.shader!.resources.bgUniforms.uniforms
    u.uTime = this.time
    u.uRatio = screen.w / screen.h
    this.view.scale.set(screen.w, screen.h)
  }

  destroy(): void {
    this.view.shader?.destroy()
    this.view.destroy({ children: true })
  }
}

/**
 * Zwei harmonische, kräftige Farben aus einem (weichgezeichneten) Foto: mittlere Farbe der
 * oberen und unteren Hälfte, Sättigung und Helligkeit angehoben.
 */
export function colorsFrom(
  bitmap: ImageBitmap | null
): [[number, number, number], [number, number, number]] {
  if (!bitmap)
    return [
      [0.38, 0.35, 0.95],
      [0.1, 0.8, 0.75]
    ]
  const canvas = new OffscreenCanvas(8, 8)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, 8, 8)
  const data = ctx.getImageData(0, 0, 8, 8).data
  const avg = (y0: number, y1: number): [number, number, number] => {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        n++
      }
    return vivid([r / n / 255, g / n / 255, b / n / 255])
  }
  return [avg(0, 4), avg(4, 8)]
}

/** Farbe kräftiger machen: Sättigung ≥ 0,55, Helligkeit auf 0,55. */
function vivid([r, g, b]: [number, number, number]): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const d = max - min
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
    if (h < 0) h += 1
  }
  const s = Math.max(0.55, d / (1 - Math.abs(max + min - 1) || 1))
  const l = 0.55
  const c = (1 - Math.abs(2 * l - 1)) * Math.min(1, s)
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(h * 6) % 6
  const rgb: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ]
  const [rr, gg, bb] = rgb[sector]
  return [rr + m, gg + m, bb + m]
}
