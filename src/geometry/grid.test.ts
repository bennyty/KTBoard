import { describe, expect, it } from 'vitest'
import { gridFor, snapPillar, snapToFineIntersection, snapWall } from './grid'

describe('grid snap', () => {
  const grid = gridFor('tombworld')!
  // offset 0.5, step 3.8125 → fine step 1.90625
  const fine = grid.stepIn / 2

  it('exposes a grid for grid-bearing killzones only', () => {
    expect(gridFor('tombworld')).toBeDefined()
    expect(gridFor('gallowdark')).toBeDefined()
    expect(gridFor('volkus')).toBeUndefined()
  })

  it('snaps to the nearest fine intersection', () => {
    expect(snapToFineIntersection({ x: 0.6, y: 0.45 }, grid)).toEqual({ x: 0.5, y: 0.5 })
    // one fine step from the origin offset
    const p = snapToFineIntersection({ x: 0.5 + fine + 0.1, y: 0.5 + 0.2 }, grid)
    expect(p.x).toBeCloseTo(0.5 + fine, 9)
    expect(p.y).toBeCloseTo(0.5, 9)
  })

  it('reaches half-offset intersections (between normal grid points)', () => {
    // halfway between normal intersections lands on an odd fine index
    const p = snapPillar({ x: 0.5 + fine, y: 0.5 + 3 * fine }, grid)
    expect(p.x).toBeCloseTo(0.5 + fine, 9)
    expect(p.y).toBeCloseTo(0.5 + 3 * fine, 9)
  })

  it('orients a wall from the nearer fine line', () => {
    const node = { x: 0.5 + 2 * fine, y: 0.5 + 2 * fine }
    // cursor hugging a vertical line (small x offset, large y offset) → vertical wall (90°)
    expect(snapWall({ x: node.x + 0.05, y: node.y + 0.4 }, grid).rotationDeg).toBe(90)
    // cursor hugging a horizontal line (small y offset, large x offset) → horizontal wall (0°)
    expect(snapWall({ x: node.x + 0.4, y: node.y + 0.05 }, grid).rotationDeg).toBe(0)
  })

  it('centres a wall on the nearest fine intersection', () => {
    const { center } = snapWall({ x: 0.5 + 0.3, y: 0.5 + fine + 0.2 }, grid)
    expect(center.x).toBeCloseTo(0.5, 9)
    expect(center.y).toBeCloseTo(0.5 + fine, 9)
  })
})
