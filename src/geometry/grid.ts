import type { PieceDef, Vec } from '@/model/types'
import {
  GRIDS,
  TW_PILLAR_SIZE_IN,
  WALL_LENGTH_IN,
  TW_WALL_THICKNESS_IN,
  GD_PILLAR_SIZE_IN,
  GD_WALL_THICKNESS_IN,
  IN_PER_MM,
} from '@/model/constants'

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

export const WALL_DEF_ID = '-wall'
export const PILLAR_DEF_ID = '-pillar'

/** id of a "wall with accessible terrain" def for a given door-gap width; a
 *  killzone may have several (Tomb World's kit has two distinct widths). */
export function wallAccessDefId(killzone: string, widthMm: number): string {
  return `${killzone}-wall-access-${widthMm}`
}

/** Canonical wall/pillar defs, built from the named constants so a single edit
 *  reshapes every placed instance. Mirrors the committed entries in
 *  tombworld-catalogue.json; seeded into catalogues that lack them. */
export function makeWallDef(killzone: string): PieceDef {
  const hl = WALL_LENGTH_IN / 2
  const ht = (killzone === 'gallowdark' ? GD_WALL_THICKNESS_IN : TW_WALL_THICKNESS_IN) / 2
  return {
    id: killzone + WALL_DEF_ID,
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

/** A wall with a pre-measured access point (door gap) already marked as
 *  Accessible terrain, centred along its length. Same footprint as the plain
 *  wall; only the Accessible sub-region differs. `widthMm` selects which of
 *  the killzone's named door-gap widths (see WALL_ACCESS_WIDTHS_MM) this
 *  instance carries. */
export function makeWallAccessDef(killzone: string, widthMm: number): PieceDef {
  const wall = makeWallDef(killzone)
  const ht = (killzone === 'gallowdark' ? GD_WALL_THICKNESS_IN : TW_WALL_THICKNESS_IN) / 2
  const hw = (widthMm * IN_PER_MM) / 2
  return {
    id: wallAccessDefId(killzone, widthMm),
    name: `Wall (accessible, ${widthMm}mm)`,
    kind: 'wall',
    outer: wall.outer,
    accessible: [
      [
        { x: -hw, y: -ht },
        { x: hw, y: -ht },
        { x: hw, y: ht },
        { x: -hw, y: ht },
      ],
    ],
  }
}

export function makePillarDef(killzone: string): PieceDef {
  const h = (killzone === 'gallowdark' ? GD_PILLAR_SIZE_IN : TW_PILLAR_SIZE_IN) / 2
  return {
    id: killzone + PILLAR_DEF_ID,
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
