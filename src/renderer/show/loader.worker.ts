/// <reference lib="webworker" />
import type { FillMode } from '@shared/settings'
import { preparePhoto, prepareSoft, prepareThumb, type PreparedImages } from './imageprep'
import type { Size } from './motion'

/** Aufträge an den Bild-Worker. */
export type WorkerRequest =
  | {
      id: number
      kind: 'photo'
      name: string
      screen: Size
      pixelRatio: number
      maxCrop: number
      fill: FillMode
      maxZoom: number
    }
  | { id: number; kind: 'soft'; name: string; screen: Size }
  | { id: number; kind: 'thumb'; name: string }

export type WorkerResponse =
  | { id: number; ok: true; kind: 'photo'; images: PreparedImages }
  | { id: number; ok: true; kind: 'soft'; soft: ImageBitmap }
  | { id: number; ok: true; kind: 'thumb'; thumb: ImageBitmap }
  | { id: number; ok: false; error: string }

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    if (req.kind === 'photo') {
      const r = await preparePhoto(
        req.name,
        req.screen,
        req.pixelRatio,
        req.maxCrop,
        req.fill,
        req.maxZoom
      )
      const msg: WorkerResponse = { id: req.id, ok: true, kind: 'photo', images: r }
      // Bitmaps werden übertragen, nicht kopiert.
      self.postMessage(msg, [...r.strips.map((s) => s.bitmap), r.backdrop, r.soft])
    } else if (req.kind === 'thumb') {
      const thumb = await prepareThumb(req.name)
      self.postMessage({ id: req.id, ok: true, kind: 'thumb', thumb } satisfies WorkerResponse, [
        thumb
      ])
    } else {
      const soft = await prepareSoft(req.name, req.screen)
      self.postMessage({ id: req.id, ok: true, kind: 'soft', soft } satisfies WorkerResponse, [
        soft
      ])
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: String(err) } satisfies WorkerResponse)
  }
}
