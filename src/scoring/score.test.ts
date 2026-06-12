import { describe, expect, it } from 'vitest'
import type { AnnotatedMap, Chain, DropZone, PieceDef, WorldPiece } from '@/model/types'
import { BASE_RADIUS_IN, CONTROL_CENTER_TO_CENTER_IN, MARKER_RADIUS_IN } from '@/model/constants'
import { resolvePiece } from '@/geometry/polygon'
import { distToTunnel } from '@/rules/tunnel'
import {
  centerObjectiveAccess,
  forwardReach,
  homeObjectiveUnburrow,
  makeScoringContext,
  objectiveCoverage,
  zigzag,
} from './score'
import { dominates, ParetoFront } from './pareto'
import { kMedoids } from './kmedoids'
import { mulberry32 } from './rng'

const square = (half: number): PieceDef['outer'] => [
  { x: -half, y: -half },
  { x: half, y: -half },
  { x: half, y: half },
  { x: -half, y: half },
]

function piece(id: string, x: number, y: number, half: number): WorldPiece {
  return resolvePiece({ id, name: id, kind: 'ruin', outer: square(half) }, { pieceId: id, x, y, rotationDeg: 0 })
}

const dz: DropZone = {
  id: 'dz',
  name: 'A',
  anchorEdge: 'left',
  polygon: [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 22 },
    { x: 0, y: 22 },
  ],
}

function makeMap(objectives: AnnotatedMap['objectives']): AnnotatedMap {
  return {
    id: 'test',
    name: 'Test',
    killzone: 'test',
    image: '',
    widthIn: 30,
    heightIn: 22,
    pxPerInchX: 1,
    pxPerInchY: 1,
    originPx: { x: 0, y: 0 },
    placements: [],
    dropZones: [dz],
    objectives,
  }
}

// Straight horizontal chain along y=11.
const straight: Chain = [
  { x: 0.5, y: 11 },
  { x: 5, y: 11 },
  { x: 9.5, y: 11 },
  { x: 14, y: 11 },
  { x: 18.5, y: 11 },
]

describe('distToTunnel', () => {
  it('is 0 on a marker and on a between-segment', () => {
    expect(distToTunnel({ x: 5, y: 11 }, straight)).toBe(0)
    expect(distToTunnel({ x: 7, y: 11 }, straight)).toBe(0)
  })
  it('measures from the capsule surface (20mm-wide TUNNEL)', () => {
    expect(distToTunnel({ x: 7, y: 13 }, straight)).toBeCloseTo(2 - MARKER_RADIUS_IN, 6)
  })
  it('respects partial prefixes', () => {
    expect(distToTunnel({ x: 18.5, y: 11 }, straight, 1)).toBeCloseTo(13.5 - MARKER_RADIUS_IN, 6)
  })
})

describe('zigzag', () => {
  it('counts distinct pieces crossed by between-segments, binary per piece', () => {
    const crossed = piece('a', 7, 11, 0.5) // straddles segment 1–2
    const crossedTwice = piece('b', 11, 11, 0.5) // straddles segment 2–3
    const missed = piece('c', 7, 17, 1)
    expect(zigzag(straight, [crossed, crossedTwice, missed])).toBe(2)
  })

  it('counts a piece crossed by two segments once', () => {
    const big = piece('big', 9.5, 11, 2)
    expect(zigzag(straight, [big])).toBe(1)
  })
})

describe('centerObjectiveAccess', () => {
  it('finds the smallest prefix reaching the center objective', () => {
    // Center objective right next to marker 2 at (9.5, 11).
    const map = makeMap([{ id: 'c', role: 'center', center: { x: 9.5, y: 12 } }])
    const ctx = makeScoringContext(map, [], dz)
    expect(centerObjectiveAccess(straight, ctx)).toBe(2)
  })

  it('returns 5 when the objective is never reachable', () => {
    const map = makeMap([{ id: 'c', role: 'center', center: { x: 28, y: 2 } }])
    const ctx = makeScoringContext(map, [], dz)
    expect(centerObjectiveAccess(straight, ctx)).toBe(5)
  })

  it('returns 0 when marker 0 already grants control range', () => {
    const map = makeMap([{ id: 'c', role: 'center', center: { x: 1, y: 11.5 } }])
    const ctx = makeScoringContext(map, [], dz)
    expect(centerObjectiveAccess(straight, ctx)).toBe(0)
  })
})

