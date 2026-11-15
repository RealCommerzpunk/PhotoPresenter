// Ohne eval auskommen, damit die strenge Content-Security-Policy greift.
import { MESSAGES, resolveLanguage, setLanguage, t } from '@shared/i18n'
import 'pixi.js/unsafe-eval'
import { Application, Container, RenderTexture, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import { pick, pickWeighted } from '@shared/random'
import { photoUrl, type PhotoDetails, type SongInfo } from '@shared/ipc'
import type { FaceInfo } from '@shared/faces'
import type { PhotoQueue, QueueItem, ShowNotice } from '@shared/remote'
import {
  EFFECT_LABELS,
  EFFECTS,
  WORLD_FORMATION_LABELS,
  WORLD_FORMATIONS,
  type EffectId,
  type Settings,
  type WorldFormation
} from '@shared/settings'
import { RANDOM_STYLE, type TextItem } from '@shared/text'
import { TextOverlay } from '../text/overlay'
import { OverlayTrack } from './scene'
import type { TextStyle } from '@shared/text'
import { loadFont } from '../text/fonts'
import { SongPlayer } from './song'
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
import { EmojiLayer } from './emojis'
import { infoHtml } from './info'
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
const emojiHost = document.getElementById('emojis')!
const lyricsEl = document.getElementById('lyrics')!
const songPickEl = document.getElementById('songPick')!
const songBgEl = document.getElementById('songBg')!

/** Rückmeldung an die Fernbedienung (erscheint dort als kurzer Hinweis). */
/** Sprache der Show aus den Einstellungen (bzw. der Systemsprache); feste Texte der Seite übersetzen. */
function applyLanguage(s: Settings): void {
  const lang = resolveLanguage(s.language, navigator.language)
  setLanguage(lang)
  document.documentElement.lang = lang
  const qrTitle = document.querySelector('.qr-title')
  if (qrTitle) qrTitle.textContent = t('show.remote')
  if (messageEl.textContent === MESSAGES.de['show.loading'])
    messageEl.textContent = t('show.loading')
}

function notice(text: string, kind: ShowNotice['kind'] = 'ok'): void {
  window.api.notice({ text, kind })
}

/** Vorbereiteter nächster Eintrag: alles geladen, kann sofort gezeigt werden. */
type Prepared =
  | {
      kind: 'photo'
      photo: LoadedPhoto
      texts: OverlayText[]
      focus?: FocusTarget
      /** Alle Gesichter (null = Foto noch nicht analysiert). */
      faces: FaceBox[] | null
      /** Eintrag der manuellen Reihenfolge (Galerie der Fernbedienung). */
      queueId?: string
    }
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
  applyLanguage(settings)
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
  const emojis = new EmojiLayer(emojiHost)
  let sinceEffect = 0
  let effectAt = Math.max(1, Math.round(pick(settings.effectEvery)))

  /** Einen zufälligen Effekt aus den aktiven starten (auch per Fernbedienung). */
  function startEffect(wanted?: string, manual = false): EffectId | undefined {
    const kind = EFFECTS.includes(wanted as EffectId)
      ? (wanted as EffectId)
      : pickWeighted(settings.effects)
    if (!kind) return undefined
    // Per Hand ausgelöste Effekte laufen nur bis zum nächsten Übergang (dann länger erlaubt).
    const duration = manual ? 60 : pick(settings.effectDuration)
    effects.start(kind, pick(settings.effectIntensity), duration, manual)
    return kind
  }

  /** Nach „alle X–Y Fotos“ einen Effekt starten. */
  function maybeStartEffect(): void {
    if (!settings.effectsEnabled || song.active) return // während eines Liedes keine Effekte
    if (++sinceEffect < effectAt) return
    sinceEffect = 0
    effectAt = Math.max(1, Math.round(pick(settings.effectEvery)))
    startEffect()
  }
  transitions.warmUp()
  effects.warmUp(app.renderer)
  emojis.warmUp(settings.emojis)
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

  /** Grenze der Grundvergrößerung in Bildschirm- je Originalpixel (Infinity = unbegrenzt). */
  function baseCap(): number {
    return settings.maxBaseScale > 0 ? settings.maxBaseScale / app.renderer.resolution : Infinity
  }

  /** Fokusplan für ein Foto, wenn die Fokus-Person darauf erkannt wurde. */
  function focusFor(info: FaceInfo | null): { target: FocusTarget; zoom: number } | null {
    if (!settings.focusEnabled || !settings.focusPersonId) return null
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
    const { scale } = fitImage(img, screen(), settings.maxCrop, baseCap())
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
      // Gesichter: für den Fokus und damit Texte und Emojis ihnen ausweichen
      const faceInfo = await window.api.getFaces(entry.name).catch(() => null)
      const focus = focusFor(faceInfo)
      const photo = await loadPhoto(
        entry.name,
        screen(),
        app.renderer.resolution,
        settings.maxCrop,
        fill,
        focus?.zoom ?? 1,
        settings.maxBaseScale
      )
      // Vorab auf die Grafikkarte laden, ein Streifen pro Frame: So blockiert kein Frame
      // lange, und im Übergang ist alles schon da.
      await uploadGradually([photo.backdrop, ...photo.parts.map((p) => p.texture)])
      remember(entry.name, photo.soft)
      const texts = entry.overlays.map((item) => ({ item, style: resolveStyle(item, settings) }))
      await Promise.all(texts.map((t) => loadFont(t.style)))
      return {
        kind: 'photo',
        photo,
        texts,
        focus: focus?.target,
        faces: faceInfo ? faceInfo.faces.map((f) => f.box) : null,
        queueId: entry.queueId
      }
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
    if (thumbs.size < WORLD_MIN_TILES || song.active) return false
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
    // Manuelle Reihenfolge aus der Galerie der Fernbedienung hat Vorrang.
    const queued = queueNext()
    if (queued) {
      usedQueueIds.add(queued.id)
      return { kind: 'photo', name: queued.name, overlays: [], queueId: queued.id }
    }
    if (worldDue()) {
      worldForced = false
      photosSinceWorld = 0
      worldAt = Math.max(1, Math.round(pick(settings.worldEvery)))
      return { kind: 'world' }
    }
    return sequencer.next()
  }

  // ---------- Manuelle Reihenfolge (Galerie der Fernbedienung) ----------
  let photoQueue: PhotoQueue = await window.api.getQueue()
  /** Einträge, die die Show schon vorbereitet oder gezeigt hat. */
  const usedQueueIds = new Set<string>()
  /** Eintrag, der gerade vorbereitet wird (für das Verwerfen bei Änderungen der Liste). */
  let loadingEntry: Entry | null = null

  function queueNext(): QueueItem | undefined {
    return photoQueue.items.find((i) => i.id !== photoQueue.playing && !usedQueueIds.has(i.id))
  }

  /** queueId des vorbereiteten bzw. gerade ladenden Eintrags. */
  function pendingQueueId(): string | undefined {
    if (ready) return ready.kind === 'photo' ? ready.queueId : undefined
    return loadingEntry?.kind === 'photo' ? loadingEntry.queueId : undefined
  }

  window.api.onQueueChanged((q) => {
    photoQueue = q
    const known = new Set(q.items.map((i) => i.id))
    const pending = pendingQueueId()
    // Gelöschte Einträge dürfen nicht mehr als „schon benutzt“ gelten (Speicher sauber halten).
    for (const id of usedQueueIds) if (!known.has(id) && id !== pending) usedQueueIds.delete(id)
    // Während der 3D-Welt steht das nächste Foto fest (Zielfoto); danach greift die Liste.
    if (current instanceof WorldScene || incoming) return
    const head = q.items.find(
      (i) => i.id !== q.playing && (i.id === pending || !usedQueueIds.has(i.id))
    )
    if (pending ? head?.id === pending : !head) return
    // Das vorbereitete Foto passt nicht mehr zur Liste: verwerfen und neu vorbereiten.
    const dropped = ready?.kind === 'photo' ? ready : null
    if (pending) usedQueueIds.delete(pending)
    else if (dropped && !dropped.queueId) sequencer.insertNext(dropped.photo.name)
    else if (loadingEntry?.kind === 'photo' && !loadingEntry.queueId)
      sequencer.insertNext(loadingEntry.name)
    discardReady()
    prefetch()
  })

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
    if (list.error) showMessage(t('show.folderError', { error: list.error }))
    else if (!list.folder && !hasFillers) showMessage(t('show.noFolder'))
    else if (list.files.length === 0 && !hasFillers)
      showMessage(t('show.noPhotos', { folder: list.folder }))
    else if (!current) showMessage(null)
  }

  /** Bereitet den nächsten Eintrag vor (Standard: der nächste aus dem Ablauf). */
  function prefetch(next: () => Entry | undefined = nextEntry): void {
    if (loading || ready) return
    const entry = next()
    if (!entry) return
    loading = true
    loadingEntry = entry
    const gen = generation
    mark('Vorladen startet')
    prepare(entry)
      .then((p) => {
        mark('Vorladen fertig')
        if (gen !== generation) dispose(p)
        else {
          ready = p
          // Zielfoto der 3D-Welt: Das Eintauchen endet genau in seiner Größe.
          if (current instanceof WorldScene && p.kind === 'photo') {
            const { size, fit } = p.photo
            current.setFinalFrame(size.w * fit.scale, size.h * fit.scale)
          }
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
        loadingEntry = null
        // Bei Fehlern den nächsten versuchen, aber nicht endlos, wenn alle defekt sind.
        if (!ready && failures < Math.max(5, playlist.size)) prefetch()
      })
  }

  function createScene(p: Prepared, fade: number): Scene {
    // Main-Prozess: welcher Eintrag der manuellen Reihenfolge jetzt zu sehen ist.
    window.api.queuePlaying(p.kind === 'photo' ? (p.queueId ?? null) : null)
    if (p.kind === 'world') {
      worldFinalQueued = false
      p.scene.fadeIn = fade
      return p.scene
    }
    if (p.kind === 'photo') {
      lastPhoto = p.photo.name
      photosSinceWorld++
      // Nach der 3D-Welt erst kurz im Vollbild stehen, dann die Bewegung beginnen.
      const stillStart = current instanceof WorldScene ? 2 : 0
      return new Slide(p.photo, screen(), settings, fade, p.texts, textHost, p.focus, {
        stillStart,
        faces: p.faces
      })
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
    // Per Hand ausgelöste Texte und Effekte gehören zum bisherigen Bild.
    if (current) endManualExtras()
    incoming = createScene(ready, fade)
    reportStatus()
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

  // Info-Tafel (Taste I): Datei- und EXIF-Angaben je Foto einmal holen.
  let infoFor: string | undefined
  let infoDetails: PhotoDetails | null | undefined
  let infoFaces: number | undefined
  function updateInfo(): void {
    reportStatus()
    const scene = incoming ?? current
    infoEl.style.opacity = showInfo && scene ? '1' : '0'
    if (!showInfo || !scene) return
    const slide = scene instanceof Slide ? scene : null
    const name = slide?.photoName
    if (name && name !== infoFor) {
      infoFor = name
      infoDetails = undefined
      infoFaces = undefined
      void window.api.photoInfo(name).then((d) => {
        if (infoFor === name) infoDetails = d
      })
      void window.api.getFaces(name).then((f) => {
        if (infoFor === name) infoFaces = f?.faces.length
      })
    }
    infoEl.innerHTML = infoHtml({
      label: scene.label,
      screen: screen(),
      resolution: app.renderer.resolution,
      photo: slide
        ? {
            loaded: slide.loaded,
            stats: slide.stats(),
            focus: !!slide.focus,
            partner: !!slide.focus?.partner
          }
        : undefined,
      details: slide ? infoDetails : undefined,
      faces: slide ? infoFaces : undefined
    })
  }
  // Zoom und Fortschritt ändern sich laufend.
  window.setInterval(() => showInfo && updateInfo(), 250)

  // ---------- Kinder-Fernbedienung: höchstens ein Emoji und ein Text je Foto ----------
  let kidEmojiUsed = false
  let kidTextUsed = false

  // Lieder (Taste S): Karaoke, Funktionen weiter unten
  const song = new SongPlayer(lyricsEl)
  let picking: SongInfo[] | null = null
  let pickAt = 0

  /** Zustand an den Main-Prozess melden (für die Fernbedienung). */
  function reportStatus(): void {
    const scene = incoming ?? current
    window.api.reportShowStatus({
      running: true,
      paused,
      label: scene?.label ?? '',
      frozen: current instanceof Slide && current.frozen,
      photo: scene?.photoName,
      kidEmojiUsed,
      kidTextUsed,
      song: song.active
        ? { title: song.title }
        : picking
          ? { title: '', choosing: true }
          : undefined
    })
  }

  function setPaused(value: boolean): void {
    paused = value
    // Textanimationen laufen über GSAP und werden mit angehalten.
    if (paused) gsap.globalTimeline.pause()
    else gsap.globalTimeline.resume()
    if (paused) song.pause()
    else song.resume()
    flashStatus(paused ? t('show.pause') : t('show.resume'))
    reportStatus()
  }

  // QR-Code der Fernbedienung (Taste Q) bzw. der Kinder-Fernbedienung (Taste q):
  // 30 Sekunden fest eingeblendet; dieselbe Taste blendet aus, die andere wechselt.
  let qrTimer: number | undefined
  let qrKids = false
  async function toggleQr(kids = false): Promise<void> {
    if (qrEl.style.opacity === '1' && qrKids === kids) {
      window.clearTimeout(qrTimer)
      qrEl.style.opacity = '0'
      return
    }
    qrKids = kids
    const info = await window.api.remoteInfo(kids)
    const title = qrEl.querySelector('.qr-title')
    if (title) title.textContent = kids ? t('show.remoteKids') : t('show.remote')
    const svg = qrEl.querySelector('.qr-code')!
    const text = qrEl.querySelector('.qr-text')!
    if (info.qrSvg && info.urls[0]) {
      svg.innerHTML = info.qrSvg
      text.textContent = info.urls[0].replace(/\/$/, '')
    } else {
      svg.innerHTML = ''
      text.textContent = info.enabled ? t('show.remoteNoNetwork') : t('show.remoteOff')
    }
    qrEl.style.opacity = '1'
    window.clearTimeout(qrTimer)
    qrTimer = window.setTimeout(() => (qrEl.style.opacity = '0'), 30_000)
  }

  window.api.onShowCommand((cmd, arg) => {
    mark(`Befehl ${cmd}${arg ? ' ' + arg : ''}`)
    if (cmd === 'next') skip(1)
    else if (cmd === 'prev') skip(-1)
    else if (cmd === 'pause') setPaused(true)
    else if (cmd === 'resume') setPaused(false)
    else if (cmd === 'qr') void toggleQr(arg === 'kids')
    else if (cmd === 'effect') {
      const kind = startEffect(arg, true)
      if (kind) notice(t('show.effectRunning', { name: EFFECT_LABELS[kind] }))
      else notice(t('show.noEffect'), 'warn')
    } else if (cmd === 'world') startWorldNow(arg)
    else if (cmd === 'text') {
      const item = settings.texts.find((t) => t.id === arg)
      if (item) {
        void showTextNow(item.text, item.style)
        notice(t('show.textShown'))
      } else notice(t('show.textMissing'), 'warn')
    } else if (cmd === 'say' && arg?.trim()) {
      void showTextNow(arg, RANDOM_STYLE)
      notice(t('show.textShown'))
    } else if (cmd === 'emoji' && arg) {
      const slide = photoOnScreen()
      emojis.show(arg, slide ? slide.upcomingFaces(6) : [])
      notice(t('show.emojiShown', { emoji: arg }))
    } else if (cmd === 'freeze') setFrozen(arg === 'on' ? true : arg === 'off' ? false : undefined)
    else if (cmd === 'song') void startSong(arg)
    else if (cmd === 'songStop') stopSong()
    else if (cmd === 'kidEmoji' && arg) {
      if (kidEmojiUsed) notice(t('show.kidEmojiUsed'), 'warn')
      else {
        kidEmojiUsed = true
        const slide = photoOnScreen()
        emojis.show(arg, slide ? slide.upcomingFaces(6) : [])
        notice(t('show.emojiShown', { emoji: arg }))
        reportStatus()
      }
    } else if (cmd === 'kidText') {
      const item = settings.texts.find((x) => x.id === arg)
      if (kidTextUsed) notice(t('show.kidTextUsed'), 'warn')
      else if (item) {
        kidTextUsed = true
        void showTextNow(item.text, item.style)
        notice(t('show.textShown'))
        reportStatus()
      } else notice(t('show.textMissing'), 'warn')
    }
  })

  /** Texte aus dem Ablauf ruhen, solange ein Lied läuft (der Liedtext steht im Vordergrund). */
  function applyTexts(): void {
    sequencer.setTexts(song.active ? [] : settings.texts, settings.textFillerEvery)
  }

  function closePicker(): void {
    picking = null
    songPickEl.style.display = 'none'
    songPickEl.style.opacity = '0'
    reportStatus()
  }

  function renderPicker(): void {
    if (!picking) return
    songPickEl.innerHTML =
      '<div class="pick-box"><div class="pick-title">' +
      t('show.songPick') +
      '</div>' +
      picking
        .slice(0, 9)
        .map(
          (x, i) =>
            '<div class="pick-item' +
            (i === pickAt ? ' on' : '') +
            '">' +
            (i + 1) +
            '  ·  ' +
            x.title.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!) +
            '</div>'
        )
        .join('') +
      '<div class="pick-hint">' +
      t('show.songPickHint') +
      '</div></div>'
    songPickEl.style.display = 'flex'
    songPickEl.style.opacity = '1'
  }

  async function startSong(name?: string): Promise<void> {
    const list = (await window.api.listSongs()).songs
    if (!list.length) {
      notice(t('show.songNone'), 'warn')
      flashStatus(t('show.songNone'))
      return
    }
    let chosen = name ? list.find((x) => x.name === name) : undefined
    if (!chosen && name) {
      notice(t('show.songMissing'), 'warn')
      return
    }
    if (!chosen && list.length === 1) chosen = list[0]
    if (!chosen) {
      picking = list
      pickAt = 0
      renderPicker()
      reportStatus()
      return
    }
    closePicker()
    const ok = await song.play(chosen.name, {
      volume: settings.songVolume,
      position: settings.songLyricsPosition,
      timing: settings.songTiming[chosen.name],
      fontScale: settings.songFontScale,
      linesBefore: settings.songLinesBefore,
      linesAfter: settings.songLinesAfter
    })
    if (!ok) {
      notice(t('show.songFailed', { name: chosen.title }), 'warn')
      return
    }
    clearDistractions()
    showSongBackground()
    applyTexts()
    notice(t('show.songPlaying', { name: song.title }))
    reportStatus()
  }

  /**
   * Hintergrund während des Liedes: Diashow läuft weiter (nichts zu tun), das gerade gezeigte
   * Foto steht bildfüllend still oder ein festes Foto; beides abgedunkelt.
   */
  function showSongBackground(): void {
    const mode = settings.songBackground
    if (mode === 'slideshow') return
    const name =
      mode === 'photo' ? settings.songPhoto : (photoOnScreen()?.photoName ?? lastPhoto ?? '')
    const url = name ? photoUrl(name) : ''
    const img = songBgEl.querySelector('img')!
    const fill = songBgEl.querySelector<HTMLElement>('.bg-fill')!
    img.style.display = url ? '' : 'none'
    if (url) img.src = url
    else img.removeAttribute('src')
    fill.style.backgroundImage = url ? `url("${url}")` : ''
    songBgEl.querySelector<HTMLElement>('.bg-dim')!.style.opacity = String(settings.songDim)
    songBgEl.style.opacity = '1'
  }

  function hideSongBackground(): void {
    songBgEl.style.opacity = '0'
  }

  function stopSong(): void {
    if (!song.active) return
    song.stop()
    hideSongBackground()
    applyTexts()
    notice(t('show.songStopped'))
    reportStatus()
  }
  song.onEnded = () => {
    hideSongBackground()
    applyTexts()
    reportStatus()
  }

  /** Tasten, solange die Liedauswahl offen ist. `true`, wenn die Taste verbraucht wurde. */
  function pickerKey(key: string): boolean {
    if (!picking) return false
    const n = Math.min(9, picking.length)
    if (key === 'Escape') closePicker()
    else if (key === 'ArrowDown') pickAt = (pickAt + 1) % n
    else if (key === 'ArrowUp') pickAt = (pickAt + n - 1) % n
    else if (key === 'Enter' || key === ' ') void startSong(picking[pickAt].name)
    else if (/^[1-9]$/.test(key) && Number(key) <= n) void startSong(picking[Number(key) - 1].name)
    else return true
    renderPicker()
    return true
  }

  // ---------- Einfrieren (Fernbedienung) ----------
  /** Einfrieren kam während eines Übergangs: gilt dann für das neue Foto. */
  let freezeAfterTransition = false

  function setFrozen(wanted?: boolean): void {
    if (incoming) {
      freezeAfterTransition = wanted ?? !freezeAfterTransition
      notice(freezeAfterTransition ? t('show.freezeNext') : t('show.freezeCancelled'))
      return
    }
    if (!(current instanceof Slide)) {
      notice(t('show.freezeOnlyPhotos'), 'warn')
      return
    }
    const on = wanted ?? !current.frozen
    current.setFrozen(on)
    flashStatus(on ? t('show.frozen') : t('show.continue'))
    notice(on ? t('show.frozenNotice') : t('show.continue'))
    reportStatus()
  }

  // ---------- Texte sofort einblenden (Fernbedienung) ----------
  const instantTexts: { track: OverlayTrack; elapsed: number; until: number }[] = []

  /** Blendet einen Text sofort über dem aktuellen Bild ein (unabhängig vom Ablauf). */
  async function showTextNow(text: string, styleId: string): Promise<void> {
    const item: TextItem = {
      id: 'sofort',
      enabled: true,
      text,
      kind: 'photo',
      photos: [],
      placement: 'over',
      style: styleId
    }
    const style = resolveStyle(item, settings)
    await loadFont(style)
    const overlay = new TextOverlay(textHost, text, style)
    const track = new OverlayTrack()
    const end = 0.05 + overlay.inDuration + pick(settings.textDuration)
    // Über Fotos so platzieren, dass der Text keine Gesichter verdeckt.
    const slide = photoOnScreen()
    if (slide) {
      overlay.placeAvoiding(
        slide.preferredPosition(style),
        slide.upcomingFaces(end + overlay.outDuration)
      )
    } else if (style.position === 'center') overlay.setPosition('bottom')
    track.add(overlay, 0.05, end)
    instantTexts.push({ track, elapsed: 0, until: end + overlay.outDuration + 0.5 })
  }

  /**
   * Das Foto, über dem per Hand Ausgelöstes erscheint: im Übergang schon das neue
   * (Emojis und Sofort-Texte bleiben dann bis zum übernächsten Übergang stehen).
   */
  function photoOnScreen(): Slide | null {
    const scene = incoming ?? current
    return scene instanceof Slide ? scene : null
  }

  /** Sofort-Texte und Hand-Effekte ausblenden (beim Übergang zum nächsten Bild). */
  function endManualExtras(): void {
    kidEmojiUsed = false
    kidTextUsed = false
    effects.endManual()
    emojis.clear()
    for (const t of instantTexts) {
      t.track.leaveAll()
      t.until = Math.min(t.until, t.elapsed + 1.6)
    }
  }

  /** Beginnt ein Lied: Texte, Effekte und Emojis auf dem Bild beenden, damit nichts ablenkt. */
  function clearDistractions(): void {
    effects.fadeAll()
    emojis.clear()
    for (const t of instantTexts) {
      t.track.leaveAll()
      t.until = Math.min(t.until, t.elapsed + 1.6)
    }
    current?.leaveTexts?.()
    incoming?.leaveTexts?.()
  }

  function updateInstantTexts(dt: number): void {
    for (let i = instantTexts.length - 1; i >= 0; i--) {
      const t = instantTexts[i]
      t.elapsed += dt
      t.track.update(t.elapsed)
      if (t.elapsed > t.until) {
        t.track.destroy()
        instantTexts.splice(i, 1)
      }
    }
  }

  /** Nach der 3D-Welt erst überblenden, wenn die Kamera in der Größe des Zielfotos angekommen ist. */
  function worldLanded(): boolean {
    if (!(current instanceof WorldScene) || ready?.kind !== 'photo') return true
    return current.frameSettled
  }

  /** Zwischenspiel sofort (per Fernbedienung oder Einstellungsfenster). */
  function startWorldNow(wanted?: string): void {
    if (thumbs.size < WORLD_MIN_TILES) {
      const text = t('show.worldLoading', { have: thumbs.size, need: WORLD_MIN_TILES })
      flashStatus(text)
      notice(text, 'warn')
      return
    }
    if (current instanceof WorldScene && !incoming) {
      notice(t('show.worldRunning'), 'warn')
      return
    }
    worldForced = true
    if (WORLD_FORMATIONS.includes(wanted as WorldFormation)) {
      worldFormationWanted = wanted as WorldFormation
    }
    notice(
      worldFormationWanted
        ? t('show.worldStartsWith', { name: WORLD_FORMATION_LABELS[worldFormationWanted] })
        : t('show.worldStarts')
    )
    if (incoming) {
      // Mitten im Übergang: direkt nach dem Übergang starten.
      worldAfterTransition = true
      return
    }
    discardReady()
    prefetch()
    current?.hurry(SKIP_FADE)
  }
  /** „3D jetzt“ kam während eines Übergangs: danach sofort ins Zwischenspiel. */
  let worldAfterTransition = false

  function discardReady(): void {
    generation++
    if (ready) dispose(ready)
    ready = null
    loading = false
    loadingEntry = null
  }

  /** Springt vor (+1) oder zurück (-1), mit kurzer Überblendung. */
  function skip(direction: 1 | -1): void {
    if (incoming || !current) return
    freezeAfterTransition = false
    if (direction === -1) {
      const entry = lastPhoto ? sequencer.back(lastPhoto) : undefined
      if (!entry) {
        flashStatus(t('show.start'))
        notice(t('show.start'), 'warn')
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
    song.update()
    // Schon vorbereitete Folien bringen noch eigene Texte mit: während des Liedes unterdrücken.
    if (song.active) {
      current?.leaveTexts?.()
      incoming?.leaveTexts?.()
    }
    if (paused) return
    const dt = Math.min(0.1, ticker.deltaMS / 1000)
    const s = screen()
    effects.update(dt, s)
    updateInstantTexts(dt)
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
        if (worldAfterTransition) {
          worldAfterTransition = false
          discardReady()
          if (!(current instanceof WorldScene)) current.hurry(SKIP_FADE)
        }
        if (freezeAfterTransition) {
          freezeAfterTransition = false
          setFrozen(true)
        }
        reportStatus()
        prefetch()
        slideLayer.addChild(current.view)
      }
    } else if (current?.readyForNext && ready && worldLanded()) {
      startTransition(current.fadeOut)
    }

    if (showFps) statusEl.textContent = `${Math.round(ticker.FPS)} fps`
  })

  window.addEventListener('keydown', (e) => {
    mark(`Taste ${e.key}`)
    if (pickerKey(e.key)) return
    switch (e.key) {
      case 'Escape':
        void window.api.stopShow()
        break
      case ' ':
        setPaused(!paused)
        break
      case 'q': // klein: Kinder-Fernbedienung
        void toggleQr(true)
        break
      case 'Q': // groß: normale Fernbedienung
        void toggleQr(false)
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
      case 'r':
      case 'R':
        void window.api.openRemote().then((r) => {
          if (!r.ok && r.error) flashStatus(r.error)
        })
        break
      case 's':
      case 'S':
        if (song.active) stopSong()
        else void startSong()
        break
      case 'k':
      case 'K':
        void window.api.openKids().then((r) => {
          if (!r.ok && r.error) flashStatus(r.error)
        })
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
      next.includeSubfolders !== settings.includeSubfolders ||
      next.dupesSkip !== settings.dupesSkip
    settings = next
    applyLanguage(settings)
    applyTexts()
    void refreshFocusPhotos()
    if (folderChanged) {
      discardReady()
      void reloadPhotos().then(() => prefetch())
    }
  })

  // Doppelte Fotos wurden verschoben oder gelöscht.
  window.api.onPhotosChanged(() => void reloadPhotos())

  // Während die Analyse noch läuft, kommen neue Treffer hinzu.
  window.setInterval(() => void refreshFocusPhotos(), 60_000)

  await reloadPhotos()
  prefetch()
}

void main()
