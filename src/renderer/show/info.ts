import type { PhotoDetails } from '@shared/ipc'
import { FILL_LABELS } from '@shared/settings'
import type { LoadedPhoto } from './loader'
import type { Size } from './motion'
import type { SlideStats } from './slide'

/** Alles, was die Info-Einblendung (Taste I) über die aktuelle Folie zeigt. */
export interface InfoData {
  label: string
  screen: Size
  resolution: number
  photo?: {
    loaded: LoadedPhoto
    stats: SlideStats
    focus: boolean
    partner: boolean
  }
  details?: PhotoDetails | null
  faces?: number
}

const de = (v: number, digits = 2): string =>
  v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
  )
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${de(bytes / (1024 * 1024), 1)} MB`
  return `${de(bytes / 1024, 0)} KB`
}

/** HTML der Info-Tafel. */
export function infoHtml(d: InfoData): string {
  const rows: [string, string][] = []
  const screenPx = `${Math.round(d.screen.w * d.resolution)} × ${Math.round(d.screen.h * d.resolution)}`
  const p = d.photo
  if (p) {
    const { original, size, fit, fill } = p.loaded
    const mp = (original.w * original.h) / 1e6
    rows.push([
      'Original',
      `${original.w} × ${original.h} px (${de(mp, 1)} MP)` +
        (d.details ? ` · ${fileSize(d.details.size)}` : '')
    ])
    rows.push(['Geladen', `${size.w} × ${size.h} px`])
    rows.push(['Bildschirm', `${screenPx} px` + (d.resolution !== 1 ? ` (Skalierung ${de(d.resolution)})` : '')])
    const s = p.stats
    rows.push([
      'Zoom',
      `${de(s.zoom)}× (Grenze ${de(s.maxZoom)}×)` + (s.frozen ? ' · eingefroren' : '')
    ])
    // Bildschirmpixel je Originalpixel: über 1 wird das Foto vergrößert.
    const upscale = s.scale > 1.001
    rows.push([
      'Vergrößerung',
      `${de(s.scale * 100, 0)} % des Originals` +
        (upscale ? ' (hochskaliert)' : '') +
        ` · eingepasst ${de(s.baseScale * 100, 0)} %`
    ])
    rows.push(['Bewegung', `${escapeHtml(s.motion)} · ${de(s.progress * 100, 0)} %`])
    rows.push([
      'Rand',
      fit.covers ? 'füllt den Bildschirm' : `${FILL_LABELS[fill]}` + (fit.capped ? ' (Grundgröße begrenzt)' : '')
    ])
    if (d.faces !== undefined) {
      const who = p.focus ? (p.partner ? ' · Fokus-Person und Partner' : ' · Fokus-Person') : ''
      rows.push(['Gesichter', `${d.faces}${who}`])
    }
    for (const [label, value] of d.details?.exif ?? []) rows.push([label, escapeHtml(value)])
    if (d.details) {
      rows.push([
        'Datei geändert',
        new Date(d.details.modified).toLocaleString('de-DE', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      ])
    }
  } else {
    rows.push(['Bildschirm', `${screenPx} px`])
  }
  return (
    `<div class="info-title">${escapeHtml(d.label)}</div>` +
    `<table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>` +
    `<div class="info-hint">I blendet aus</div>`
  )
}
