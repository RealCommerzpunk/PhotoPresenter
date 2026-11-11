import { describe, expect, it } from 'vitest'
import {
  cosine,
  decodeEmbedding,
  decodeYunet,
  encodeEmbedding,
  matchFace,
  templateKeypoints,
  nms,
  personSimilarity,
  SFACE_TEMPLATE,
  similarityTransform,
  YUNET_SIZE
} from './faces'

function emptyOutputs(): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {}
  for (const s of [8, 16, 32]) {
    const n = (YUNET_SIZE / s) ** 2
    out[`cls_${s}`] = new Float32Array(n)
    out[`obj_${s}`] = new Float32Array(n)
    out[`bbox_${s}`] = new Float32Array(n * 4)
    out[`kps_${s}`] = new Float32Array(n * 10)
  }
  return out
}

describe('decodeYunet', () => {
  it('liest Rahmen und Punkte einer Zelle richtig aus', () => {
    const out = emptyOutputs()
    // Zelle Zeile 5, Spalte 7 bei Schrittweite 32 (20 Spalten)
    const i = 5 * 20 + 7
    out.cls_32[i] = 0.9
    out.obj_32[i] = 0.9
    out.bbox_32.set([0.5, 0.5, Math.log(2), Math.log(3)], i * 4)
    out.kps_32.set([0, 0, 1, 0, 0.5, 0.5, 0, 1, 1, 1], i * 10)
    const [d] = decodeYunet(out)
    expect(d.score).toBeCloseTo(0.9)
    // Mitte (7,5 · 32, 5,5 · 32), Größe 64 × 96
    expect(d.box[0]).toBeCloseTo(7.5 * 32 - 32)
    expect(d.box[1]).toBeCloseTo(5.5 * 32 - 48)
    expect(d.box[2]).toBeCloseTo(64)
    expect(d.box[3]).toBeCloseTo(96)
    expect(d.kps.slice(0, 4)).toEqual([7 * 32, 5 * 32, 8 * 32, 5 * 32])
  })

  it('ignoriert schwache Treffer', () => {
    const out = emptyOutputs()
    out.cls_8[10] = 0.2
    out.obj_8[10] = 0.2
    expect(decodeYunet(out)).toHaveLength(0)
  })
})

describe('nms', () => {
  it('behält bei Überlappung nur den besseren Treffer', () => {
    const a = { box: [0, 0, 100, 100] as [number, number, number, number], kps: [], score: 0.9 }
    const b = { box: [10, 10, 100, 100] as [number, number, number, number], kps: [], score: 0.8 }
    const c = { box: [300, 300, 50, 50] as [number, number, number, number], kps: [], score: 0.7 }
    expect(nms([b, a, c], 0.3)).toEqual([a, c])
  })
})

describe('similarityTransform', () => {
  it('findet eine bekannte Drehung, Skalierung und Verschiebung wieder', () => {
    const [a0, b0, tx0, ty0] = [1.3 * Math.cos(0.2), 1.3 * Math.sin(0.2), 12, -7]
    const src = [10, 20, 60, 22, 35, 45, 15, 70, 55, 72]
    const dst: number[] = []
    for (let i = 0; i < 5; i++) {
      const x = src[2 * i]
      const y = src[2 * i + 1]
      dst.push(a0 * x - b0 * y + tx0, b0 * x + a0 * y + ty0)
    }
    const [a, b, tx, ty] = similarityTransform(src, dst)
    expect(a).toBeCloseTo(a0)
    expect(b).toBeCloseTo(b0)
    expect(tx).toBeCloseTo(tx0)
    expect(ty).toBeCloseTo(ty0)
  })

  it('bildet die Vorlage auf sich selbst ab', () => {
    const [a, b, tx, ty] = similarityTransform(SFACE_TEMPLATE, SFACE_TEMPLATE)
    expect([a, b, tx, ty].map((v) => Number(v.toFixed(6)))).toEqual([1, 0, 0, 0])
  })
})

describe('Ähnlichkeit und Speicherformat', () => {
  it('berechnet Kosinus und beste Übereinstimmung', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(
      personSimilarity(
        [1, 0],
        [
          [0, 1],
          [0.8, 0.6]
        ]
      )
    ).toBeCloseTo(0.8)
  })

  it('kodiert Merkmalsvektoren verlustfrei', () => {
    const v = Array.from({ length: 128 }, (_, i) => Math.sin(i) * 0.3)
    const back = decodeEmbedding(encodeEmbedding(v))
    expect(back).toHaveLength(128)
    back.forEach((x, i) => expect(x).toBeCloseTo(v[i], 5))
  })
})

describe('matchFace', () => {
  const person = [[1, 0, 0]]
  it('erkennt über der Schwelle', () => {
    expect(matchFace([0.9, 0.3, 0], person, [], 0.38).match).toBe(true)
    expect(matchFace([0.2, 1, 0], person, [], 0.38).match).toBe(false)
  })

  it('schließt Gesichter aus, die einem Gegenbeispiel ähnlicher sind', () => {
    const negatives = [[0.7, 0.7, 0]]
    // ähnlich zur Person (0,8), aber noch ähnlicher zum Gegenbeispiel
    const r = matchFace([0.6, 0.8, 0], person, negatives, 0.38)
    expect(r.similarity).toBeGreaterThan(0.38)
    expect(r.match).toBe(false)
    // das Gegenbeispiel selbst ist nie ein Treffer
    expect(matchFace([0.7, 0.7, 0], person, negatives, 0.38).match).toBe(false)
    // echte Treffer bleiben Treffer
    expect(matchFace([1, 0.05, 0], person, negatives, 0.38).match).toBe(true)
  })

  it('ist ohne Beispiele nie ein Treffer', () => {
    expect(matchFace([1, 0, 0], [], [], 0.38).match).toBe(false)
  })
})

describe('templateKeypoints', () => {
  it('legt die Vorlage in den Rahmen', () => {
    const k = templateKeypoints([100, 200, 112, 112])
    expect(k[0]).toBeCloseTo(100 + SFACE_TEMPLATE[0])
    expect(k[1]).toBeCloseTo(200 + SFACE_TEMPLATE[1])
  })
})
