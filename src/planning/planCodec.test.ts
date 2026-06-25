import LZString from 'lz-string'
import { describe, expect, it } from 'vitest'
import type { Plan, SlideObject } from '@/model/types'
import { OBJECT_COLORS } from '@/model/types'
import { decodePlan, encodePlan } from './planCodec'

const samplePlan: Plan = {
  name: 'Volkus Alpha Gameplan',
  slides: [
    {
      id: 'slideA',
      name: 'Turn 1 — Burrow Home',
      mapId: 'volkus-1',
      dropZoneId: 'dz-a',
      markers: [
        { x: 1.234, y: 2.345 },
        { x: 5, y: 6 },
        { x: 10.5, y: 7.25 },
        { x: 12, y: 9 },
        { x: 15.111, y: 11.999 },
      ],
      objects: [
        { id: 'o1', kind: 'circle', x: 3.2, y: 4.1, sizeMm: 40, color: 'blue', label: 'Vantage' },
        { id: 'o2', kind: 'rect', x: 8, y: 8, rotationDeg: 45.5, lengthMm: 50, widthMm: 8, color: 'green', label: 'Light Barricade' },
        { id: 'o3', kind: 'arrow', x1: 1, y1: 1, x2: 9, y2: 9, color: 'yellow', label: 'push' },
        { id: 'o4', kind: 'text', x: 6, y: 6, label: 'kill zone' },
      ],
    },
    {
      id: 'slideB',
      name: 'Turn 2',
      mapId: 'gallowdark-1',
      dropZoneId: 'dz-b',
      markers: null,
      objects: [],
    },
  ],
}

describe('planCodec', () => {
  it('round-trips a plan through encode/decode (coords within rounding)', () => {
    const decoded = decodePlan(encodePlan(samplePlan))
    expect(decoded).not.toBeNull()
    expect(decoded!.name).toBe(samplePlan.name)
    expect(decoded!.slides).toHaveLength(2)

    const s0 = decoded!.slides[0]
    expect(s0.name).toBe('Turn 1 — Burrow Home')
    expect(s0.mapId).toBe('volkus-1')
    expect(s0.dropZoneId).toBe('dz-a')
    expect(decoded!.slides[1].mapId).toBe('gallowdark-1')
    expect(decoded!.slides[1].dropZoneId).toBe('dz-b')
    expect(s0.markers).toHaveLength(5)
    expect(s0.markers![0].x).toBeCloseTo(1.234, 3)
    expect(s0.objects).toHaveLength(4)

    const circle = s0.objects[0]
    expect(circle.kind).toBe('circle')
    expect(circle).toMatchObject({ sizeMm: 40, color: 'blue', label: 'Vantage' })

    const rect = s0.objects[1]
    expect(rect).toMatchObject({ kind: 'rect', lengthMm: 50, widthMm: 8, color: 'green' })

    const arrow = s0.objects[2]
    expect(arrow).toMatchObject({ kind: 'arrow', color: 'yellow', label: 'push' })

    expect(decoded!.slides[1].markers).toBeNull()
    expect(decoded!.slides[1].objects).toEqual([])
  })

  it('regenerates fresh ids (does not encode them)', () => {
    const decoded = decodePlan(encodePlan(samplePlan))!
    expect(decoded.slides[0].id).not.toBe('slideA')
    expect(decoded.slides[0].objects[0].id).not.toBe('o1')
  })

  it('returns null for garbage input', () => {
    expect(decodePlan('not-valid-lzstring!!!')).toBeNull()
    expect(decodePlan('')).toBeNull()
  })

  it('embeds a numeric codec version as the first element', () => {
    const json = LZString.decompressFromEncodedURIComponent(encodePlan(samplePlan))!
    const parsed = JSON.parse(json)
    expect(parsed[0]).toBe(2)
  })

  it('decodes legacy (unversioned) plans, lifting plan map/drop zone onto slides', () => {
    // Plans shared before versioning led with the name string, not a version,
    // and kept a single plan-level map/drop zone.
    const legacy = JSON.stringify(['Old Plan', 'volkus-1', 'dz-a', [['Turn 1', 0, []], ['Turn 2', 0, []]]])
    const encoded = LZString.compressToEncodedURIComponent(legacy)
    const decoded = decodePlan(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.name).toBe('Old Plan')
    expect(decoded!.slides).toHaveLength(2)
    // Every slide inherits the old plan-level map/drop zone.
    for (const s of decoded!.slides) {
      expect(s.mapId).toBe('volkus-1')
      expect(s.dropZoneId).toBe('dz-a')
    }
  })

  it('decodes version 1 plans, lifting plan map/drop zone onto slides', () => {
    const v1 = JSON.stringify([1, 'V1 Plan', 'volkus-1', 'dz-a', [['Turn 1', 0, []]]])
    const encoded = LZString.compressToEncodedURIComponent(v1)
    const decoded = decodePlan(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.slides[0].mapId).toBe('volkus-1')
    expect(decoded!.slides[0].dropZoneId).toBe('dz-a')
  })

  it('returns null for an unknown future codec version', () => {
    const future = JSON.stringify([999, 'Future Plan', [['Turn 1', 'volkus-1', 'dz-a', 0, []]]])
    const encoded = LZString.compressToEncodedURIComponent(future)
    expect(decodePlan(encoded)).toBeNull()
  })

  it('produces a compact encoding for a realistic plan', () => {
    const big: Plan = {
      name: 'Big Plan',
      slides: Array.from({ length: 6 }, (_, s) => ({
        id: `s${s}`,
        name: `Slide ${s + 1}`,
        mapId: 'volkus-1',
        dropZoneId: 'dz-a',
        markers: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 6 },
          { x: 7, y: 8 },
          { x: 9, y: 10 },
        ],
        objects: Array.from({ length: 12 }, (_, i) => ({
          id: `s${s}o${i}`,
          kind: 'circle' as const,
          x: i,
          y: i,
          sizeMm: 40,
          color: 'red' as const,
          label: 'op',
        })),
      })),
    }
    const encoded = encodePlan(big)
    // 6 slides × ~12 objects should stay well under a messaging-app URL limit.
    expect(encoded.length).toBeLessThan(2000)
  })
})