describe('homeObjectiveUnburrow', () => {
  it('is ~0 when a base can sit centred on the home objective', () => {
    const map = makeMap([{ id: 'h', role: 'other', center: { x: 5, y: 11 } }])
    const ctx = makeScoringContext(map, [], dz)
    expect(homeObjectiveUnburrow(straight, ctx)).toBeLessThan(0.01)
  })

  it('approaches the objective up to base reach from the TUNNEL', () => {
    // Objective 5" above the tunnel line: best base centre is reach short of it.
    const map = makeMap([{ id: 'h', role: 'other', center: { x: 5, y: 6 } }])
    const ctx = makeScoringContext(map, [], dz)
    const reach = MARKER_RADIUS_IN + BASE_RADIUS_IN
    const d = homeObjectiveUnburrow(straight, ctx)
    expect(d).toBeGreaterThan(5 - reach - 0.05)
    expect(d).toBeLessThan(5 - reach + 0.15)
  })

  it('control range is achievable when distance ≤ 40mm + 1"', () => {
    const map = makeMap([{ id: 'h', role: 'other', center: { x: 5, y: 13 } }])
    const ctx = makeScoringContext(map, [], dz)
    expect(homeObjectiveUnburrow(straight, ctx)).toBeLessThanOrEqual(CONTROL_CENTER_TO_CENTER_IN)
  })
})

describe('objectiveCoverage', () => {
  it('covers an objective sitting on the TUNNEL', () => {
    const map = makeMap([{ id: 'o', role: 'other', center: { x: 7, y: 11 } }])
    expect(objectiveCoverage(straight, map)).toBe(1)
  })

  it('does not cover an objective whose far side exceeds 2" from the TUNNEL', () => {
    // Disk radius ≈ 1.787"; centre 2.5" off the tunnel surface → far side ≈ 4.3" away.
    const map = makeMap([{ id: 'o', role: 'other', center: { x: 7, y: 14 } }])
    expect(objectiveCoverage(straight, map)).toBe(0)
  })
})

describe('forwardReach', () => {
  it('is the max perpendicular distance from the anchor edge', () => {
    const map = makeMap([])
    const ctx = makeScoringContext(map, [], dz)
    expect(forwardReach(straight, ctx)).toBeCloseTo(18.5, 6)
  })

  it('respects the anchor edge direction', () => {
    const rightDz: DropZone = { ...dz, anchorEdge: 'right' }
    const map = makeMap([])
    const ctx = makeScoringContext(map, [], rightDz)
    expect(forwardReach(straight, ctx)).toBeCloseTo(30 - 0.5, 6)
  })
})

describe('Pareto front', () => {
  it('dominance requires ≥ everywhere and > somewhere', () => {
    expect(dominates([2, 2], [1, 2])).toBe(true)
    expect(dominates([2, 1], [1, 2])).toBe(false)
    expect(dominates([1, 2], [1, 2])).toBe(false)
  })

  it('keeps only non-dominated entries', () => {
    const front = new ParetoFront<string>()
    front.offer([1, 5], 'a')
    front.offer([5, 1], 'b')
    front.offer([3, 3], 'c')
    front.offer([2, 2], 'd') // dominated by c
    front.offer([6, 6], 'e') // dominates everything
    expect(front.entries.map((x) => x.item)).toEqual(['e'])
  })

  it('retains trade-offs', () => {
    const front = new ParetoFront<string>()
    front.offer([1, 5], 'a')
    front.offer([5, 1], 'b')
    front.offer([3, 3], 'c')
    expect(front.size).toBe(3)
  })
})

describe('kMedoids', () => {
  it('is deterministic for a fixed seed and returns k distinct indices', () => {
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(42)
    const points = Array.from({ length: 50 }, (_, i) => [i % 7, Math.floor(i / 7), (i * 13) % 5])
    const a = kMedoids(points, 6, rng1)
    const b = kMedoids(points, 6, rng2)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
    expect(a.length).toBe(6)
  })

  it('returns everything when fewer points than k', () => {
    expect(kMedoids([[1], [2]], 6, mulberry32(1))).toEqual([0, 1])
  })
})
