// Ohne eval auskommen, damit die strenge Content-Security-Policy greift.
import 'pixi.js/unsafe-eval'
import { Application, Container } from 'pixi.js'
import { pickWeighted } from '@shared/random'
import type { Settings } from '@shared/settings'
import { loadPhoto, type LoadedPhoto } from './loader'
import type { Size } from './motion'
import { Playlist } from './playlist'
import { Slide } from './slide'
import { TransitionEngine } from './transitions/engine'

const FIRST_FADE = 1.2
const SKIP_FADE = 0.6

const messageEl = document.getElementById('message')!
const infoEl = document.getElementById('info')!
const statusEl = document.getElementById('status')!

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

  /** Hält das aktuelle Foto, solange kein Übergang läuft. */
  const slideLayer = new Container()
  const transitions = new TransitionEngine(app.renderer)
  app.stage.addChild(slideLayer, transitions.view)

  let current: Slide | null = null
  let incoming: Slide | null = null
  /** Vorgeladenes nächstes Foto. */
  let ready: LoadedPhoto | null = null
  let loading = false
  /** Erhöht sich bei jedem Sprung; ältere Ladevorgänge werden verworfen. */
  let generation = 0
  let paused = false
  let showInfo = false
  let showFps = false
  let failures = 0

  const screen = (): Size => ({ w: app.screen.width, h: app.screen.height })

  async function reloadPhotos(): Promise<void> {
    const list = await window.api.listPhotos()
    playlist.setItems(list.files)
    if (list.error) showMessage(`Fotoordner nicht lesbar:\n${list.error}`)
    else if (!list.folder)
      showMessage('Kein Fotoordner gewählt.\nBitte in den Einstellungen festlegen.')
    else if (list.files.length === 0) showMessage(`Keine Fotos gefunden in\n${list.folder}`)
    else if (!current) showMessage(null)
  }

  /** Lädt das Foto, das `choose` liefert, als nächstes vor. */
  function prefetch(choose: () => string | undefined = () => playlist.next()): void {
    if (loading || ready) return
    const name = choose()
    if (!name) return
    loading = true
    const gen = generation
    const fill = pickWeighted(settings.fillModes) ?? 'blur'
    loadPhoto(name, screen(), app.renderer.resolution, settings.maxCrop, fill)
      .then((photo) => {
        if (gen !== generation) photo.destroy()
        else {
          ready = photo
          failures = 0
        }
      })
      .catch((err) => {
        console.warn('Foto übersprungen:', err)
        failures++
      })
      .finally(() => {
        loading = false
        // Bei Fehlern das nächste versuchen, aber nicht endlos, wenn alle defekt sind.
        if (gen === generation && !ready && failures < Math.max(5, playlist.size)) prefetch()
      })
  }

  /** Beginnt den Übergang zum vorgeladenen Foto (beim ersten Foto aus Schwarz). */
  function startTransition(fade: number): void {
    if (!ready) return
    incoming = new Slide(ready, screen(), settings, fade)
    ready = null
    slideLayer.removeChildren()
    transitions.begin(current ? (pickWeighted(settings.transitions) ?? 'fade') : 'fade')
    updateInfo()
    prefetch()
  }

  function updateInfo(): void {
    const slide = incoming ?? current
    infoEl.textContent = slide ? slide.loaded.name : ''
    infoEl.style.opacity = showInfo && slide ? '1' : '0'
  }

  /** Springt vor (+1) oder zurück (-1), mit kurzer Überblendung. */
  function skip(direction: 1 | -1): void {
    if (incoming || !current) return
    if (direction === -1) {
      // Der Verlaufszeiger steht auf dem vorgeladenen Foto: zweimal zurück = Foto vor dem aktuellen.
      const before = playlist.previous() && playlist.previous()
      if (!before) {
        playlist.next()
        flashStatus('Anfang erreicht')
        return
      }
      generation++
      ready?.destroy()
      ready = null
      loading = false
      prefetch(() => before)
    }
    current.display = Math.min(current.display, Math.max(0, current.elapsed - current.fadeIn))
    current.fadeOut = SKIP_FADE
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
    if (folderChanged) {
      generation++
      ready?.destroy()
      ready = null
      loading = false
      void reloadPhotos().then(() => prefetch())
    }
  })

  await reloadPhotos()
  prefetch()
}

void main()
