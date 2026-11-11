// Ohne eval auskommen, damit die strenge Content-Security-Policy greift.
import 'pixi.js/unsafe-eval'
import { Application, Container } from 'pixi.js'
import { gsap } from 'gsap'
import { pickWeighted } from '@shared/random'
import type { Settings } from '@shared/settings'
import type { TextStyle } from '@shared/text'
import { loadFont } from '../text/fonts'
import { resolveStyle } from '../text/resolve'
import { loadPhoto, loadSoft, type LoadedPhoto } from './loader'
import type { Size } from './motion'
import { Playlist } from './playlist'
import type { Scene } from './scene'
import { Sequencer, type Entry } from './sequencer'
import { Slide, type OverlayText } from './slide'
import { TextSlide } from './textSlide'
import { TransitionEngine } from './transitions/engine'

const FIRST_FADE = 1.2
const SKIP_FADE = 0.6
const SOFT_CACHE_SIZE = 6

const messageEl = document.getElementById('message')!
const infoEl = document.getElementById('info')!
const statusEl = document.getElementById('status')!
const textHost = document.getElementById('texts')!

/** Vorbereiteter nächster Eintrag: alles geladen, kann sofort gezeigt werden. */
type Prepared =
  | { kind: 'photo'; photo: LoadedPhoto; texts: OverlayText[] }
  | {
      kind: 'text'
      entry: Extract<Entry, { kind: 'text' }>
      style: TextStyle
      background: ImageBitmap | null
    }

function dispose(p: Prepared): void {
  if (p.kind === 'photo') p.photo.destroy()
  else p.background?.close()
}

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
  app.stage.addChild(slideLayer, transitions.view)

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

  async function prepare(entry: Entry): Promise<Prepared> {
    if (entry.kind === 'photo') {
      const fill = pickWeighted(settings.fillModes) ?? 'blur'
      const photo = await loadPhoto(
        entry.name,
        screen(),
        app.renderer.resolution,
        settings.maxCrop,
        fill
      )
      remember(entry.name, photo.soft)
      const texts = entry.overlays.map((item) => ({ item, style: resolveStyle(item, settings) }))
      await Promise.all(texts.map((t) => loadFont(t.style)))
      return { kind: 'photo', photo, texts }
    }
    const style = resolveStyle(entry.item, settings)
    const [background] = await Promise.all([softFor(entry.ref), loadFont(style)])
    return { kind: 'text', entry, style, background }
  }

  async function reloadPhotos(): Promise<void> {
    const list = await window.api.listPhotos()
    playlist.setItems(list.files)
    const hasFillers = settings.texts.some((t) => t.enabled && t.kind === 'filler')
    if (list.error) showMessage(`Fotoordner nicht lesbar:\n${list.error}`)
    else if (!list.folder && !hasFillers)
      showMessage('Kein Fotoordner gewählt.\nBitte in den Einstellungen festlegen.')
    else if (list.files.length === 0 && !hasFillers)
      showMessage(`Keine Fotos gefunden in\n${list.folder}`)
    else if (!current) showMessage(null)
  }

  /** Bereitet den nächsten Eintrag vor (Standard: der nächste aus dem Ablauf). */
  function prefetch(next: () => Entry | undefined = () => sequencer.next()): void {
    if (loading || ready) return
    const entry = next()
    if (!entry) return
    loading = true
    const gen = generation
    prepare(entry)
      .then((p) => {
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
    if (p.kind === 'photo') {
      lastPhoto = p.photo.name
      return new Slide(p.photo, screen(), settings, fade, p.texts, textHost)
    }
    return new TextSlide(p.entry.item, p.style, p.background, settings, fade, textHost)
  }

  /** Beginnt den Übergang zum vorbereiteten Eintrag (beim ersten aus Schwarz). */
  function startTransition(fade: number): void {
    if (!ready) return
    incoming = createScene(ready, fade)
    ready = null
    slideLayer.removeChildren()
    transitions.begin(current ? (pickWeighted(settings.transitions) ?? 'fade') : 'fade')
    updateInfo()
    prefetch()
  }

  function updateInfo(): void {
    const scene = incoming ?? current
    infoEl.textContent = scene?.label ?? ''
    infoEl.style.opacity = showInfo && scene ? '1' : '0'
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
    if (paused) return
    const dt = Math.min(0.1, ticker.deltaMS / 1000)
    const s = screen()

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
        paused = !paused
        // Textanimationen laufen über GSAP und werden mit angehalten.
        if (paused) gsap.globalTimeline.pause()
        else gsap.globalTimeline.resume()
        flashStatus(paused ? 'Pause' : 'Weiter')
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
    if (folderChanged) {
      discardReady()
      void reloadPhotos().then(() => prefetch())
    }
  })

  await reloadPhotos()
  prefetch()
}

void main()
