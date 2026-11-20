import { t } from '@shared/i18n'
import type * as ThreeNS from 'three'
import { Container, Sprite, Texture } from 'pixi.js'
import type { FillMode, WorldFormation } from '@shared/settings'
import { placeBackdrop } from '../slide'
import type { Size } from '../motion'
import { freshestAmong } from '../playlist'
import { PAPER_COUNT, paperCanvases } from './paper'
import { TimedScene, type Scene } from '../scene'
import {
  easeInOut,
  formationInfo,
  hash01,
  jellyCenter,
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
      // Durchsichtiger Hintergrund: Beim Ein- und Austauchen liegt darunter der Rand des Fotos.
      alpha: true,
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
    // fein unterteilt, damit sich die Fotos beim Wackelpudding biegen können
    tileGeometry = new THREE.PlaneGeometry(TILE_W, TILE_H, 10, 8)
    // ImageBitmaps werden nicht gespiegelt hochgeladen: v-Koordinate umdrehen.
    const uv = tileGeometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    uv.needsUpdate = true
    frameGeometry = new THREE.PlaneGeometry(TILE_W + 0.12, TILE_H + 0.12, 10, 8)
  }
  return { tile: tileGeometry, frame: frameGeometry! }
}

/**
 * Zeigt aus einem Bild mit Seitenverhältnis `image` den größten mittigen Ausschnitt mit
 * Seitenverhältnis `shown` (über repeat/offset der Textur, ohne Verzerrung).
 */
function cropTexture(tex: ThreeNS.Texture, image: number, shown: number): void {
  const rx = shown < image ? shown / image : 1
  const ry = shown < image ? 1 : image / shown
  tex.repeat.set(rx, ry)
  tex.offset.set((1 - rx) / 2, (1 - ry) / 2)
}

/** Randfüllung eines Fotos unter der 3D-Szene, mit ihrer aktuellen Stärke (0–1). */
interface Edge {
  sprite: Sprite
  texture: Texture
  bitmap: ImageBitmap
  fill: FillMode
  strength: number
  /** Wie weit die Randfüllung schon da ist (zählt ab Ankunft der Bitmap, 0–1). */
  arrived: number
}

export interface WorldTile {
  name: string
  bitmap: ImageBitmap
}

