import type { AnnotatedMap, Chain, DropZone, Objective, Scores, Vec, WorldPiece } from '@/model/types'
import {
  BASE_RADIUS_IN,
  CONTROL_CENTER_TO_CENTER_IN,
  COVERAGE_DISK_RADIUS_IN,
  COVERAGE_RANGE_IN,
  MARKER_RADIUS_IN,
  OBJ_DISTANCE_SIGMOID_K,
  OBJ_DISTANCE_SIGMOID_MID,
} from '@/model/constants'
import { dist, normalize, scale, sub, add } from '@/geometry/vec'
import { segmentIntersectsPolygon, segmentNearBBox, distPointPolygon } from '@/geometry/polygon'
import { circlePlacementClear, distToTunnel } from '@/rules/tunnel'

/** Skeleton sampling step (in) for unburrow-placement searches. */
const SKELETON_STEP_IN = 0.35
/** Angular fallbacks (deg) when the direct toward-objective placement is blocked. */
const ANGLE_FALLBACKS_DEG = [0, 20, -20, 45, -45, 75, -75, 105, -105, 150, -150, 180]
/** Boundary samples for the coverage disk. */
const COVERAGE_SAMPLES = 24

export interface ScoringContext {
  map: AnnotatedMap
  pieces: WorldPiece[]
  dropZone: DropZone
  centerObjective: Objective | undefined
  homeObjective: Objective | undefined
}

/** The home objective is the objective in or nearest the player's drop zone. */
export function deriveHomeObjective(map: AnnotatedMap, dropZone: DropZone): Objective | undefined {
  let best: Objective | undefined
  let bestD = Infinity
  for (const o of map.objectives) {
    const d = distPointPolygon(o.center, dropZone.polygon)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

export function makeScoringContext(map: AnnotatedMap, pieces: WorldPiece[], dropZone: DropZone): ScoringContext {
  return {
    map,
    pieces,
    dropZone,
    centerObjective: map.objectives.find((o) => o.role === 'center'),
    homeObjective: deriveHomeObjective(map, dropZone),
  }
}

/** Zigzag: count of distinct pieces whose footprint is crossed by ≥1 between-segment. */
export function zigzag(chain: Chain, pieces: WorldPiece[]): number {
  let count = 0
  for (const piece of pieces) {
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1]
      const b = chain[i]
      if (!segmentNearBBox(a, b, piece.bbox)) continue
      if (segmentIntersectsPolygon(a, b, piece.outer)) {
        count++
        break
      }
    }
  }
  return count
}

/**
 * For each skeleton sample point along the partial TUNNEL, find the valid
 * 40mm-base centre nearest `target` that still touches the TUNNEL, and yield
 * the running minimum distance after each marker prefix completes.
 *
 * The base centre may sit anywhere with distToTunnel ≤ BASE_RADIUS; we search
 * from each skeleton point outward toward the target, falling back to rotated
 * directions when terrain or the killzone edge blocks the direct line.
 */
function unburrowDistancesByPrefix(chain: Chain, target: Vec, ctx: ScoringContext): number[] {
  const reach = MARKER_RADIUS_IN + BASE_RADIUS_IN
  const { pieces, map } = ctx
  const result: number[] = []
  let runningMin = Infinity

  const tryPoint = (s: Vec) => {
    const toTarget = sub(target, s)
    const dTarget = dist(s, target)
    const dir = dTarget === 0 ? { x: 1, y: 0 } : normalize(toTarget)
    const offset = Math.min(reach, dTarget)
    for (const angle of ANGLE_FALLBACKS_DEG) {
      const r = (angle * Math.PI) / 180
      const c = Math.cos(r)
      const sn = Math.sin(r)
      const d = { x: dir.x * c - dir.y * sn, y: dir.x * sn + dir.y * c }
      const candidate = add(s, scale(d, offset))
      if (!circlePlacementClear(candidate, BASE_RADIUS_IN, pieces, map.widthIn, map.heightIn)) continue
      const cd = dist(candidate, target)
      if (cd < runningMin) runningMin = cd
      // Directions are ordered by closeness to the target; later angles can
      // only be farther from it, so stop at the first valid placement.
      break
    }
    // Base centred on the skeleton point itself (always touches the TUNNEL).
    if (circlePlacementClear(s, BASE_RADIUS_IN, pieces, map.widthIn, map.heightIn)) {
      const cd = dist(s, target)
      if (cd < runningMin) runningMin = cd
    }
  }

  tryPoint(chain[0])
  result.push(runningMin)

  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1]
    const b = chain[i]
    const segLen = dist(a, b)
    const steps = Math.max(1, Math.ceil(segLen / SKELETON_STEP_IN))
    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      tryPoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
    result.push(runningMin)
  }

  return result
}

