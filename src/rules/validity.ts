import type { AnnotatedMap, Chain, DropZone, Vec, WorldPiece } from '@/model/types'
import { MARKER_RADIUS_IN, MAX_LINK_CENTER_TO_CENTER_IN } from '@/model/constants'
import { dist } from '@/geometry/vec'
import { circleInsidePolygon, circleNearBBox, distPointPolygonBoundary, pointInPolygon } from '@/geometry/polygon'

export interface Violation {
  /** Marker index the violation attaches to; chain-level link violations attach to the later marker. */
  marker: number
  message: string
}

/** Fast boolean check used by the generator's rejection loop. */
export function markerPlacementClear(c: Vec, pieces: WorldPiece[], widthIn: number, heightIn: number): boolean {
  const r = MARKER_RADIUS_IN
  if (c.x < r || c.y < r || c.x > widthIn - r || c.y > heightIn - r) return false
  for (const piece of pieces) {
    if (!circleNearBBox(c, r, piece.bbox)) continue
    const touchesOuter = pointInPolygon(c, piece.outer) || distPointPolygonBoundary(c, piece.outer) < r
    if (!touchesOuter) continue
    if (piece.innerFloor && circleInsidePolygon(c, r, piece.innerFloor)) continue
    return false
  }
  return true
}

/**
 * Full chain validity with human-readable violations (warn-but-allow UX).
 * Markers may overlap each other; they may never overlap terrain.
 */
export function chainViolations(
  chain: Chain,
  pieces: WorldPiece[],
  map: Pick<AnnotatedMap, 'widthIn' | 'heightIn'>,
  dropZone: DropZone,
): Violation[] {
  const out: Violation[] = []
  const r = MARKER_RADIUS_IN

  chain.forEach((c, i) => {
    if (c.x < r || c.y < r || c.x > map.widthIn - r || c.y > map.heightIn - r) {
      out.push({ marker: i, message: `Marker ${i} is not wholly within the killzone` })
    }
    for (const piece of pieces) {
      if (!circleNearBBox(c, r, piece.bbox)) continue
      const touchesOuter = pointInPolygon(c, piece.outer) || distPointPolygonBoundary(c, piece.outer) < r
      if (!touchesOuter) continue
      if (piece.innerFloor && circleInsidePolygon(c, r, piece.innerFloor)) continue
      out.push({ marker: i, message: `Marker ${i} overlaps ${piece.name}` })
    }
  })

  // Tolerance: generated marker-0 candidates sit exactly 10mm inside the
  // anchor edge, i.e. exactly touching the drop zone boundary.
  if (!circleInsidePolygon(chain[0], r - 1e-6, dropZone.polygon)) {
    out.push({ marker: 0, message: `Marker 0 is not wholly within drop zone ${dropZone.name}` })
  }

  for (let i = 1; i < chain.length; i++) {
    if (dist(chain[i - 1], chain[i]) > MAX_LINK_CENTER_TO_CENTER_IN + 1e-9) {
      out.push({
        marker: i,
        message: `Markers ${i - 1}–${i} are more than ${MAX_LINK_CENTER_TO_CENTER_IN}" apart`,
      })
    }
  }

  return out
}