export interface WorldPlan {
  tiles: WorldTile[]
  formations: WorldFormation[]
  duration: number
  cameraSpeed: number
  /** 0 = locker (viel Abstand zwischen den Fotos), 1 = dicht. */
  density: number
  /**
   * Wie viele Fotos her ein Foto zuletzt zu sehen war (nie = Infinity). Gesetzt, wenn
   * Wiederholungen vermieden werden sollen: Unter den gut erreichbaren Kacheln wird dann die
   * genommen, deren Foto am längsten nicht zu sehen war.
   */
  age?: (name: string) => number
  /** Zielkachel vorgeben (beim Wiederholen aus dem Verlauf), sonst wird sie gewählt. */
  finalIndex?: number
  /** Meldet die gewählte Zielkachel (für den Verlauf). */
  onFinal?: (index: number) => void
  /**
   * Foto, das gerade zu sehen ist: Die Welt beginnt mit ihm bildschirmgroß (w × h, wie
   * eingepasst) und nimmt es als Kachel auf. Die scharfe Bitmap gehört danach der Szene.
   */
  intro?: {
    name: string
    bitmap: ImageBitmap
    w: number
    h: number
    /** Randfüllung des Fotos: steht anfangs und blendet beim Zurückfahren aus. */
    backdrop?: { bitmap: ImageBitmap; fill: FillMode }
  }
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
/** Dauer des Einstiegs: Kamera fährt vom aufgenommenen Foto zurück in die Welt. */
const INTRO = 3.4
const FOV = 50

/**
 * Ersetzt three.js 'project_vertex': Punkte werden in Weltkoordinaten vom Mittelpunkt des
 * Würfels weg und zu ihm hin bewegt, mit Wellen, die über die Oberfläche laufen.
 */
const JELLY_VERTEX = /* glsl */ `
  vec4 jellyWorld = modelMatrix * vec4(transformed, 1.0);
  vec3 jellyDir = jellyWorld.xyz - uCenter;
  float jellyLen = length(jellyDir) + 1e-4;
  float jellyWave = sin(jellyWorld.x * 1.1 + uTime * 4.1) * 0.5
                  + sin(jellyWorld.y * 1.3 - uTime * 3.3) * 0.35
                  + sin(jellyWorld.z * 0.9 + uTime * 5.2) * 0.3;
  jellyWorld.xyz += (jellyDir / jellyLen) * uJelly * jellyWave;
  vec4 mvPosition = viewMatrix * jellyWorld;
  gl_Position = projectionMatrix * mvPosition;
`

/**
 * Zwischenspiel „3D-Fotowelt“: Fotos als Kacheln im Raum, die sich nacheinander zu
 * Formationen ordnen; die Kamera fliegt hindurch und taucht am Ende in ein Foto ein.
 * Three.js zeichnet in ein eigenes Canvas, das jeden Frame als Textur in PixiJS landet,
 * damit die Szene durch die normalen Übergänge läuft.
 */
export class WorldScene extends TimedScene implements Scene {
  readonly view = new Container()
  get label(): string {
    return t('show.world')
  }
  readonly photoName = undefined
  private readonly sprite: Sprite
  private readonly texture: Texture
  private readonly scene: ThreeNS.Scene
  private readonly camera: ThreeNS.PerspectiveCamera
  private readonly meshes: ThreeNS.Mesh[] = []
  private readonly tileTextures: ThreeNS.Texture[] = []
  private readonly paperTextures: ThreeNS.Texture[] = []
  /** Seitenverhältnis der Vorschaubilder (= des Fotos). */
  private readonly imageAspects: number[] = []
  private readonly materials: ThreeNS.Material[] = []
  private readonly phases: Phase[] = []
  /** Kachel, in die die Kamera eintaucht; wird erst zu Beginn des Eintauchens gewählt. */
  private finalIndex = -1
  private readonly helper: ThreeNS.Object3D
  private readonly qa: ThreeNS.Quaternion
  private readonly qb: ThreeNS.Quaternion
  private size: Size = { w: 0, h: 0 }
  /** Größe des Zielfotos in Bildschirmpixeln, wie es nach der 3D-Welt dasteht (eingepasst). */
  private finalFrame: { w: number; h: number } | null = null
  /** Weicher Übergang 0 → 1, sobald die Größe bekannt ist (kein Sprung der Kamera). */
  private frameBlend = 0
  /** Eigener Rahmen der Zielkachel, damit er beim Eintauchen ausblenden kann. */
  private finalBorder: ThreeNS.MeshBasicMaterial | null = null
  /** Kachel mit dem aufgenommenen Foto (Einstieg), -1 = ohne Einstieg. */
  private introIndex = -1
  private introBorder: ThreeNS.MeshBasicMaterial | null = null
  private introDone = false
  /** Bitmaps, die die Szene selbst freigibt (scharfe Fassungen). */
  private readonly ownBitmaps: ImageBitmap[] = []
  private readonly normal: ThreeNS.Vector3
  private gone = false
  private readonly bg: ThreeNS.Color
  /** Rand des aufgenommenen Fotos (Einstieg) bzw. des Zielfotos (Eintauchen). */
  private introEdge: Edge | null = null
  private finalEdge: Edge | null = null
  private readonly jelly: {
    uTime: { value: number }
    uJelly: { value: number }
    uCenter: { value: ThreeNS.Vector3 }
  }

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
    // Hintergrund über die Löschfarbe statt scene.background: So kann er beim Ein- und
    // Austauchen durchsichtig werden und den Rand des Fotos darunter zeigen.
    this.bg = bg
    this.scene.fog = new THREE.Fog(bg, 18, 75)
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 200)
    this.helper = new THREE.Object3D()
    this.qa = new THREE.Quaternion()
    this.qb = new THREE.Quaternion()
    this.normal = new THREE.Vector3()

