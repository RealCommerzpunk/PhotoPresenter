// Ohne eval auskommen, damit die strenge Content-Security-Policy greift.
import 'pixi.js/unsafe-eval'
import { Application, Container, RenderTexture, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import { pick, pickWeighted } from '@shared/random'
import type { Settings, WorldFormation } from '@shared/settings'
import type { TextStyle } from '@shared/text'
import { loadFont } from '../text/fonts'
import { resolveStyle } from '../text/resolve'
import { loadPhoto, loadSoft, loadThumb, type LoadedPhoto } from './loader'
import { faceZoom, fitImage, zoomLimit, type FaceBox, type Size } from './motion'
import { Playlist } from './playlist'
import type { Scene } from './scene'
import { Sequencer, type Entry } from './sequencer'
import { Slide, type FocusTarget, type OverlayText } from './slide'
import { TextSlide } from './textSlide'
import { TransitionEngine } from './transitions/engine'
import { EffectLayer } from './effects/particles'
import { frame, mark, measure } from './perf'
import { ThumbPool } from './world/thumbPool'
import { loadThree, WorldScene } from './world/worldScene'

const FIRST_FADE = 1.2
const SKIP_FADE = 0.6
const SOFT_CACHE_SIZE = 6

const messageEl = document.getElementById('message')!
const infoEl = document.getElementById('info')!
const statusEl = document.getElementById('status')!
const textHost = document.getElementById('texts')!
const qrEl = document.getElementById('qr')!

/** Vorbereiteter nächster Eintrag: alles geladen, kann sofort gezeigt werden. */
type Prepared =
  | { kind: 'photo'; photo: LoadedPhoto; texts: OverlayText[]; focus?: FocusTarget }
  | {
      kind: 'text'
      entry: Extract<Entry, { kind: 'text' }>
      style: TextStyle
      background: ImageBitmap | null
    }
  | { kind: 'world'; scene: WorldScene }

function dispose(p: Prepared): void {
  if (p.kind === 'photo') p.photo.destroy()
  else if (p.kind === 'world') p.scene.destroy()
  else p.background?.close()
}

/** Mindestens so viele Vorschaubilder, bevor ein 3D-Zwischenspiel starten darf. */
const WORLD_MIN_TILES = 16

function showMessage(text: string | null): void {
  messageEl.textContent = text ?? ''
  messageEl.style.opacity = text ? '1' : '0'
}

let statusTimer: number | undefined
function flashStatus(text: string): void {
  statusEl.textContent = text
  statusEl.style.opacity = '1'
  window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => (statusEl.style.opacity = '0'), 1200)
}