// How much fits in a shareable URL before the ADR-0003 ~2000-char ceiling.
// The shareable payload is the `#p=...` hash, so the URL length is the encoded
// blob plus the `#p=` prefix. Objects are a realistic mix of all four kinds
// (varied coords/colours/labels) rather than identical circles, so LZ-string
// can't over-compress and the numbers reflect plausible plans. These are
// characterisation tests: if the codec changes the capacity and you have to
// retune the bounds, that is the signal working as intended.
const URL_LIMIT = 2000
const HASH_PREFIX = 'https://bennyty.github.io/KTBoard/#p='.length

function makeObject(i: number): SlideObject {
  const x = Math.round((((i * 1.37) % 40) * 1000)) / 1000
  const y = Math.round((((i * 2.11) % 30) * 1000)) / 1000
  const color = OBJECT_COLORS[i % OBJECT_COLORS.length]
  switch (i % 4) {
    case 0:
      return { id: `o${i}`, kind: 'circle', x, y, sizeMm: 40, color, label: `unit ${i}` }
    case 1:
      return { id: `o${i}`, kind: 'rect', x, y, rotationDeg: (i * 7) % 360, lengthMm: 50, widthMm: 8, color, label: `barricade ${i}` }
    case 2:
      return { id: `o${i}`, kind: 'arrow', x1: x, y1: y, x2: x + 9, y2: y + 4, color, label: `move ${i}` }
    default:
      return { id: `o${i}`, kind: 'text', x, y, label: `note ${i}` }
  }
}

function makePlan(slideCount: number, objectsPerSlide: number): Plan {
  let n = 0
  return {
    name: 'Volkus Alpha Gameplan',
    slides: Array.from({ length: slideCount }, (_, s) => ({
      id: `s${s}`,
      name: `Turn ${s + 1}`,
      mapId: 'volkus-1',
      dropZoneId: 'dz-a',
      markers: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 },
        { x: 7, y: 8 },
        { x: 9, y: 10 },
      ],
      objects: Array.from({ length: objectsPerSlide }, () => makeObject(n++)),
    })),
  }
}

const urlLength = (plan: Plan) => HASH_PREFIX + encodePlan(plan).length

/** Largest objectsPerSlide whose URL still fits the limit, for a given slide count. */
function maxObjectsPerSlide(slideCount: number): number {
  let n = 0
  while (urlLength(makePlan(slideCount, n + 1)) <= URL_LIMIT) n++
  return n
}

/** Largest slide count whose URL still fits the limit, at a given objectsPerSlide. */
function maxSlides(objectsPerSlide: number): number {
  let n = 0
  while (urlLength(makePlan(n + 1, objectsPerSlide)) <= URL_LIMIT) n++
  return n
}

describe('planCodec URL capacity', () => {
  it('keeps a realistic 6-slide × 12-object plan under the limit', () => {
    expect(urlLength(makePlan(6, 12))).toBeLessThanOrEqual(URL_LIMIT)
  })

  it('fits ~94 objects on a single slide before exceeding the limit', () => {
    const n = maxObjectsPerSlide(1)
    expect(n).toBe(93)
    // Boundary is real: this many fits, one more does not.
    expect(urlLength(makePlan(1, n))).toBeLessThanOrEqual(URL_LIMIT)
    expect(urlLength(makePlan(1, n + 1))).toBeGreaterThan(URL_LIMIT)
  })

  it('fits 6 slides of 12 objects each before exceeding the limit', () => {
    const n = maxSlides(12)
    expect(n).toBe(6)
    expect(urlLength(makePlan(n, 12))).toBeLessThanOrEqual(URL_LIMIT)
    expect(urlLength(makePlan(n + 1, 12))).toBeGreaterThan(URL_LIMIT)
  })

  it('exceeds the limit for an oversized plan (8 slides × 18 objects)', () => {
    expect(urlLength(makePlan(8, 18))).toBeGreaterThan(URL_LIMIT)
  })
})