    const { tile, frame } = geometries(THREE)
    this.jelly = {
      uTime: { value: 0 },
      uJelly: { value: 0 },
      uCenter: { value: new THREE.Vector3() }
    }
    const frameMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide })
    this.jellify(frameMaterial)
    this.materials.push(frameMaterial)
    // Rückseiten: leicht verschmutztes, geknicktes Fotopapier in verschiedenen Weißtönen.
    const backMaterials = paperCanvases().map((canvas) => {
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      this.paperTextures.push(tex)
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide })
      this.jellify(mat)
      this.materials.push(mat)
      return mat
    })
    for (const t of plan.tiles) {
      const tex = new THREE.Texture(t.bitmap)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.flipY = false
      tex.needsUpdate = true
      // Vorschaubilder haben das Seitenverhältnis des Fotos; die Kachel zeigt die Mitte in 4:3.
      const imageAspect = t.bitmap.width / Math.max(1, t.bitmap.height)
      this.imageAspects.push(imageAspect)
      cropTexture(tex, imageAspect, TILE_W / TILE_H)
      this.tileTextures.push(tex)
      // transparent, damit die übrigen Kacheln beim Eintauchen ausblenden können
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
        transparent: true
      })
      this.jellify(mat)
      this.materials.push(mat)
      const mesh = new THREE.Mesh(tile, mat)
      // heller Rahmen knapp hinter dem Foto
      const border = new THREE.Mesh(frame, frameMaterial)
      border.position.z = -0.01
      mesh.add(border)
      // Rückseite knapp hinter dem Rahmen, nach hinten gewandt (je Kachel fest, auch beim
      // Wiederholen der Welt gleich).
      const i = this.meshes.length
      const paper = backMaterials[Math.floor(hash01(i, 31) * PAPER_COUNT) % PAPER_COUNT]
      const back = new THREE.Mesh(frame, paper)
      back.rotation.y = Math.PI
      back.position.z = -0.01
      border.add(back)
      this.scene.add(mesh)
      this.meshes.push(mesh)
    }
    this.planPhases()
    this.setupIntro()
  }

  /** Eigener, ausblendbarer Rahmen für eine Kachel (Einstieg bzw. Zielkachel). */
  private ownBorder(index: number): ThreeNS.MeshBasicMaterial {
    const border = this.meshes[index].children[0] as ThreeNS.Mesh
    const mat = (border.material as ThreeNS.MeshBasicMaterial).clone()
    mat.transparent = true
    this.materials.push(mat)
    border.material = mat
    return mat
  }

  /** Bild einer Kachel ersetzen (z. B. durch eine scharfe Fassung desselben Fotos). */
  private replaceTexture(index: number, bitmap: ImageBitmap): void {
    const THREE = this.THREE
    const tex = new THREE.Texture(bitmap)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = false
    tex.needsUpdate = true
    const old = this.tileTextures[index]
    tex.repeat.copy(old.repeat)
    tex.offset.copy(old.offset)
    old.dispose()
    this.tileTextures[index] = tex
    this.imageAspects[index] = bitmap.width / Math.max(1, bitmap.height)
    ;(this.meshes[index].material as ThreeNS.MeshBasicMaterial).map = tex
  }

  /**
   * Einstieg vorbereiten: Das aktuelle Foto ersetzt die Kachel, die nach dem Zurückfahren
   * der Kamera am meisten zugewandt ist; so endet die Fahrt mit dem Foto gut sichtbar.
   */
  private setupIntro(): void {
    const intro = this.plan.intro
    if (!intro || !this.meshes.length) return
    const kind = this.plan.formations[0]
    const t = FIRST_MORPH + 1.5
    const cam = this.cameraPose(kind, t - this.formationStart(kind)).pos
    let best = 0
    let bestScore = -Infinity
    for (let i = 0; i < this.meshes.length; i++) {
      const p = this.place(kind, i, t)
      const n: Vec3 = [p.target[0] - p.pos[0], p.target[1] - p.pos[1], p.target[2] - p.pos[2]]
      const toCam: Vec3 = [cam[0] - p.pos[0], cam[1] - p.pos[1], cam[2] - p.pos[2]]
      const cl = Math.hypot(...toCam) || 1
      const facing =
        (n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2]) / ((Math.hypot(...n) || 1) * cl)
      const score = facing - cl * 0.01
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    this.introIndex = best
    this.plan.tiles[best] = { name: intro.name, bitmap: intro.bitmap }
    this.ownBitmaps.push(intro.bitmap)
    this.replaceTexture(best, intro.bitmap)
    this.introBorder = this.ownBorder(best)
    if (intro.backdrop) {
      this.introEdge = this.makeEdge(intro.backdrop.bitmap, intro.backdrop.fill)
      this.introEdge.strength = 1
    }
    this.shapeIntro(0)
  }

  /**
   * Kachel des Einstiegs formen: anfangs im Seitenverhältnis und ganz (wie das Foto auf dem
   * Bildschirm), dann zur normalen 4:3-Kachel mit Rahmen.
   */
  private shapeIntro(k: number): void {
    const intro = this.plan.intro
    if (!intro) return
    const e = easeInOut(k)
    const tile = TILE_W / TILE_H
    const start = intro.w / Math.max(1, intro.h)
    const a = start + (tile - start) * e
    const wide = a >= tile
    this.meshes[this.introIndex].scale.set(wide ? a / tile : 1, wide ? 1 : tile / a, 1)
    cropTexture(this.tileTextures[this.introIndex], this.imageAspects[this.introIndex], a)
    if (this.introBorder) {
      this.introBorder.opacity = Math.min(1, Math.max(0, (k - 0.45) / 0.45))
      this.meshes[this.introIndex].children[0].visible = this.introBorder.opacity > 0.01
    }
    if (k >= 1) this.introDone = true
  }

  /** Kamera direkt vor der Einstiegskachel, so nah, dass sie so groß ist wie vorher das Foto. */
  private introFront(screen: Size): { pos: Vec3; look: Vec3 } {
    const mesh = this.meshes[this.introIndex]
    const intro = this.plan.intro!
    const p = mesh.position
    this.normal.set(0, 0, 1).applyQuaternion(mesh.quaternion)
    const halfFov = (FOV * Math.PI) / 360
    const height = TILE_H * mesh.scale.y
    const d = (height * screen.h) / (2 * Math.tan(halfFov) * Math.max(1, intro.h))
    return {
      pos: [p.x + this.normal.x * d, p.y + this.normal.y * d, p.z + this.normal.z * d],
      look: [p.x, p.y, p.z]
    }
  }

  /** Randfüllung als Sprite unter der Szene (die Bitmap gehört danach der Szene). */
  private makeEdge(bitmap: ImageBitmap, fill: FillMode): Edge {
    const texture = Texture.from(bitmap)
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    sprite.visible = false
    // unter das Bild der 3D-Szene
    this.view.addChildAt(sprite, 0)
    return { sprite, texture, bitmap, fill, strength: 0, arrived: 0 }
  }

  private edgeStrength(edge: Edge | null): number {
    return edge?.strength ?? 0
  }

  /**
   * Rand des Zielfotos: erscheint in der zweiten Hälfte des Eintauchens, während die
   * übrigen Kacheln verschwinden – am Ende steht das Foto samt Rand wie danach im Vollbild.
   */
  setFinalBackdrop(bitmap: ImageBitmap, fill: FillMode): void {
    if (this.gone || this.finalEdge) {
      bitmap.close()
      return
    }
    this.finalEdge = this.makeEdge(bitmap, fill)
  }

  /** Stärke der Ränder für diesen Zeitpunkt (Einstieg blendet aus, Zielfoto blendet ein). */
  private updateEdges(t: number, dt: number, introK: number): void {
    const smooth = (x: number): number => {
      const c = Math.min(1, Math.max(0, x))
      return c * c * (3 - 2 * c)
    }
    if (this.introEdge) this.introEdge.strength = 1 - smooth(introK / 0.5)
    const edge = this.finalEdge
    if (edge) {
      const dive = this.phases[this.phases.length - 1]
      const k = (t - dive.start) / dive.duration
      edge.arrived = Math.min(1, edge.arrived + dt / 0.8)
      edge.strength = Math.min(smooth((k - 0.45) / 0.55), smooth(edge.arrived))
    }
  }

  /**
   * Scharfe Fassung des Zielfotos: ersetzt die Vorschau der Zielkachel, damit sie am Ende
   * des Eintauchens so scharf ist wie das folgende Vollbild. Die Bitmap gehört der Szene.
   */
  setFinalSharp(bitmap: ImageBitmap): void {
    if (this.gone) {
      bitmap.close()
      return
    }
    this.ownBitmaps.push(bitmap)
    if (this.finalIndex >= 0) this.replaceTexture(this.finalIndex, bitmap)
  }

  /**
   * Wackelpudding: verformt die (fein unterteilten) Kacheln im Vertex-Shader, sodass sich
   * die Fotos selbst wabbelnd mitbiegen. Ohne Wackelpudding ist die Stärke 0.
   */
  private jellify(material: ThreeNS.MeshBasicMaterial): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.jelly)
      shader.vertexShader =
        'uniform float uTime;\nuniform float uJelly;\nuniform vec3 uCenter;\n' +
        shader.vertexShader.replace('#include <project_vertex>', JELLY_VERTEX)
    }
    material.customProgramCacheKey = () => 'photopresenter-jelly-1'
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
    for (const tex of this.paperTextures) r.initTexture(tex)
    await nextFrame()
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
    return kind === 'scatter'
      ? scattered(i)
      : placement(kind, i, this.meshes.length, t, this.plan.density)
  }

  /** Kamera je Formation; u = Sekunden seit Beginn dieser Formation. */
  private cameraPose(kind: WorldFormation, u: number): { pos: Vec3; look: Vec3 } {
    const info = formationInfo(kind, this.meshes.length, this.plan.density)
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
    if (this.finalFrame) this.frameBlend = Math.min(1, this.frameBlend + dt / 1.0)
    // Die 3D-Zeit läuft ab Beginn des Einblendens.
    const t = this.elapsed
    const phase = this.phaseAt(t)
    const n = this.meshes.length
    // Fortschritt des Einstiegs (beginnt nach dem Überblenden; ohne Einstieg gleich 1).
    // (nach dem Überblenden noch einen Augenblick ruhig auf dem Foto, dann zurück)
    const introK =
      this.introIndex >= 0 ? Math.min(1, Math.max(0, (t - this.fadeIn - 0.3) / INTRO)) : 1

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

      // Beim Eintauchen verschwinden alle Kacheln außer dem Zielfoto: Am Ende steht nur
      // noch das Foto da, mit dem die Show weitergeht.
      let opacity = 1
      if (phase.kind === 'dive' && i !== this.finalIndex) {
        const k = (t - phase.start) / phase.duration
        opacity = 1 - Math.min(1, Math.max(0, (k - 0.2) / 0.5))
      }
      // Einstieg: Die übrigen Kacheln erscheinen erst, während die Kamera zurückfährt.
      if (introK < 1 && i !== this.introIndex)
        opacity *= Math.min(1, Math.max(0, (introK - 0.15) / 0.55))
      ;(mesh.material as ThreeNS.MeshBasicMaterial).opacity = opacity
      mesh.children[0].visible = opacity > 0.6
      if (i === this.introIndex && !this.introDone && phase.kind !== 'dive') this.shapeIntro(introK)
      if (phase.kind === 'dive' && i === this.finalIndex) this.shapeFinal(t, phase)
    }

    // Wackelpudding-Stärke: wächst beim Einflug, beruhigt sich beim Eintauchen,
    // damit das Zielfoto am Ende glatt ist.
    let wobble = 0
    if (phase.to === 'jelly') {
      const k = Math.min(1, Math.max(0, (t - phase.start) / phase.duration))
      wobble = phase.kind === 'morph' ? easeInOut(k) : phase.kind === 'dive' ? 1 - easeInOut(k) : 1
    }
    this.jelly.uJelly.value = 0.28 * wobble
    this.jelly.uTime.value = t
    const c = jellyCenter(t)
    this.jelly.uCenter.value.set(c[0], c[1], c[2])

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
      if (this.finalIndex < 0) this.chooseFinal(phase.to, phase.start, from.pos)
      const target = this.diveTarget(t)
      cam = { pos: mix(from.pos, target.pos, k), look: mix(from.look, target.look, k) }
    } else {
      cam = this.cameraPose(phase.to, t - this.formationStart(phase.to))
    }
    // Oben der Kamera: normalerweise senkrecht; beim Einstieg erst wie die Kachel geneigt
    // (sie kann sich beim Einfliegen drehen), damit das Foto anfangs gerade steht.
    this.camera.up.set(0, 1, 0)
    if (introK < 1) {
      // Einstieg: Die Kamera beginnt direkt vor dem aufgenommenen Foto und fährt zurück.
      const front = this.introFront(screen)
      const k = easeInOut(introK)
      cam = { pos: mix(front.pos, cam.pos, k), look: mix(front.look, cam.look, k) }
      const tileUp = this.normal
        .set(0, 1, 0)
        .applyQuaternion(this.meshes[this.introIndex].quaternion)
      this.camera.up.set(tileUp.x * (1 - k), tileUp.y * (1 - k) + k, tileUp.z * (1 - k)).normalize()
    }
    this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2])
    this.camera.lookAt(cam.look[0], cam.look[1], cam.look[2])

    this.updateEdges(t, dt, introK)
    this.render(screen)
  }

  /** Ist das Eintauchen in die Zielkachel schon im Gang? */
  get diving(): boolean {
    return this.finalIndex >= 0
  }

  /** Foto, in das die Kamera eintaucht (erst gültig, wenn `diving` true ist). */
  get finalName(): string {
    return this.plan.tiles[Math.max(0, this.finalIndex)].name
  }

  /**
   * Zielkachel wählen: die der Kamera am meisten zugewandte, nahe Kachel. So fliegt die
   * Kamera nie durch die Formation hindurch (z. B. auf die Rückseite eines Würfels).
   */
  private chooseFinal(kind: WorldFormation, t: number, cam: Vec3): void {
    const scores: number[] = []
    for (let i = 0; i < this.meshes.length; i++) {
      const p = this.place(kind, i, t)
      const n: Vec3 = [p.target[0] - p.pos[0], p.target[1] - p.pos[1], p.target[2] - p.pos[2]]
      const toCam: Vec3 = [cam[0] - p.pos[0], cam[1] - p.pos[1], cam[2] - p.pos[2]]
      const nl = Math.hypot(...n) || 1
      const cl = Math.hypot(...toCam) || 1
      const facing = (n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2]) / (nl * cl)
      // zugewandt zählt am meisten, Nähe ein wenig
      scores.push(facing - cl * 0.01)
    }
    const age = this.plan.age
    // Ohne Verlauf die bestgelegene Kachel; sonst unter den gut gelegenen (≈ bis 35° weiter
    // weggedreht) das Foto, das am längsten nicht zu sehen war.
    const best = age
      ? freshestAmong(
          scores,
          this.plan.tiles.slice(0, scores.length).map((tile) => age(tile.name)),
          0.2
        )
      : freshestAmong(
          scores,
          scores.map(() => 0),
          0
        )
    // Beim Wiederholen aus dem Verlauf dieselbe Kachel wie beim ersten Mal.
    const forced = this.plan.finalIndex
    this.finalIndex = forced !== undefined && forced >= 0 && forced < scores.length ? forced : best
    this.plan.onFinal?.(this.finalIndex)
    // Eigener, ausblendbarer Rahmen für die Zielkachel
    this.finalBorder =
      this.finalIndex === this.introIndex && this.introBorder
        ? this.introBorder
        : this.ownBorder(this.finalIndex)
  }

  /**
   * Wie das Zielfoto nach der 3D-Welt dasteht (Breite und Höhe in Bildschirmpixeln).
   * Das Eintauchen endet dann genau so: gleiche Größe, gleiches Seitenverhältnis.
   */
  setFinalFrame(w: number, h: number): void {
    if (w > 0 && h > 0) this.finalFrame = { w, h }
  }

  /** Die Kamera ist an der endgültigen Position angekommen (Übergang darf beginnen). */
  get frameSettled(): boolean {
    return this.finalFrame !== null && this.frameBlend >= 1
  }

  /** Seitenverhältnis, das die Zielkachel am Ende des Eintauchens hat. */
  private finalAspect(): number {
    const tile = TILE_W / TILE_H
    if (!this.finalFrame) return tile
    return tile + (this.finalFrame.w / this.finalFrame.h - tile) * this.frameEase
  }

  /** Weicher Verlauf der Anpassung an das Zielfoto (ohne Ruck am Anfang und Ende). */
  private get frameEase(): number {
    const k = this.frameBlend
    return k * k * (3 - 2 * k)
  }

  /**
   * Zielkachel beim Eintauchen formen: Seitenverhältnis des Fotos annehmen und dabei
   * vom 4:3-Ausschnitt zum ganzen Foto aufziehen (nicht verzerrt). So zeigt die Kachel am
   * Ende genau das Bild, mit dem die Show weitergeht – ohne Sprung beim Überblenden.
   */
  private shapeFinal(t: number, phase: Phase): void {
    const k = easeInOut((t - phase.start) / phase.duration)
    const mesh = this.meshes[this.finalIndex]
    const tile = TILE_W / TILE_H
    const a = tile + (this.finalAspect() - tile) * k
    const wide = a >= tile
    mesh.scale.set(wide ? a / tile : 1, wide ? 1 : tile / a, 1)
    cropTexture(this.tileTextures[this.finalIndex], this.imageAspects[this.finalIndex], a)
    if (this.finalBorder) {
      this.finalBorder.opacity = 1 - Math.min(1, Math.max(0, (k - 0.15) / 0.45))
      mesh.children[0].visible = this.finalBorder.opacity > 0.01
    }
  }

  /** Kamera vor der Zielkachel, so nah, dass die Kachel das Bild ausfüllt. */
  private diveTarget(t: number): { pos: Vec3; look: Vec3 } {
    const last = this.phases[this.phases.length - 1].to
    const p = this.place(last, this.finalIndex, t)
    const dir: Vec3 = [p.target[0] - p.pos[0], p.target[1] - p.pos[1], p.target[2] - p.pos[2]]
    const len = Math.hypot(...dir) || 1
    const aspect = this.size.w / Math.max(1, this.size.h)
    const halfFov = (FOV * Math.PI) / 360
    // ohne bekannte Fotogröße: so weit weg, dass die Kachel ganz zu sehen ist (wie „einpassen“)
    const fit = Math.max(TILE_H / 2, TILE_W / 2 / aspect) / Math.tan(halfFov)
    let d = fit * 1.02
    if (this.finalFrame) {
      // so weit weg, dass die Kachel genau so hoch erscheint wie danach das Foto
      const tile = TILE_W / TILE_H
      const a = this.finalFrame.w / this.finalFrame.h
      const height = a >= tile ? TILE_H : (TILE_H * tile) / a
      const exact = (height * this.size.h) / (2 * Math.tan(halfFov) * this.finalFrame.h)
      d += (exact - d) * this.frameEase
    }
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
    // Rand des Fotos (Einstieg bzw. Zielfoto) unter der Szene: dort durchsichtig.
    const b = Math.max(this.edgeStrength(this.introEdge), this.edgeStrength(this.finalEdge))
    r.setClearColor(this.bg, 1 - b)
    r.render(this.scene, this.camera)
    this.texture.source.update()
    this.sprite.width = screen.w
    this.sprite.height = screen.h
    for (const edge of [this.introEdge, this.finalEdge]) {
      if (!edge) continue
      edge.sprite.visible = edge.strength > 0.001
      placeBackdrop(edge.sprite, edge.fill, screen, { zoom: 1, x: 0, y: 0 })
    }
  }

  /** Weiterschalten: sofort ins Eintauchen wechseln (statt bis zum Ende zu warten). */
  hurry(fade: number): void {
    const dive = this.phases[this.phases.length - 1]
    if (this.elapsed < dive.start) dive.start = this.elapsed
    this.display = Math.max(0, dive.start + DIVE - this.fadeIn)
    this.fadeOut = fade
  }

  /** Beginnt die Welt mit dem vorher gezeigten Foto (Einstieg)? */
  get hasIntro(): boolean {
    return this.introIndex >= 0
  }

  destroy(): void {
    this.gone = true
    for (const tex of this.tileTextures) tex.dispose()
    for (const tex of this.paperTextures) tex.dispose()
    for (const bmp of this.ownBitmaps) bmp.close()
    for (const edge of [this.introEdge, this.finalEdge]) {
      if (!edge) continue
      edge.texture.destroy(true)
      edge.bitmap.close()
    }
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
