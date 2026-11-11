import type { TransitionId } from '@shared/settings'

/**
 * Übergangseffekte als GLSL. Jeder Effekt definiert `vec4 transition(vec2 uv)` und nutzt
 * `fromColor(uv)` / `toColor(uv)`. Die Idee folgt gl-transitions (MIT), die Effekte sind
 * eigene Umsetzungen.
 *
 * Uniforms: uProgress 0..1 (bereits geglättet), uRatio = Breite/Höhe,
 * uDir = Richtung (Einheitsvektor), uSeed = Zufallswert 0..1 je Übergang.
 */

export const vertex = /* glsl */ `
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
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
uniform float uRatio;
uniform vec2 uDir;
uniform float uSeed;
uniform float uFlipY;

vec2 texUV(vec2 uv) { return vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipY)); }
vec4 fromColor(vec2 uv) { return texture2D(uFrom, texUV(clamp(uv, 0.0, 1.0))); }
vec4 toColor(vec2 uv) { return texture2D(uTo, texUV(clamp(uv, 0.0, 1.0))); }
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233)) + uSeed * 43.0) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rand(i), rand(i + vec2(1.0, 0.0)), u.x),
             mix(rand(i + vec2(0.0, 1.0)), rand(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** Position entlang uDir, 0 am Anfang, 1 am Ende des Bildes. */
float along(vec2 uv) {
  vec2 d = uDir;
  return dot(uv - 0.5, d) / (abs(d.x) * 0.5 + abs(d.y) * 0.5) * 0.5 + 0.5;
}
const float PI = 3.14159265;
`

const footer = /* glsl */ `
void main() { gl_FragColor = transition(vUV); }
`

const bodies: Record<TransitionId, string> = {
  fade: `
vec4 transition(vec2 uv) { return mix(fromColor(uv), toColor(uv), uProgress); }`,

  fadeBlack: `
vec4 transition(vec2 uv) {
  float p = uProgress;
  vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
  return p < 0.5 ? mix(fromColor(uv), black, smoothstep(0.0, 0.5, p))
                 : mix(black, toColor(uv), smoothstep(0.5, 1.0, p));
}`,

  wipe: `
vec4 transition(vec2 uv) {
  float s = 0.18;
  float m = smoothstep(0.0, s, uProgress * (1.0 + s) - along(uv));
  return mix(fromColor(uv), toColor(uv), m);
}`,

  push: `
vec4 transition(vec2 uv) {
  float p = uProgress;
  vec2 d = uDir;
  vec2 fromUV = uv + d * p;
  vec2 toUV = uv + d * (p - 1.0);
  bool inTo = all(greaterThanEqual(toUV, vec2(0.0))) && all(lessThanEqual(toUV, vec2(1.0)));
  vec4 c = inTo ? toColor(toUV) : fromColor(fromUV);
  // leichte Abdunklung an der Nahtstelle
  return c * (1.0 - 0.25 * sin(PI * p) * (inTo ? 0.0 : 1.0));
}`,

  circle: `
vec4 transition(vec2 uv) {
  vec2 c = vec2(0.5) + (vec2(uSeed, fract(uSeed * 7.31)) - 0.5) * 0.3;
  vec2 q = (uv - c) * vec2(uRatio, 1.0);
  float r = uProgress * (length(vec2(uRatio, 1.0)) + 0.2);
  float m = smoothstep(r, r - 0.12, length(q));
  return mix(fromColor(uv), toColor(uv), m);
}`,

  zoomBlur: `
vec4 transition(vec2 uv) {
  float p = uProgress;
  float strength = sin(PI * p) * 0.25;
  vec2 c = vec2(0.5);
  vec4 a = vec4(0.0);
  vec4 b = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float t = float(i) / 11.0;
    float k = 1.0 - strength * t;
    a += fromColor(c + (uv - c) * (k - p * 0.15));
    b += toColor(c + (uv - c) * (k + (1.0 - p) * 0.15));
  }
  return mix(a / 12.0, b / 12.0, smoothstep(0.3, 0.7, p));
}`,

  dissolve: `
vec4 transition(vec2 uv) {
  float n = noise(uv * vec2(uRatio, 1.0) * 9.0) * 0.6 + noise(uv * vec2(uRatio, 1.0) * 40.0) * 0.4;
  float m = smoothstep(n - 0.12, n + 0.12, uProgress * 1.3 - 0.15);
  return mix(fromColor(uv), toColor(uv), m);
}`,

  clock: `
vec4 transition(vec2 uv) {
  vec2 q = (uv - 0.5) * vec2(uRatio, 1.0);
  float a = atan(q.x, -q.y) / (2.0 * PI) + 0.5;
  if (uDir.x < 0.0) a = 1.0 - a;
  float m = smoothstep(a - 0.04, a, uProgress * 1.04);
  return mix(fromColor(uv), toColor(uv), m);
}`,

  pixelize: `
vec4 transition(vec2 uv) {
  float p = uProgress;
  float size = mix(1.0, 64.0, pow(sin(PI * p), 2.0));
  vec2 cells = vec2(uRatio, 1.0) * 720.0 / size;
  vec2 q = size > 1.5 ? (floor(uv * cells) + 0.5) / cells : uv;
  return mix(fromColor(q), toColor(q), smoothstep(0.35, 0.65, p));
}`,

  ripple: `
vec4 transition(vec2 uv) {
  float p = uProgress;
  vec2 q = (uv - 0.5) * vec2(uRatio, 1.0);
  float d = length(q);
  float wave = sin(d * 40.0 - p * 18.0) * 0.012 * sin(PI * p);
  vec2 off = d > 0.0 ? normalize(q) * wave / vec2(uRatio, 1.0) : vec2(0.0);
  return mix(fromColor(uv + off), toColor(uv + off), smoothstep(0.25, 0.75, p));
}`,

  glow: `
vec4 transition(vec2 uv) {
  float p = uProgress;
  vec4 a = fromColor(uv);
  vec4 b = toColor(uv);
  float lum = dot(b.rgb, vec3(0.299, 0.587, 0.114));
  // helle Bereiche des neuen Fotos erscheinen zuerst, mit kurzem Aufleuchten
  float m = smoothstep(1.0 - lum - 0.25, 1.0 - lum + 0.05, p * 1.3 - 0.05);
  vec4 c = mix(a, b, m);
  return c + vec4(vec3(0.35 * sin(PI * p) * (1.0 - abs(m - 0.5) * 2.0)), 0.0);
}`,

  blinds: `
vec4 transition(vec2 uv) {
  float count = 9.0;
  float x = fract(along(uv) * count);
  float m = smoothstep(0.0, 0.08, uProgress * 1.08 - x);
  return mix(fromColor(uv), toColor(uv), m);
}`,

  swirl: `
vec4 transition(vec2 uv) {
  float p = uProgress;
  vec2 q = (uv - 0.5) * vec2(uRatio, 1.0);
  float d = length(q);
  float angle = sin(PI * p) * 3.0 * max(0.0, 1.0 - d / 0.9) * (uDir.x < 0.0 ? -1.0 : 1.0);
  float s = sin(angle);
  float c = cos(angle);
  vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c) / vec2(uRatio, 1.0) + 0.5;
  return mix(fromColor(r), toColor(r), smoothstep(0.3, 0.7, p));
}`
}

export function fragmentFor(id: TransitionId): string {
  return header + bodies[id] + footer
}
