import type { AnchorEdge, Chain, Vec, WorldPiece } from '@/model/types'
import { BASE_RADIUS_IN, MARKER0_EDGE_INSET_IN, MARKER_RADIUS_IN } from '@/model/constants'
import { dist, distPointSegment } from '@/geometry/vec'
import { circleInsidePolygon, circleNearBBox, distPointPolygonBoundary, pointInPolygon } from '@/geometry/polygon'

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * Marker 0 is the tunnel entrance: it must sit on the drop zone's anchor edge,
 * 10mm inside the board (matching where the generator samples it). Dragging it
 * slides it along that edge rather than freely across the board.
 */
export function constrainMarker0(p: Vec, anchorEdge: AnchorEdge, widthIn: number, heightIn: number): Vec {
  const inset = MARKER0_EDGE_INSET_IN
  switch (anchorEdge) {
    case 'left':
      return { x: inset, y: clamp(p.y, 0, heightIn) }
    case 'right':
      return { x: widthIn - inset, y: clamp(p.y, 0, heightIn) }
    case 'top':
      return { x: clamp(p.x, 0, widthIn), y: inset }
    case 'bottom':
      return { x: clamp(p.x, 0, widthIn), y: heightIn - inset }
    default:
      throw new Error(`Unknown anchor edge ${anchorEdge}`)
  }
}

/**
 * Distance from a point to the TUNNEL region formed by markers 0..uptoMarker.
 * The TUNNEL is the union of 20mm-wide capsules between sequential markers
 * (which subsumes the marker disks themselves). 0 if inside.
 */
export function distToTunnel(p: Vec, chain: Chain, uptoMarker: number = chain.length - 1): number {
  let best = dist(p, chain[0])
  for (let i = 1; i <= uptoMarker; i++) {
    const d = distPointSegment(p, chain[i - 1], chain[i])
    if (d < best) best = d
  }
  return Math.max(0, best - MARKER_RADIUS_IN)
}

/**
 * Can a circular base of radius r be centred at c?
 * Wholly within the killzone, not overlapping blocked terrain.
 * A stronghold blocks only its wall ring: overlap with the outer extent is
 * fine if the circle sits wholly inside the inner floor.
 */
export function circlePlacementClear(
  c: Vec,
  r: number,
  pieces: WorldPiece[],
  widthIn: number,
  heightIn: number,
): boolean {
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
 * A valid unburrow placement: 40mm base touches the (partial) TUNNEL,
 * doesn't overlap terrain, wholly within the killzone.
 */
export function baseTouchesTunnel(c: Vec, chain: Chain, uptoMarker: number): boolean {
  return distToTunnel(c, chain, uptoMarker) <= BASE_RADIUS_IN + 1e-9
}