/** Center objective access: smallest N (0–4) whose partial TUNNEL admits a valid
 *  base placement within control range of the center objective; 5 if never. */
export function centerObjectiveAccess(chain: Chain, ctx: ScoringContext): number {
  if (!ctx.centerObjective) return chain.length
  const byPrefix = unburrowDistancesByPrefix(chain, ctx.centerObjective.center, ctx)
  for (let n = 0; n < byPrefix.length; n++) {
    if (byPrefix[n] <= CONTROL_CENTER_TO_CENTER_IN + 1e-9) return n
  }
  return chain.length
}

/** Home objective unburrow: min distance from home objective centre to a valid
 *  base centre on the full TUNNEL. */
export function homeObjectiveUnburrow(chain: Chain, ctx: ScoringContext): number {
  if (!ctx.homeObjective) return Infinity
  const byPrefix = unburrowDistancesByPrefix(chain, ctx.homeObjective.center, ctx)
  return byPrefix[byPrefix.length - 1]
}

/** Objective coverage: objectives whose control-range disk lies wholly within
 *  COVERAGE_RANGE of the TUNNEL. Sampled on the disk boundary + centre (the
 *  distance field is 1-Lipschitz, so boundary sampling is a tight check). */
export function objectiveCoverage(chain: Chain, map: AnnotatedMap): number {
  let covered = 0
  for (const o of map.objectives) {
    if (distToTunnel(o.center, chain) > COVERAGE_RANGE_IN) continue
    let ok = true
    for (let k = 0; k < COVERAGE_SAMPLES; k++) {
      const a = (2 * Math.PI * k) / COVERAGE_SAMPLES
      const p = {
        x: o.center.x + COVERAGE_DISK_RADIUS_IN * Math.cos(a),
        y: o.center.y + COVERAGE_DISK_RADIUS_IN * Math.sin(a),
      }
      if (distToTunnel(p, chain) > COVERAGE_RANGE_IN) {
        ok = false
        break
      }
    }
    if (ok) covered++
  }
  return covered
}

/** Logistic proximity score for a single objective at TUNNEL distance `d` (in). */
export function objectiveProximity(d: number): number {
  return 1 / (1 + Math.exp(OBJ_DISTANCE_SIGMOID_K * (d - OBJ_DISTANCE_SIGMOID_MID)))
}

/**
 * Objective distance: sum over all objectives of a sigmoid proximity score of
 * the TUNNEL to the objective centre. Unlike coverage (binary, all-or-nothing),
 * this rewards getting close even when full coverage is impossible. The sigmoid
 * is calibrated against the objective centre, so a TUNNEL within control range
 * still scores ≈0.9.
 */
export function objectiveDistance(chain: Chain, map: AnnotatedMap): number {
  let total = 0
  for (const o of map.objectives) {
    total += objectiveProximity(distToTunnel(o.center, chain))
  }
  return total
}

/** Forward reach: max perpendicular distance from the anchor edge to any marker. */
export function forwardReach(chain: Chain, ctx: ScoringContext): number {
  const { anchorEdge } = ctx.dropZone
  const { widthIn, heightIn } = ctx.map
  let best = 0
  for (const m of chain) {
    const d =
      anchorEdge === 'left' ? m.x : anchorEdge === 'right' ? widthIn - m.x : anchorEdge === 'top' ? m.y : heightIn - m.y
    if (d > best) best = d
  }
  return best
}

export function scoreChain(chain: Chain, ctx: ScoringContext): Scores {
  return {
    objectiveDistance: objectiveDistance(chain, ctx.map),
    zigzag: zigzag(chain, ctx.pieces),
    centerAccess: centerObjectiveAccess(chain, ctx),
    coverage: objectiveCoverage(chain, ctx.map),
    homeUnburrow: homeObjectiveUnburrow(chain, ctx),
    forwardReach: forwardReach(chain, ctx),
  }
}

/** Scores as a maximize-everything vector for Pareto dominance. */
export function toDominanceVector(s: Scores): number[] {
  return [s.objectiveDistance, s.zigzag, -s.centerAccess, s.coverage, -s.homeUnburrow, s.forwardReach]
}
