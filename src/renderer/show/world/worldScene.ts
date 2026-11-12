import type * as ThreeNS from 'three'
import { Container, Sprite, Texture } from 'pixi.js'
import type { WorldFormation } from '@shared/settings'
import type { Size } from '../motion'
import { TimedScene, type Scene } from '../scene'
import {
  easeInOut,
  formationInfo,
  hash01,
  placement,
  scattered,
  TILE_H,
  TILE_W,
  type Placement,
  type Vec3
} from './formations'

type Three = typeof ThreeNS

let threeModule: Three | null = null
let renderer: ThreeNS.WebGLRenderer | null = null
let tileGeometry: ThreeNS.PlaneGeometry | null = null
let frameGeometry: ThreeNS.PlaneGeometry | null = null

/** Three.js erst beim ersten Zwischenspiel laden (hält den Start der Show schlank). */
export async function loadThree(): Promise<Three> {
  threeModule ??= await import('three')
  return threeModule
}

/** Ein gemeinsamer Renderer mit eigenem, unsichtbarem Canvas für alle Zwischenspiele. */
function sharedRenderer(THREE: Three): ThreeNS.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      // Das Bild wird nach dem Zeichnen als Textur in PixiJS übernommen.
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
  }
  return renderer
}

function geometries(THREE: Three): { tile: ThreeNS.PlaneGeometry; frame: ThreeNS.PlaneGeometry } {
  if (!tileGeometry) {
    tileGeometry = new THREE.PlaneGeometry(TILE_W, TILE_H)
    // ImageBitmaps werden nicht gespiegelt hochgeladen: v-Koordinate umdrehen.
    const uv = tileGeometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    uv.needsUpdate = true
    frameGeometry = new THREE.PlaneGeometry(TILE_W + 0.12, TILE_H + 0.12)
  }
  return { tile: tileGeometry, frame: frameGeometry! }
}

export interface WorldTile {
  name: string
  bitmap: ImageBitmap
}

export interface WorldPlan {
  tiles: WorldTile[]
  /** Index der Kachel, in die die Kamera am Ende eintaucht. */
  finalIndex: number
  formations: WorldFormation[]
  duration: number
  cameraSpeed: number
}

interface Phase {
  kind: 'morph' | 'hold' | 'dive'
  start: number
  duration: number
  from: WorldFormation | 'scatter'
  to: WorldFormation
}

const FIRST_MORPH = 3.2
const MORPH = 2.6
const DIVE = 3.4
const FOV = 50

/**
 * Zwischenspiel „3D-Fotowelt“: Fotos als Kacheln im Raum, die sich nacheinander zu
 * Formationen ordnen; die Kamera fliegt hindurch und taucht am Ende in ein Foto ein.
 * Three.js zeichnet in ein eigenes Canvas, das jeden Frame als Textur in PixiJS landet,
 * damit die Szene durch die normalen Übergänge läuft.
 */
export class WorldScene extends TimedScene implements Scene {
  readonly view = new Container()
  readonly label = '3D-Fotowelt'
  readonly photoName = undefined
  private readonly sprite: Sprite
  private readonly texture: Texture
  private readonly scene: ThreeNS.Scene
  private readonly camera: ThreeNS.PerspectiveCamera
  private readonly meshes: ThreeNS.Mesh[] = []
  private readonly tileTextures: ThreeNS.Texture[] = []
  private readonly materials: ThreeNS.Material[] = []
  private readonly phases: Phase[] = []
  private readonly helper: ThreeNS.Object3D
  private readonly qa: ThreeNS.Quaternion
  private readonly qb: ThreeNS.Quaternion
  private size: Size = { w: 0, h: 0 }

  constructor(
    private readonly THREE: Three,
    private readonly plan: WorldPlan,
    private readonly pixelRatio: number,
    fadeOut: number
  ) {
    super(1)
    this.display = plan.duration
    this.fadeOut = fadeOut

    const r = sharedRenderer(THREE)
    this.texture = Texture.from(r.domElement)
    this.sprite = new Sprite(this.texture)
    this.view.addChild(this.sprite)

    this.scene = new THREE.Scene()
    const bg = new THREE.Color(0x05070d)
    this.scene.background = bg
    this.scene.fog = new THREE.Fog(bg, 18, 75)
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 200)
    this.helper = new THREE.Object3D()
    this.qa = new THREE.Quaternion()
    this.qb = new THREE.Quaternion()