async function main(): Promise<void> {
  const app = new Application()
  await app.init({
    resizeTo: window,
    background: '#000000',
    antialias: false,
    resolution: window.devicePixelRatio,
    autoDensity: true
  })
  document.getElementById('stage')!.appendChild(app.canvas)

  let settings: Settings = await window.api.getSettings()
  const playlist = new Playlist([])
  const sequencer = new Sequencer(playlist, settings.textFillerEvery)
  sequencer.setTexts(settings.texts, settings.textFillerEvery)

  /** Hält die aktuelle Folie, solange kein Übergang läuft. */
  const slideLayer = new Container()
  const transitions = new TransitionEngine(app.renderer)
  // Partikel-Effekte liegen über Fotos und Übergängen und laufen über Fotowechsel hinweg.
  const effectLayer = new Container()
  app.stage.addChild(slideLayer, transitions.view, effectLayer)
  const effects = new EffectLayer(effectLayer)
  let sinceEffect = 0
  let effectAt = Math.max(1, Math.round(pick(settings.effectEvery)))

  /** Einen zufälligen Effekt aus den aktiven starten (auch per Fernbedienung). */
  function startEffect(): void {
    const kind = pickWeighted(settings.effects)
    if (!kind) return
    effects.start(kind, pick(settings.effectIntensity), pick(settings.effectDuration))
  }

  /** Nach „alle X–Y Fotos“ einen Effekt starten. */
  function maybeStartEffect(): void {
    if (!settings.effectsEnabled) return
    if (++sinceEffect < effectAt) return
    sinceEffect = 0
    effectAt = Math.max(1, Math.round(pick(settings.effectEvery)))
    startEffect()
  }
  transitions.warmUp()
  mark(`Bühne ${app.screen.width}×${app.screen.height} @ ${app.renderer.resolution}`)

  let current: Scene | null = null
  let incoming: Scene | null = null
  let ready: Prepared | null = null
  let loading = false
  /** Erhöht sich bei jedem Sprung; ältere Ladevorgänge werden verworfen. */
  let generation = 0
  let paused = false
  let showInfo = false
  let showFps = false
  let failures = 0
  /** Zuletzt gezeigtes Foto, Bezugspunkt für das Zurückblättern. */
  let lastPhoto: string | undefined

  const screen = (): Size => ({ w: app.screen.width, h: app.screen.height })

  // Weichgezeichnete Kleinfassungen der letzten Fotos als Hintergrund für Textfolien.
  const softCache = new Map<string, ImageBitmap>()
  function remember(name: string, bitmap: ImageBitmap): void {
    softCache.get(name)?.close()
    softCache.delete(name)
    softCache.set(name, bitmap)
    while (softCache.size > SOFT_CACHE_SIZE) {
      const [oldest, bmp] = softCache.entries().next().value!
      bmp.close()
      softCache.delete(oldest)
    }
  }
  async function softFor(name: string | undefined): Promise<ImageBitmap | null> {
    if (!name) return null
    try {
      if (!softCache.has(name)) remember(name, await loadSoft(name, screen()))
      return await createImageBitmap(softCache.get(name)!)
    } catch {
      return null
    }
  }

  /** Fokusplan für ein Foto, wenn die Fokus-Person darauf erkannt wurde. */
  async function focusFor(name: string): Promise<{ target: FocusTarget; zoom: number } | null> {
    if (!settings.focusEnabled || !settings.focusPersonId) return null
    const info = await window.api.getFaces(name).catch(() => null)
    const focusFace = info?.faces.find((f) => f.focus)
    if (!info || !focusFace) return null
    const partnerFace = info.faces.find((f) => f.partner)
    const others: FaceBox[] = info.faces
      .filter((f) => f !== focusFace && f !== partnerFace)
      .map((f) => f.box)
    const choice = settings.focusPanOthers
    const pan =
      choice === 'random'
        ? (['off', 'before', 'after'] as const)[Math.floor(Math.random() * 3)]
        : choice
    const plan = {
      mode: pickWeighted(settings.focusModes) ?? 'slowZoom',
      faceSize: pick(settings.focusFaceSize),
      others: pan
    }
    const img = { w: info.w, h: info.h }
    const { scale } = fitImage(img, screen(), settings.maxCrop)
    return {
      target: { face: focusFace.box, others, plan, partner: partnerFace?.box },
      // Nur so viel Auflösung laden, wie die Zoomgrenze überhaupt erlaubt.
      zoom: Math.min(
        Math.max(
          faceZoom(focusFace.box, img, screen(), scale, plan.faceSize),
          partnerFace ? faceZoom(partnerFace.box, img, screen(), scale, plan.faceSize) : 1
        ),
        zoomLimit(scale, app.renderer.resolution, settings.maxUpscale)
      )
    }
  }

  // Winziges Ziel, um Texturen einmal zu zeichnen und so wirklich hochzuladen.
  const uploadTarget = RenderTexture.create({ width: 2, height: 2 })
  function uploadNow(texture: Texture): void {
    const sprite = new Sprite(texture)
    sprite.width = 2
    sprite.height = 2
    app.renderer.render({ container: sprite, target: uploadTarget })
    sprite.destroy()
  }
  const uploadQueue: { texture: Texture; done: () => void }[] = []
  /** Lädt Texturen nacheinander hoch, eine pro Frame (siehe Ticker). */
  function uploadGradually(textures: Texture[]): Promise<void> {
    return Promise.all(
      textures.map((texture) => new Promise<void>((done) => uploadQueue.push({ texture, done })))
    ).then(() => undefined)
  }

  async function prepare(entry: Entry): Promise<Prepared> {
    const prepStart = performance.now()
    try {
      return await prepareInner(entry)
    } finally {
      mark(`Vorbereitung ${Math.round(performance.now() - prepStart)}ms`)
    }
  }

  async function prepareInner(entry: Entry): Promise<Prepared> {
    if (entry.kind === 'photo') {
      const fill = pickWeighted(settings.fillModes) ?? 'blur'
      const focus = await focusFor(entry.name)
      const photo = await loadPhoto(
        entry.name,
        screen(),
        app.renderer.resolution,
        settings.maxCrop,
        fill,
        focus?.zoom ?? 1
      )
      // Vorab auf die Grafikkarte laden, ein Streifen pro Frame: So blockiert kein Frame
      // lange, und im Übergang ist alles schon da.
      await uploadGradually([photo.backdrop, ...photo.parts.map((p) => p.texture)])
      remember(entry.name, photo.soft)
      const texts = entry.overlays.map((item) => ({ item, style: resolveStyle(item, settings) }))
      await Promise.all(texts.map((t) => loadFont(t.style)))
      return { kind: 'photo', photo, texts, focus: focus?.target }
    }
    if (entry.kind === 'world') return prepareWorld()
    const style = resolveStyle(entry.item, settings)
    const [background] = await Promise.all([softFor(entry.ref), loadFont(style)])
    return { kind: 'text', entry, style, background }
  }

  /** Zwischenspiel 3D-Fotowelt vorbereiten: Kacheln, Formationen, Zielfoto; vorab einmal zeichnen. */
  async function prepareWorld(): Promise<Prepared> {
    const THREE = await loadThree()
    let count = Math.max(WORLD_MIN_TILES, Math.round(pick(settings.worldTiles)))
    // Je Zwischenspiel genau eine Formation (per Fernbedienung auch eine bestimmte).
    const formation: WorldFormation =
      worldFormationWanted ?? pickWeighted(settings.worldFormations) ?? 'sphere'
    worldFormationWanted = null
    const formations: WorldFormation[] = [formation]
    // Der Wackelpudding-Würfel ist nur geschlossen mit 6 × g² Kacheln (z. B. 54 = 6 × 3 × 3).
    if (formation === 'jelly') {
      const g = Math.max(2, Math.round(Math.sqrt(count / 6)))
      count = 6 * g * g
    }
    const sampled = thumbs.sample(count)
    // Zu wenige Vorschaubilder: Fotos wiederholen, damit die Form vollständig ist.
    const tiles = Array.from({ length: count }, (_, i) => sampled[i % sampled.length])
    const scene = new WorldScene(
      THREE,
      {
        tiles,
        formations,
        duration: pick(settings.worldDuration),
        cameraSpeed: pick(settings.worldCameraSpeed)
      },
      app.renderer.resolution,
      1.6
    )
    await scene.warmUp(screen())
    return { kind: 'world', scene }
  }

  // ---------- 3D-Fotowelt: Zeitplan ----------
  const thumbs = new ThumbPool(loadThumb)
  let photosSinceWorld = 0
  let worldAt = Math.max(1, Math.round(pick(settings.worldEvery)))
  let worldForced = false
  let worldFormationWanted: WorldFormation | null = null
  /** Zielfoto der laufenden 3D-Welt ist schon eingereiht. */
  let worldFinalQueued = false

  function worldDue(): boolean {
    if (thumbs.size < WORLD_MIN_TILES) return false
    if (worldForced) return true
    return settings.worldEnabled && photosSinceWorld >= worldAt
  }

  /** Nächster Eintrag: 3D-Zwischenspiel, wenn fällig, sonst aus dem Ablauf. */
  function nextEntry(): Entry | undefined {
    // Während der 3D-Welt erst vorladen, wenn das Zielfoto feststeht (Beginn des Eintauchens);
    // mit genau diesem Foto geht die Show dann weiter.
    if (current instanceof WorldScene) {
      if (!current.diving) return undefined
      if (!worldFinalQueued) {
        worldFinalQueued = true
        sequencer.insertNext(current.finalName)
      }
      return sequencer.next()
    }
    if (worldDue()) {
      worldForced = false
      photosSinceWorld = 0
      worldAt = Math.max(1, Math.round(pick(settings.worldEvery)))
      return { kind: 'world' }
    }
    return sequencer.next()
  }

  /** Fotos mit der Fokus-Person häufiger zeigen. */
  async function refreshFocusPhotos(): Promise<void> {
    const names =
      settings.focusEnabled && settings.focusBoost > 0 ? await window.api.focusPhotos() : []
    playlist.setBoost(names, settings.focusBoost)
  }

  async function reloadPhotos(): Promise<void> {
    const list = await window.api.listPhotos()
    playlist.setItems(list.files)
    thumbs.setItems(list.files)
    void refreshFocusPhotos()
    const hasFillers = settings.texts.some((t) => t.enabled && t.kind === 'filler')
    if (list.error) showMessage(`Fotoordner nicht lesbar:\n${list.error}`)
    else if (!list.folder && !hasFillers)
      showMessage('Kein Fotoordner gewählt.\nBitte in den Einstellungen festlegen.')
    else if (list.files.length === 0 && !hasFillers)
      showMessage(`Keine Fotos gefunden in\n${list.folder}`)
    else if (!current) showMessage(null)
  }

  /** Bereitet den nächsten Eintrag vor (Standard: der nächste aus dem Ablauf). */
  function prefetch(next: () => Entry | undefined = nextEntry): void {
    if (loading || ready) return
    const entry = next()
    if (!entry) return
    loading = true
    const gen = generation
    mark('Vorladen startet')
    prepare(entry)
      .then((p) => {
        mark('Vorladen fertig')
        if (gen !== generation) dispose(p)
        else {
          ready = p
          failures = 0
        }
      })
      .catch((err) => {
        console.warn('Eintrag übersprungen:', err)
        failures++
      })
      .finally(() => {
        if (gen !== generation) return
        loading = false
        // Bei Fehlern den nächsten versuchen, aber nicht endlos, wenn alle defekt sind.
        if (!ready && failures < Math.max(5, playlist.size)) prefetch()
      })
  }

  function createScene(p: Prepared, fade: number): Scene {
    if (p.kind === 'world') {
      worldFinalQueued = false
      p.scene.fadeIn = fade
      return p.scene
    }
    if (p.kind === 'photo') {
      lastPhoto = p.photo.name
      photosSinceWorld++
      return new Slide(p.photo, screen(), settings, fade, p.texts, textHost, p.focus)
    }
    const backgroundKind = pickWeighted(settings.textBackgrounds) ?? 'photo'
    return new TextSlide(
      p.entry.item,
      p.style,
      p.background,
      settings,
      fade,
      textHost,
      backgroundKind
    )
  }

  /** Beginnt den Übergang zum vorbereiteten Eintrag (beim ersten aus Schwarz). */
  function startTransition(fade: number): void {
    if (!ready) return
    mark('Übergang startet')
    incoming = createScene(ready, fade)
    maybeStartEffect()
    ready = null
    slideLayer.removeChildren()
    // Nach dem Eintauchen in ein Foto der 3D-Welt weich überblenden: Es ist dasselbe Foto.
    const plain = !current || current instanceof WorldScene
    transitions.begin(plain ? 'fade' : (pickWeighted(settings.transitions) ?? 'fade'))
    // Den ersten Übergangs-Frame sofort zeichnen. Sonst zeigt die Übergangsfläche in diesem
    // Frame noch ihren alten Inhalt vom vorigen Übergang: ein sichtbares Zucken/Blitzen.
    const s = screen()
    incoming.update(0, s)
    transitions.render(current?.view ?? null, incoming.view, 0, s)
    updateInfo()
    // Das nächste Foto erst nach dem Übergang vorbereiten: Während des Übergangs ist die
    // Grafikkarte am stärksten ausgelastet, jede zusätzliche Arbeit lässt ihn ruckeln.
  }

  function updateInfo(): void {
    const scene = incoming ?? current
    infoEl.textContent = scene?.label ?? ''
    infoEl.style.opacity = showInfo && scene ? '1' : '0'
    reportStatus()
  }

  /** Zustand an den Main-Prozess melden (für die Fernbedienung). */
  function reportStatus(): void {
    const scene = incoming ?? current
    window.api.reportShowStatus({ running: true, paused, label: scene?.label ?? '' })
  }

  function setPaused(value: boolean): void {
    paused = value
    // Textanimationen laufen über GSAP und werden mit angehalten.
    if (paused) gsap.globalTimeline.pause()
    else gsap.globalTimeline.resume()
    flashStatus(paused ? 'Pause' : 'Weiter')
    reportStatus()
  }

  // QR-Code der Fernbedienung (Taste q): 30 Sekunden fest eingeblendet.
  let qrTimer: number | undefined
  async function toggleQr(): Promise<void> {
    if (qrEl.style.opacity === '1') {
      window.clearTimeout(qrTimer)
      qrEl.style.opacity = '0'
      return
    }
    const info = await window.api.remoteInfo()
    const svg = qrEl.querySelector('.qr-code')!
    const text = qrEl.querySelector('.qr-text')!
    if (info.qrSvg && info.urls[0]) {
      svg.innerHTML = info.qrSvg
      text.textContent = info.urls[0].replace(/\/$/, '')
    } else {
      svg.innerHTML = ''
      text.textContent = info.enabled
        ? 'Fernbedienung nicht erreichbar: kein Netzwerk (z. B. Handy-Hotspot verbinden)'
        : 'Fernbedienung ist in den Einstellungen ausgeschaltet'
    }
    qrEl.style.opacity = '1'
    window.clearTimeout(qrTimer)
    qrTimer = window.setTimeout(() => (qrEl.style.opacity = '0'), 30_000)
  }

  window.api.onShowCommand((cmd) => {
    if (cmd === 'next') skip(1)
    else if (cmd === 'prev') skip(-1)
    else if (cmd === 'pause') setPaused(true)
    else if (cmd === 'resume') setPaused(false)
    else if (cmd === 'qr') void toggleQr()
    else if (cmd === 'effect') startEffect()
    else if (cmd === 'world') startWorldNow()
  })

  /** Zwischenspiel sofort (per Fernbedienung oder Einstellungsfenster). */
  function startWorldNow(): void {
    if (thumbs.size < WORLD_MIN_TILES) {
      flashStatus(`3D-Fotowelt lädt noch Vorschaubilder (${thumbs.size}/${WORLD_MIN_TILES})`)
      return
    }
    if (incoming || current instanceof WorldScene) return
    worldForced = true
    discardReady()
    prefetch()
    current?.hurry(SKIP_FADE)
  }

  function discardReady(): void {
    generation++
    if (ready) dispose(ready)
    ready = null
    loading = false
  }

  /** Springt vor (+1) oder zurück (-1), mit kurzer Überblendung. */
  function skip(direction: 1 | -1): void {
    if (incoming || !current) return
    if (direction === -1) {
      const entry = lastPhoto ? sequencer.back(lastPhoto) : undefined
      if (!entry) {
        flashStatus('Anfang erreicht')
        return
      }
      discardReady()
      prefetch(() => entry)
    }
    current.hurry(SKIP_FADE)
  }

  app.ticker.add((ticker) => {
    frame(ticker.deltaMS)
    const upload = uploadQueue.shift()
    if (upload) {
      measure('Streifen hochladen', () => uploadNow(upload.texture))
      upload.done()
    }
    if (paused) return
    const dt = Math.min(0.1, ticker.deltaMS / 1000)
    const s = screen()
    effects.update(dt, s)
    // In der 3D-Welt wird erst beim Eintauchen vorgeladen (siehe nextEntry).
    if (current instanceof WorldScene && !incoming && !ready && !loading) prefetch()
    // Vorschaubilder für die 3D-Welt nur in ruhigen Phasen nachladen.
    if (!incoming && (settings.worldEnabled || worldForced)) {
      thumbs.tick(Math.round(Math.max(settings.worldTiles.min, settings.worldTiles.max)))
    }

    if (!current && !incoming && ready) {
      showMessage(null)
      startTransition(FIRST_FADE)
    }

    current?.update(dt, s)
    if (incoming) {
      incoming.update(dt, s)
      transitions.render(current?.view ?? null, incoming.view, incoming.fadeProgress, s)
      if (incoming.fadedIn) {
        current?.destroy()
        current = incoming
        incoming = null
        transitions.end()
        mark('Übergang Ende')
        prefetch()
        slideLayer.addChild(current.view)
      }
    } else if (current?.readyForNext && ready) {
      startTransition(current.fadeOut)
    }

    if (showFps) statusEl.textContent = `${Math.round(ticker.FPS)} fps`
  })

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'Escape':
        void window.api.stopShow()
        break
      case ' ':
        setPaused(!paused)
        break
      case 'q':
      case 'Q':
        void toggleQr()
        break
      case 'ArrowRight':
        skip(1)
        break
      case 'ArrowLeft':
        skip(-1)
        break
      case 'i':
      case 'I':
        showInfo = !showInfo
        updateInfo()
        break
      case 'd':
      case 'D':
        showFps = !showFps
        window.clearTimeout(statusTimer)
        statusEl.style.opacity = showFps ? '1' : '0'
        break
    }
  })

  window.api.onSettingsChanged((next) => {
    const folderChanged =
      next.photoFolder !== settings.photoFolder ||
      next.includeSubfolders !== settings.includeSubfolders
    settings = next
    sequencer.setTexts(settings.texts, settings.textFillerEvery)
    void refreshFocusPhotos()
    if (folderChanged) {
      discardReady()
      void reloadPhotos().then(() => prefetch())
    }
  })

  // Während die Analyse noch läuft, kommen neue Treffer hinzu.
  window.setInterval(() => void refreshFocusPhotos(), 60_000)

  await reloadPhotos()
  prefetch()
}

void main()
