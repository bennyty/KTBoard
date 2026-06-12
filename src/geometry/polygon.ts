import type { Polygon, Vec, PiecePlacement, PieceDef, WorldPiece } from '@/model/types'
import { add, distPointSegment, rotateDeg, sub } from './vec'

/** Ray-cast point-in-polygon (boundary counts as inside-ish; fine for our tolerances). */
export function pointInPolygon(p: Vec, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Min distance from point to polygon boundary. */
export function distPointPolygonBoundary(p: Vec, poly: Polygon): number {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distPointSegment(p, poly[j], poly[i])
    if (d < best) best = d
  }
  return best
}

/** Distance from point to polygon region (0 if inside). */
export function distPointPolygon(p: Vec, poly: Polygon): number {
  return pointInPolygon(p, poly) ? 0 : distPointPolygonBoundary(p, poly)
}

function orient(a: Vec, b: Vec, c: Vec): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: Vec, b: Vec, p: Vec): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  )
}

export function segmentsIntersect(p1: Vec, p2: Vec, q1: Vec, q2: Vec): boolean {
  const o1 = orient(p1, p2, q1)
  const o2 = orient(p1, p2, q2)
  const o3 = orient(q1, q2, p1)
  const o4 = orient(q1, q2, p2)
  if (o1 * o2 < 0 && o3 * o4 < 0) return true
  if (o1 === 0 && onSegment(p1, p2, q1)) return true
  if (o2 === 0 && onSegment(p1, p2, q2)) return true
  if (o3 === 0 && onSegment(q1, q2, p1)) return true
  if (o4 === 0 && onSegment(q1, q2, p2)) return true
  return false
}

/** True if segment ab crosses or lies inside the polygon region. */
export function segmentIntersectsPolygon(a: Vec, b: Vec, poly: Polygon): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segmentsIntersect(a, b, poly[j], poly[i])) return true
  }
  return pointInPolygon(a, poly) || pointInPolygon(b, poly)
}

/** True if the disk (c, r) overlaps the polygon region. */
export function circleIntersectsPolygon(c: Vec, r: number, poly: Polygon): boolean {
  if (pointInPolygon(c, poly)) return true
  return distPointPolygonBoundary(c, poly) <= r
}

/** True if the disk (c, r) lies wholly inside the polygon region. */
export function circleInsidePolygon(c: Vec, r: number, poly: Polygon): boolean {
  if (!pointInPolygon(c, poly)) return false
  return distPointPolygonBoundary(c, poly) >= r
}

export function polygonCentroid(poly: Polygon): Vec {
  // Bbox center — used as a stable rotation pivot, not a true centroid.
  const b = polygonBBox(poly)
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

export function polygonBBox(poly: Polygon) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export function transformPolygon(poly: Polygon, placement: PiecePlacement): Polygon {
  const origin = { x: placement.x, y: placement.y }
  return poly.map((p) => add(rotateDeg(p, placement.rotationDeg), origin))
}

/** Resolve a placed piece to world inches with a precomputed bbox. */
export function resolvePiece(def: PieceDef, placement: PiecePlacement): WorldPiece {
  const outer = transformPolygon(def.outer, placement)
  return {
    pieceId: def.id,
    name: def.name,
    kind: def.kind,
    outer,
    innerFloor: def.innerFloor ? transformPolygon(def.innerFloor, placement) : undefined,
    bbox: polygonBBox(outer),
  }
}

/** Cheap bbox rejection: can the disk (c, r) possibly touch the piece? */
export function circleNearBBox(c: Vec, r: number, bbox: WorldPiece['bbox']): boolean {
  return (
    c.x + r >= bbox.minX && c.x - r <= bbox.maxX && c.y + r >= bbox.minY && c.y - r <= bbox.maxY
  )
}

/** Cheap bbox rejection for a segment. */
export function segmentNearBBox(a: Vec, b: Vec, bbox: WorldPiece['bbox']): boolean {
  return (
    Math.max(a.x, b.x) >= bbox.minX &&
    Math.min(a.x, b.x) <= bbox.maxX &&
    Math.max(a.y, b.y) >= bbox.minY &&
    Math.min(a.y, b.y) <= bbox.maxY
  )
}

export function polygonToLocal(poly: Polygon, pivot: Vec): Polygon {
  return poly.map((p) => sub(p, pivot))
}
