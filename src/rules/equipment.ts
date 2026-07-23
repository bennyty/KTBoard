import type { Objective, Polygon, RectObject, SlideObject } from '@/model/types'
import {
  EQUIPMENT_SPACING_IN,
  IN_PER_MM,
  LADDER_ACCESSIBLE_SPACING_IN,
  MINES_OBJECTIVE_SPACING_IN,
  OBJECTIVE_RADIUS_IN,
  RECT_PRESETS,
} from '@/model/constants'
import { add, rotateDeg } from '@/geometry/vec'
import { distPointPolygon, polygonPolygonDistance } from '@/geometry/polygon'

/** The named Rectangle preset a rect Object matches, if any. Dimensions are the
 *  identity: a rect whose length/width equal a preset's footprint is that piece. */
function matchedPreset(o: RectObject) {
  return RECT_PRESETS.find((p) => p.lengthMm === o.lengthMm && p.widthMm === o.widthMm)
}

/** Rectangle Objects whose dimensions match a named preset are "Equipment" —
 *  real in-game terrain features subject to placement-spacing rules (as opposed
 *  to a plain drawn rectangle). */
export function isEquipment(o: SlideObject): o is RectObject {
  return o.kind === 'rect' && !!matchedPreset(o)
}

/** Name of the Equipment preset an Object matches, or null if it isn't equipment. */
export function equipmentName(o: SlideObject): string | null {
  return isEquipment(o) ? matchedPreset(o)!.name : null
}

/** The four corners of a Rectangle Object in world (killzone-inch) coordinates.
 *  `lengthMm` runs along the local x-axis, `widthMm` along the local y-axis. */
export function rectCorners(o: RectObject): Polygon {
  const l = (o.lengthMm * IN_PER_MM) / 2
  const w = (o.widthMm * IN_PER_MM) / 2
  const c = { x: o.x, y: o.y }
  return [
    { x: -l, y: -w },
    { x: l, y: -w },
    { x: l, y: w },
    { x: -l, y: w },
  ].map((p) => add(rotateDeg(p, o.rotationDeg), c))
}

/** Ids of Equipment Objects placed illegally close to other equipment, Accessible
 *  terrain (which includes access points and doors), or — for Mines — an Objective.
 *  Objects absent from the set are legal. Rules vary by preset:
 *    - Equipment ↔ equipment: 2" clearance, but Mines are exempt (they are markers,
 *      not terrain features, so they neither constrain nor are constrained here).
 *    - Accessible terrain: 2" clearance for everything, except Ladders at 1".
 *    - Objectives: Mines only, 2" from the marker's edge.
 *  Regions are polygons in world inches (WorldPiece.accessible); objectives carry
 *  a centre and the standard marker radius. */
export function equipmentViolations(
  objects: SlideObject[],
  accessibleRegions: Polygon[] = [],
  objectives: Objective[] = [],
): Set<string> {
  const items = objects.filter(isEquipment).map((o) => ({
    o,
    corners: rectCorners(o),
    name: matchedPreset(o)!.name,
  }))
  const flagged = new Set<string>()

  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const aIsMines = a.name === 'Mines'

    // Equipment ↔ equipment spacing (2"), with Mines exempt on both sides.
    if (!aIsMines) {
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j]
        if (b.name === 'Mines') continue
        if (polygonPolygonDistance(a.corners, b.corners) <= EQUIPMENT_SPACING_IN) {
          flagged.add(a.o.id)
          flagged.add(b.o.id)
        }
      }
    }

    // Accessible-terrain spacing: 1" for Ladders, 2" for everything else.
    const accessibleLimit = a.name === 'Ladder' ? LADDER_ACCESSIBLE_SPACING_IN : EQUIPMENT_SPACING_IN
    for (const region of accessibleRegions) {
      if (region.length >= 3 && polygonPolygonDistance(a.corners, region) <= accessibleLimit) {
        flagged.add(a.o.id)
        break
      }
    }

    // Mines must clear the edge of every Objective marker by more than 2".
    if (aIsMines) {
      for (const obj of objectives) {
        const edgeGap = distPointPolygon(obj.center, a.corners) - OBJECTIVE_RADIUS_IN
        if (edgeGap <= MINES_OBJECTIVE_SPACING_IN) {
          flagged.add(a.o.id)
          break
        }
      }
    }
  }
  return flagged
}
