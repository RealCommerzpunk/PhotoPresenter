import { Container, Geometry, Mesh, RenderTexture, Shader, type Renderer } from 'pixi.js'
import { TRANSITIONS, type TransitionId } from '@shared/settings'
import type { Size } from '../motion'
import { fragmentFor, vertex } from './shaders'

const DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2]
]

/** Glättet den Fortschritt, damit Übergänge weich beginnen und enden. */
function smooth(p: number): number {
  const c = Math.min(1, Math.max(0, p))
  return c * c * (3 - 2 * c)
}

/**
 * Mischt zwei Bühneninhalte per Shader. Beide Fotos laufen während des Übergangs
 * weiter (Bewegung), deshalb werden sie in jedem Bild neu in Texturen gerendert.
 */
export class TransitionEngine {
  readonly view: Mesh<Geometry, Shader>
  private readonly geometry: Geometry
  private readonly shaders = new Map<TransitionId, Shader>()
  private readonly black = new Container()
  private rtFrom: RenderTexture | null = null
  private rtTo: RenderTexture | null = null
  private size: Size = { w: 0, h: 0 }
  private active: TransitionId = 'fade'
  private dir: [number, number] = [1, 0]
  private seed = 0

  constructor(
    private readonly renderer: Renderer,
    /** true, wenn Render-Texturen auf dem Kopf stehen (wird beim Start einmal ermittelt). */
    private flipY = false
  ) {
    this.geometry = new Geometry({
      attributes: {
        aPosition: [0, 0, 1, 0, 1, 1, 0, 1],
        aUV: [0, 0, 1, 0, 1, 1, 0, 1]
      },
      indexBuffer: [0, 1, 2, 0, 2, 3]
    })
    this.view = new Mesh({ geometry: this.geometry, shader: this.shaderFor('fade') })
    this.view.visible = false
  }

  private shaderFor(id: TransitionId): Shader {
    let shader = this.shaders.get(id)
    if (!shader) {
      shader = Shader.from({
        gl: { vertex, fragment: fragmentFor(id), name: `transition-${id}` },
        resources: {
          uFrom: RenderTexture.EMPTY.source,
          uTo: RenderTexture.EMPTY.source,
          transitionUniforms: {
            uProgress: { value: 0, type: 'f32' },
            uRatio: { value: 1, type: 'f32' },
            uDir: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
            uSeed: { value: 0, type: 'f32' },
            uFlipY: { value: 0, type: 'f32' }
          }
        }
      })
      this.shaders.set(id, shader)
    }
    return shader
  }

  private ensureTargets(screen: Size): void {
    if (this.rtFrom && this.size.w === screen.w && this.size.h === screen.h) return
    this.rtFrom?.destroy(true)
    this.rtTo?.destroy(true)
    const opts = { width: screen.w, height: screen.h, resolution: this.renderer.resolution }
    this.rtFrom = RenderTexture.create(opts)
    this.rtTo = RenderTexture.create(opts)
    this.size = { ...screen }
  }

  /**
   * Kompiliert alle Effekte einmal vorab (beim Start der Show). Sonst würde jeder Effekt
   * bei seinem ersten Einsatz kurz ruckeln, während die Grafikkarte ihn übersetzt.
   */
  warmUp(): void {
    const target = RenderTexture.create({ width: 4, height: 4 })
    this.view.visible = true
    for (const id of TRANSITIONS) {
      this.view.shader = this.shaderFor(id)
      this.renderer.render({ container: this.view, target, clear: true })
    }
    this.view.visible = false
    target.destroy(true)
  }

  begin(id: TransitionId): void {
    this.active = id
    this.dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]
    this.seed = Math.random()
    this.view.shader = this.shaderFor(id)
    this.view.visible = true
  }

  /** Zeichnet den Übergang; `from` = null blendet aus Schwarz ein. */
  render(from: Container | null, to: Container, progress: number, screen: Size): void {
    this.ensureTargets(screen)
    const black: [number, number, number, number] = [0, 0, 0, 1]
    this.renderer.render({
      container: from ?? this.black,
      target: this.rtFrom!,
      clear: true,
      clearColor: black
    })
    this.renderer.render({ container: to, target: this.rtTo!, clear: true, clearColor: black })

    const shader = this.shaderFor(this.active)
    shader.resources.uFrom = this.rtFrom!.source
    shader.resources.uTo = this.rtTo!.source
    const u = shader.resources.transitionUniforms.uniforms
    u.uProgress = smooth(progress)
    u.uRatio = screen.w / screen.h
    u.uDir[0] = this.dir[0]
    u.uDir[1] = this.dir[1]
    u.uSeed = this.seed
    u.uFlipY = this.flipY ? 1 : 0

    this.view.scale.set(screen.w, screen.h)
  }

  end(): void {
    this.view.visible = false
  }

  destroy(): void {
    this.view.destroy()
    for (const s of this.shaders.values()) s.destroy()
    this.rtFrom?.destroy(true)
    this.rtTo?.destroy(true)
  }
}