    const { tile, frame } = geometries(THREE)
    const frameMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide })
    this.materials.push(frameMaterial)
    for (const t of plan.tiles) {
      const tex = new THREE.Texture(t.bitmap)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.flipY = false
      tex.needsUpdate = true
      this.tileTextures.push(tex)
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
      this.materials.push(mat)
      const mesh = new THREE.Mesh(tile, mat)
      // heller Rahmen knapp hinter dem Foto
      const border = new THREE.Mesh(frame, frameMaterial)
      border.position.z = -0.01
      mesh.add(border)
      this.scene.add(mesh)
      this.meshes.push(mesh)
    }
    this.planPhases()
  }

  /** Zeitplan: Einflug, je Formation Halten, dazwischen Morphen, am Ende Eintauchen. */
  private planPhases(): void {
    const f = this.plan.formations
    const morphs = FIRST_MORPH + (f.length - 1) * MORPH
    const hold = Math.max(1.5, (this.plan.duration - morphs - DIVE) / f.length)
    let t = 0
    f.forEach((to, k) => {
      const from = k === 0 ? 'scatter' : f[k - 1]
      const m = k === 0 ? FIRST_MORPH : MORPH
      this.phases.push({ kind: 'morph', start: t, duration: m, from, to })
      t += m
      this.phases.push({ kind: 'hold', start: t, duration: hold, from: to, to })
      t += hold
    })
    const last = f[f.length - 1]
    this.phases.push({ kind: 'dive', start: t, duration: DIVE, from: last, to: last })
    // Die Szene steht so lange, wie der Zeitplan dauert.
    this.display = Math.max(this.plan.duration, t + DIVE - this.fadeIn)
  }

  /**
   * Vorab vorbereiten, verteilt auf mehrere Frames, damit kein Frame lange blockiert:
   * erst die Kachel-Texturen einzeln hochladen, dann Shader übersetzen, dann einmal zeichnen.
   */
  async warmUp(screen: Size): Promise<void> {
    const r = sharedRenderer(this.THREE)
    for (const tex of this.tileTextures) {
      r.initTexture(tex)
      await nextFrame()
    }
    r.compile(this.scene, this.camera)
    await nextFrame()
    this.update(0, screen)
    this.elapsed = 0
  }

  private phaseAt(t: number): Phase {
    for (let i = this.phases.length - 1; i >= 0; i--)
      if (t >= this.phases[i].start) return this.phases[i]
    return this.phases[0]
  }

  private place(kind: WorldFormation | 'scatter', i: number, t: number): Placement {
    return kind === 'scatter' ? scattered(i) : placement(kind, i, this.meshes.length, t)
  }

  /** Kamera je Formation; u = Sekunden seit Beginn dieser Formation. */
  private cameraPose(kind: WorldFormation, u: number): { pos: Vec3; look: Vec3 } {
    const info = formationInfo(kind, this.meshes.length)
    const s = this.plan.cameraSpeed
    switch (info.camera) {
      case 'orbit': {
        const a = u * 0.14 * s + hash01(kind.length, 3) * Math.PI * 2
        return {
          pos: [
            Math.sin(a) * info.distance,
            info.height + Math.sin(u * 0.2) * 1.2,
            Math.cos(a) * info.distance
          ],
          look: [0, 0, 0]
        }
      }
      case 'dolly': {
        const z = info.distance - Math.min(info.travel, u * 0.35 * s)
        return {
          pos: [Math.sin(u * 0.15) * 2.5, info.height + Math.sin(u * 0.1), z],
          look: [0, 0, 0]
        }
      }
      case 'flythrough': {
        const z = info.distance - Math.min(info.travel + info.distance * 0.5, u * 1.8 * s)
        const pos: Vec3 = [Math.sin(u * 0.3) * 0.7, Math.cos(u * 0.25) * 0.5, z]
        return { pos, look: [pos[0] * 0.5, pos[1] * 0.5, z - 10] }
      }
      case 'sweep': {
        const x = -info.travel / 2 + Math.min(info.travel, u * 0.9 * s)
        return { pos: [x, info.height, 9], look: [x * 0.6, -2, -5] }
      }
    }
  }

  private formationStart(kind: WorldFormation): number {
    return this.phases.find((p) => p.kind === 'morph' && p.to === kind)?.start ?? 0
  }

  update(dt: number, screen: Size): void {
    this.elapsed += dt
    // Die 3D-Zeit läuft ab Beginn des Einblendens.
    const t = this.elapsed
    const phase = this.phaseAt(t)
    const n = this.meshes.length

    // Kacheln
    for (let i = 0; i < n; i++) {
      const mesh = this.meshes[i]
      let p: Placement
      let q: ThreeNS.Quaternion
      if (phase.kind === 'morph') {
        // Jede Kachel startet etwas versetzt und braucht unterschiedlich lange (wie im Vorbild).
        const delay = hash01(i, 21) * phase.duration * 0.35
        const len = phase.duration * (0.55 + hash01(i, 22) * 0.1)
        const k = easeInOut((t - phase.start - delay) / len)
        const a = this.place(phase.from, i, t)
        const b = this.place(phase.to, i, t)
        p = {
          pos: [
            a.pos[0] + (b.pos[0] - a.pos[0]) * k,
            a.pos[1] + (b.pos[1] - a.pos[1]) * k,
            a.pos[2] + (b.pos[2] - a.pos[2]) * k
          ],
          target: b.target
        }
        this.qa.copy(this.orientation(a))
        this.qb.copy(this.orientation(b))
        q = this.qa.slerp(this.qb, k)
      } else {
        p = this.place(phase.to, i, t)
        q = this.orientation(p)
      }
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2])
      mesh.quaternion.copy(q)
    }

    // Kamera
    let cam: { pos: Vec3; look: Vec3 }
    if (phase.kind === 'morph' && phase.from !== 'scatter') {
      // weicher Übergang von der alten zur neuen Kamerafahrt
      const k = easeInOut((t - phase.start) / phase.duration)
      const a = this.cameraPose(phase.from, t - this.formationStart(phase.from))
      const b = this.cameraPose(phase.to, t - phase.start)
      cam = { pos: mix(a.pos, b.pos, k), look: mix(a.look, b.look, k) }
    } else if (phase.kind === 'dive') {
      const k = easeInOut((t - phase.start) / phase.duration)
      const from = this.cameraPose(phase.to, phase.start - this.formationStart(phase.to))
      const target = this.diveTarget(t)
      cam = { pos: mix(from.pos, target.pos, k), look: mix(from.look, target.look, k) }
    } else {
      cam = this.cameraPose(phase.to, t - this.formationStart(phase.to))
    }
    this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2])
    this.camera.lookAt(cam.look[0], cam.look[1], cam.look[2])

    this.render(screen)
  }

  /** Kamera vor der Zielkachel, so nah, dass die Kachel das Bild ausfüllt. */
  private diveTarget(t: number): { pos: Vec3; look: Vec3 } {
    const last = this.phases[this.phases.length - 1].to
    const p = this.place(last, this.plan.finalIndex, t)
    const dir: Vec3 = [p.target[0] - p.pos[0], p.target[1] - p.pos[1], p.target[2] - p.pos[2]]
    const len = Math.hypot(...dir) || 1
    const aspect = this.size.w / Math.max(1, this.size.h)
    const halfFov = (FOV * Math.PI) / 360
    // so weit weg, dass die Kachel ganz zu sehen ist (wie „einpassen“)
    const fit = Math.max(TILE_H / 2, TILE_W / 2 / aspect) / Math.tan(halfFov)
    const d = fit * 1.02
    return {
      pos: [
        p.pos[0] + (dir[0] / len) * d,
        p.pos[1] + (dir[1] / len) * d,
        p.pos[2] + (dir[2] / len) * d
      ],
      look: p.pos
    }
  }

  private orientation(p: Placement): ThreeNS.Quaternion {
    this.helper.position.set(p.pos[0], p.pos[1], p.pos[2])
    this.helper.lookAt(p.target[0], p.target[1], p.target[2])
    return this.helper.quaternion.clone()
  }

  private render(screen: Size): void {
    const r = sharedRenderer(this.THREE)
    if (screen.w !== this.size.w || screen.h !== this.size.h) {
      this.size = { ...screen }
      r.setPixelRatio(this.pixelRatio)
      r.setSize(screen.w, screen.h, false)
      this.camera.aspect = screen.w / screen.h
      this.camera.updateProjectionMatrix()
    }
    r.render(this.scene, this.camera)
    this.texture.source.update()
    this.sprite.width = screen.w
    this.sprite.height = screen.h
  }

  hurry(fade: number): void {
    this.shorten(fade)
  }

  destroy(): void {
    for (const tex of this.tileTextures) tex.dispose()
    for (const mat of this.materials) mat.dispose()
    this.scene.clear()
    this.view.destroy({ children: true })
    // Die Pixi-Textur verweist auf das gemeinsame Canvas: nur die Textur freigeben.
    this.texture.destroy(false)
  }
}

function mix(a: Vec3, b: Vec3, k: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
