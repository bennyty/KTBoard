import type { PieceDef, Vec } from '@/model/types'
import { GRIDS, TW_PILLAR_SIZE_IN, WALL_LENGTH_IN, WALL_THICKNESS_IN } from '@/model/constants'

export interface Grid {
  offsetIn: number
  stepIn: number
}

/** The grid lattice for a killzone, or undefined if it has no grid. */
export function gridFor(killzone: string): Grid | undefined {
  return GRIDS[killzone]
}

/** The snap lattice is the half-grid: half of the visible grid step. */
function fineStep(grid: Grid): number {
  return grid.stepIn / 2
}

function snapAxis(v: number, grid: Grid): number {
  const half = fineStep(grid)
  return grid.offsetIn + Math.round((v - grid.offsetIn) / half) * half
}

/** Nearest fine-lattice intersection to an arbitrary point. */
export function snapToFineIntersection(p: Vec, grid: Grid): Vec {
  return { x: snapAxis(p.x, grid), y: snapAxis(p.y, grid) }
}

/** Pillar centre = nearest fine intersection. */
export function snapPillar(cursor: Vec, grid: Grid): Vec {
  return snapToFineIntersection(cursor, grid)
}

/** Wall centre = nearest fine intersection; orientation from whichever fine line
 *  (vertical or horizontal) the cursor is nearer to. A wall on a vertical line
 *  runs vertically (rotationDeg 90); the canonical def lies along local +x. */
export function snapWall(cursor: Vec, grid: Grid): { center: Vec; rotationDeg: 0 | 90 } {
  const center = snapToFineIntersection(cursor, grid)
  const dxToVerticalLine = Math.abs(cursor.x - center.x)
  const dyToHorizontalLine = Math.abs(cursor.y - center.y)
  const rotationDeg = dxToVerticalLine <= dyToHorizontalLine ? 90 : 0
  return { center, rotationDeg }
}

export const WALL_DEF_ID = 'tw-wall'
export const PILLAR_DEF_ID = 'tw-pillar'

/** Canonical wall/pillar defs, built from the named constants so a single edit
 *  reshapes every placed instance. Mirrors the committed entries in
 *  tombworld-catalogue.json; seeded into catalogues that lack them. */
export function makeWallDef(): PieceDef {
  const hl = WALL_LENGTH_IN / 2
  const ht = WALL_THICKNESS_IN / 2
  return {
    id: WALL_DEF_ID,
    name: 'Wall',
    kind: 'wall',
    outer: [
      { x: -hl, y: -ht },
      { x: hl, y: -ht },
      { x: hl, y: ht },
      { x: -hl, y: ht },
    ],
  }
}

export function makePillarDef(): PieceDef {
  const h = TW_PILLAR_SIZE_IN / 2
  return {
    id: PILLAR_DEF_ID,
    name: 'Pillar',
    kind: 'pillar',
    outer: [
      { x: -h, y: -h },
      { x: h, y: -h },
      { x: h, y: h },
      { x: -h, y: h },
    ],
  }
}
