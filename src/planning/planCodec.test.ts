import LZString from 'lz-string'
import { describe, expect, it } from 'vitest'
import type { Plan } from '@/model/types'
import { decodePlan, encodePlan } from './planCodec'

const samplePlan: Plan = {
  name: 'Volkus Alpha Gameplan',
  mapId: 'volkus-1',
  dropZoneId: 'dz-a',
  slides: [
    {
      id: 'slideA',
      name: 'Turn 1 — Burrow Home',
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
    expect(decoded!.mapId).toBe(samplePlan.mapId)
    expect(decoded!.dropZoneId).toBe(samplePlan.dropZoneId)
    expect(decoded!.slides).toHaveLength(2)

    const s0 = decoded!.slides[0]
    expect(s0.name).toBe('Turn 1 — Burrow Home')
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
    expect(parsed[0]).toBe(1)
  })

  it('decodes legacy (unversioned) plans for backwards compatibility', () => {
    // Plans shared before versioning led with the name string, not a version.
    const legacy = JSON.stringify(['Old Plan', 'volkus-1', 'dz-a', [['Turn 1', 0, []]]])
    const encoded = LZString.compressToEncodedURIComponent(legacy)
    const decoded = decodePlan(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.name).toBe('Old Plan')
    expect(decoded!.mapId).toBe('volkus-1')
    expect(decoded!.slides).toHaveLength(1)
  })

  it('returns null for an unknown future codec version', () => {
    const future = JSON.stringify([999, 'Future Plan', 'volkus-1', 'dz-a', [['Turn 1', 0, []]]])
    const encoded = LZString.compressToEncodedURIComponent(future)
    expect(decodePlan(encoded)).toBeNull()
  })

  it('produces a compact encoding for a realistic plan', () => {
    const big: Plan = {
      name: 'Big Plan',
      mapId: 'volkus-1',
      dropZoneId: 'dz-a',
      slides: Array.from({ length: 6 }, (_, s) => ({
        id: `s${s}`,
        name: `Slide ${s + 1}`,
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
