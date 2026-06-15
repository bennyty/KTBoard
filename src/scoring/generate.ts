import type { AnnotatedMap, Chain, KillzoneCatalogue, Scores, ScoredPlan, Vec, WorldPiece } from '@/model/types'
import { SCORE_AXES } from '@/model/types'
import {
  CHAIN_LENGTH,
  MARKER0_EDGE_INSET_IN,
  MAX_LINK_CENTER_TO_CENTER_IN,
  MIN_LINK_CENTER_TO_CENTER_IN,
} from '@/model/constants'
import { resolvePiece, pointInPolygon } from '@/geometry/polygon'
import { markerPlacementClear } from '@/rules/validity'
import { makeScoringContext, scoreChain, toDominanceVector } from './score'
import { ParetoFront } from './pareto'
import { kMedoids } from './kmedoids'
import { hashString, mulberry32 } from './rng'

export const PRESENTED_PLANS = 20
export const DEFAULT_ATTEMPTS = 500_000

export interface GenerateProgress {
  attempted: number
  totalAttempts: number
  valid: number
  frontSize: number
}

export interface GenerateResult {
  plans: ScoredPlan[]
  attempted: number
  valid: number
  frontSize: number
}

export function resolveMapPieces(map: AnnotatedMap, catalogue: KillzoneCatalogue): WorldPiece[] {
  const defs = new Map(catalogue.pieces.map((p) => [p.id, p]))
  return map.placements.flatMap((pl) => {
    const def = defs.get(pl.pieceId)
    return def ? [resolvePiece(def, pl)] : []
  })
}

/** Sample marker 0 on the 1D strip 10mm inside the anchor edge, within the drop zone polygon. */
function sampleMarker0(
  rng: () => number,
  map: AnnotatedMap,
  dropZone: { polygon: Vec[]; anchorEdge: string },
): Vec | null {
  const inset = MARKER0_EDGE_INSET_IN
  for (let tries = 0; tries < 20; tries++) {
    let p: Vec
    switch (dropZone.anchorEdge) {
      case 'left':
        p = { x: inset, y: rng() * map.heightIn }
        break
      case 'right':
        p = { x: map.widthIn - inset, y: rng() * map.heightIn }
        break
      case 'top':
        p = { x: rng() * map.widthIn, y: inset }
        break
      default:
        p = { x: rng() * map.widthIn, y: map.heightIn - inset }
    }
    if (pointInPolygon(p, dropZone.polygon)) return p
  }
  return null
}

/**
 * Rejection-sample five-marker chains, score the survivors, keep the Pareto
 * front, then k-medoid-sample PRESENTED_PLANS diverse representatives.
 * Deterministic for a given (map, drop zone, seed).
 */
export function generatePlans(
  map: AnnotatedMap,
  catalogue: KillzoneCatalogue,
  dropZoneId: string,
  attempts: number = DEFAULT_ATTEMPTS,
  seed?: number,
  onProgress?: (p: GenerateProgress) => void,
): GenerateResult {
  const dropZone = map.dropZones.find((d) => d.id === dropZoneId)
  if (!dropZone) throw new Error(`Unknown drop zone: ${dropZoneId}`)
  const pieces = resolveMapPieces(map, catalogue)
  const ctx = makeScoringContext(map, pieces, dropZone)
  const rng = mulberry32(seed ?? hashString(`${map.id}/${dropZoneId}`))
  const front = new ParetoFront<{ chain: Chain; scores: Scores }>()

  let valid = 0
  const progressEvery = Math.max(1, Math.floor(attempts / 100))

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (onProgress && attempt % progressEvery === 0) {
      onProgress({ attempted: attempt, totalAttempts: attempts, valid, frontSize: front.size })
    }

    const m0 = sampleMarker0(rng, map, dropZone)
    if (!m0 || !markerPlacementClear(m0, pieces, map.widthIn, map.heightIn)) continue

    const chain: Chain = [m0]
    let dead = false
    for (let i = 1; i < CHAIN_LENGTH; i++) {
      // Area-uniform sample of the annulus around the previous marker whose
      // edge-to-edge gap is within [MIN_LINK_GAP_IN, MAX_LINK_GAP_IN], so every
      // link pushes forward instead of clustering near the previous marker.
      const angle = rng() * 2 * Math.PI
      const rMin2 = MIN_LINK_CENTER_TO_CENTER_IN * MIN_LINK_CENTER_TO_CENTER_IN
      const rMax2 = MAX_LINK_CENTER_TO_CENTER_IN * MAX_LINK_CENTER_TO_CENTER_IN
      const radius = Math.sqrt(rMin2 + rng() * (rMax2 - rMin2))
      const prev = chain[i - 1]
      const next = { x: prev.x + radius * Math.cos(angle), y: prev.y + radius * Math.sin(angle) }
      if (!markerPlacementClear(next, pieces, map.widthIn, map.heightIn)) {
        dead = true
        break
      }
      chain.push(next)
    }
    if (dead) continue

    valid++
    const scores = scoreChain(chain, ctx)
    front.offer(toDominanceVector(scores), { chain, scores })
  }

  const entries = front.entries
  const picks = kMedoids(
    entries.map((e) => e.vector),
    PRESENTED_PLANS,
    rng,
  )

  const chosen = picks.map((i) => entries[i].item)
  const plans: ScoredPlan[] = chosen.map(({ chain, scores }) => ({
    mapId: map.id,
    dropZoneId,
    markers: chain,
    scores,
    wins: winningAxes(scores, chosen.map((c) => c.scores)),
  }))

  onProgress?.({ attempted: attempts, totalAttempts: attempts, valid, frontSize: front.size })
  return { plans, attempted: attempts, valid, frontSize: front.size }
}

/** Axes on which `s` is (tied-)best among `all` — the "why is this plan shown" labels. */
export function winningAxes(s: Scores, all: Scores[]): (keyof Scores)[] {
  return SCORE_AXES.filter(({ key, higherIsBetter }) => {
    const v = s[key]
    return all.every((o) => (higherIsBetter ? v >= o[key] : v <= o[key]))
  }).map((a) => a.key)
}
