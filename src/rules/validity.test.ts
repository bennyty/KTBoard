import { describe, expect, it } from 'vitest'
import type { Chain, DropZone, PieceDef, WorldPiece } from '@/model/types'
import { MARKER_RADIUS_IN } from '@/model/constants'
import { resolvePiece } from '@/geometry/polygon'
import { chainViolations, markerPlacementClear } from './validity'

const square = (half: number): PieceDef['outer'] => [
  { x: -half, y: -half },
  { x: half, y: -half },
  { x: half, y: half },
  { x: -half, y: half },
]

// A 2×2" block centred at (10, 10).
const block: WorldPiece = resolvePiece(
  { id: 'block', name: 'Block', kind: 'ruin', outer: square(1) },
  { pieceId: 'block', x: 10, y: 10, rotationDeg: 0 },
)

// A stronghold at (20, 10): 4×4 outer, 3×3 inner floor (0.5" wall ring).
const stronghold: WorldPiece = resolvePiece(
  { id: 'sh', name: 'Stronghold', kind: 'stronghold', outer: square(2), innerFloor: square(1.5) },
  { pieceId: 'sh', x: 20, y: 10, rotationDeg: 0 },
)

const map = { widthIn: 30, heightIn: 22 }
const pieces = [block, stronghold]

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

describe('markerPlacementClear', () => {
  it('rejects markers overlapping terrain', () => {
    expect(markerPlacementClear({ x: 10, y: 10 }, pieces, 30, 22)).toBe(false)
    expect(markerPlacementClear({ x: 11.2, y: 10 }, pieces, 30, 22)).toBe(false) // edge within 10mm
  })

  it('accepts markers clear of terrain', () => {
    expect(markerPlacementClear({ x: 12, y: 10 }, pieces, 30, 22)).toBe(true)
  })

  it('rejects markers not wholly within the killzone', () => {
    expect(markerPlacementClear({ x: 0.1, y: 10 }, pieces, 30, 22)).toBe(false)
    expect(markerPlacementClear({ x: MARKER_RADIUS_IN + 0.01, y: 10 }, pieces, 30, 22)).toBe(true)
  })

  it('allows markers wholly inside a stronghold inner floor, but not on the wall ring', () => {
    expect(markerPlacementClear({ x: 20, y: 10 }, pieces, 30, 22)).toBe(true) // centre of floor
    expect(markerPlacementClear({ x: 21.7, y: 10 }, pieces, 30, 22)).toBe(false) // on the wall
  })
})

describe('chainViolations', () => {
  const legal: Chain = [
    { x: 0.5, y: 11 },
    { x: 5, y: 11 },
    { x: 9, y: 13 },
    { x: 13, y: 14 },
    { x: 17, y: 14 },
  ]

  it('returns no violations for a legal chain', () => {
    expect(chainViolations(legal, pieces, map, dz)).toEqual([])
  })

  it('flags a marker 0 outside the drop zone', () => {
    const chain = legal.map((m, i) => (i === 0 ? { x: 8, y: 11 } : m))
    const v = chainViolations(chain, pieces, map, dz)
    expect(v.some((x) => x.marker === 0 && x.message.includes('drop zone'))).toBe(true)
  })

  it('flags links longer than 5" (edge-to-edge)', () => {
    const chain = legal.map((m, i) => (i === 4 ? { x: 25, y: 14 } : m))
    const v = chainViolations(chain, pieces, map, dz)
    expect(v.some((x) => x.marker === 4 && x.message.includes('apart'))).toBe(true)
  })

  it('allows exactly-5"-gap links (centre-to-centre 5")', () => {
    const gap = 5
    const chain: Chain = [
      { x: 0.5, y: 0.5 },
      { x: 0.5 + 1 * gap, y: 0.5 },
      { x: 0.5 + 2 * gap, y: 0.5 },
      { x: 0.5 + 3 * gap, y: 0.5 },
      { x: 0.5 + 4 * gap, y: 0.5 },
    ]
    const v = chainViolations(chain, pieces, map, dz)
    expect(v.filter((x) => x.message.includes('apart'))).toEqual([])
  })

  it('names the terrain piece a marker overlaps', () => {
    const chain = legal.map((m, i) => (i === 2 ? { x: 10, y: 10 } : m))
    const v = chainViolations(chain, pieces, map, dz)
    expect(v.some((x) => x.marker === 2 && x.message.includes('Block'))).toBe(true)
  })
})
