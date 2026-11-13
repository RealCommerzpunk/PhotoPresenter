import { getLanguage, t } from '@shared/i18n'
import { stat } from 'node:fs/promises'
import exifr from 'exifr'
import type { PhotoDetails } from '@shared/ipc'
import { resolvePhoto } from './photos'

const num = (v: number, digits = 1): string =>
  v.toLocaleString(getLanguage(), { maximumFractionDigits: digits })

/** Belichtungszeit lesbar: 0.008 → „1/125 s“, 2 → „2 s“. */
export function formatExposure(seconds: number): string {
  if (seconds >= 1) return `${num(seconds)} s`
  return `1/${Math.round(1 / seconds)} s`
}

function formatDate(value: unknown): string | undefined {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toLocaleString(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' })
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** EXIF-Rohdaten (von exifr) in deutsche Bezeichnungen und lesbare Werte übersetzen. */
export function formatExif(tags: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = []
  const add = (label: string, value: string | undefined): void => {
    if (value) out.push([label, value])
  }
  const str = (key: string): string | undefined => {
    const v = tags[key]
    return typeof v === 'string' && v.trim() ? v.trim().replace(/\0+$/, '') : undefined
  }
  const n = (key: string): number | undefined => {
    const v = tags[key]
    return typeof v === 'number' && isFinite(v) ? v : undefined
  }

  add(t('exif.taken'), formatDate(tags['DateTimeOriginal'] ?? tags['CreateDate']))
  const make = str('Make')
  const model = str('Model')
  // Viele Hersteller wiederholen ihren Namen im Modell („Canon“ + „Canon EOS 5D“).
  add(
    t('exif.camera'),
    model && make && !model.startsWith(make) ? `${make} ${model}` : (model ?? make)
  )
  add(t('exif.lens'), str('LensModel'))
  const exposure = n('ExposureTime')
  const f = n('FNumber')
  const iso = n('ISO')
  add(
    t('exif.exposure'),
    [
      exposure !== undefined ? formatExposure(exposure) : '',
      f !== undefined ? `f/${num(f)}` : '',
      iso !== undefined ? `ISO ${iso}` : ''
    ]
      .filter(Boolean)
      .join(' · ') || undefined
  )
  const focal = n('FocalLength')
  const focal35 = n('FocalLengthIn35mmFormat')
  if (focal !== undefined) {
    add(
      t('exif.focal'),
      `${num(focal)} mm` +
        (focal35 && focal35 !== Math.round(focal) ? t('exif.focal35', { mm: focal35 }) : '')
    )
  }
  const flash = str('Flash')
  if (flash)
    add(t('exif.flash'), /did not fire|no flash|off/i.test(flash) ? t('exif.no') : t('exif.yes'))
  const lat = n('latitude')
  const lon = n('longitude')
  if (lat !== undefined && lon !== undefined) add(t('exif.gps'), `${num(lat, 5)}, ${num(lon, 5)}`)
  const w = n('ExifImageWidth')
  const h = n('ExifImageHeight')
  if (w && h) add(t('exif.size'), `${w} × ${h}`)
  add(t('exif.software'), str('Software'))
  add(t('exif.description'), str('ImageDescription'))
  add(t('exif.artist'), str('Artist'))
  add(t('exif.copyright'), str('Copyright'))
  return out
}

/** Dateigröße, Datum und EXIF eines Fotos aus dem Fotoordner. */
export async function photoInfo(name: string): Promise<PhotoDetails | null> {
  const abs = resolvePhoto(name)
  if (!abs) return null
  try {
    const st = await stat(abs)
    let exif: [string, string][] = []
    try {
      const tags = (await exifr.parse(abs, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: false,
        icc: false,
        iptc: false,
        jfif: false,
        ihdr: false,
        translateValues: true,
        reviveValues: true
      })) as Record<string, unknown> | undefined
      if (tags) exif = formatExif(tags)
    } catch {
      // Kein EXIF (z. B. PNG oder bearbeitete Datei): nur Dateiangaben.
    }
    return { size: st.size, modified: st.mtime.toISOString(), exif }
  } catch {
    return null
  }
}
