import type { AnnotatedMap, Chain, KillzoneCatalogue, Scores, TunnelCandidate, Vec, WorldPiece } from '@/model/types'
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
import { DEFAULT_WEIGHTS, makeNormContext, weightedScore } from './weighted'
import type { WeightConfig } from './weighted'

/** Pareto candidates shown (k-medoid-sampled from the front). */
export const PARETO_CANDIDATES = 5
/** Weighted-sum candidates shown (top scorers). */
export const WEIGHTED_CANDIDATES = 5
/**
 * Candidates sampled per link before committing one. Each is drawn from the
 * arc-annulus, scored by weighted score on the partial chain, and the best
 * advances (greedy lookahead). Higher = better links but ~N× the scoring cost.
 */
export const LINK_CANDIDATES = 20
/** Full generation pass (Generate button). */
export const DEFAULT_ATTEMPTS = 2_000
/** Cheaper pass used for real-time weight tuning, to keep the UI responsive. */
export const TUNE_ATTEMPTS = 1_000

export interface GenerateProgress {
  attempted: number
  totalAttempts: number
  valid: number
  frontSize: number
}

export interface GenerateResult {
  /** Diverse Pareto-front representatives (ADR 0001). */
  paretoCandidates: TunnelCandidate[]
  /** Highest weighted-sum scorers under the supplied weights (ADR 0002). */
  weightedCandidates: TunnelCandidate[]
  attempted: number
  valid: number
  frontSize: number
}

interface Scored {
  chain: Chain
  scores: Scores
}

/** Keep the top `k` candidates by weighted score in a small sorted array. */
function offerWeighted(top: { score: number; item: Scored }[], score: number, item: Scored, k: number) {
  if (top.length >= k && score <= top[top.length - 1].score) return
  // Linear insert keeps the array sorted descending; k is tiny (5).
  let i = top.length
  while (i > 0 && top[i - 1].score < score) i--
  top.splice(i, 0, { score, item })
  if (top.length > k) top.pop()
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
 * Rejection-sample five-marker chains and score the survivors. Survivors feed
 * two parallel rankings: a Pareto front (k-medoid-sampled to PARETO_CANDIDATES
 * diverse representatives, ADR 0001) and a weighted-sum top-WEIGHTED_CANDIDATES list
 * (ADR 0002). Deterministic for a given (map, drop zone, seed).
 */
export function generateCandidates(
  map: AnnotatedMap,
  catalogue: KillzoneCatalogue,
  dropZoneId: string,
  attempts: number = DEFAULT_ATTEMPTS,
  seed?: number,
  onProgress?: (p: GenerateProgress) => void,
  weights: WeightConfig = DEFAULT_WEIGHTS,
): GenerateResult {
  const dropZone = map.dropZones.find((d) => d.id === dropZoneId)
  if (!dropZone) throw new Error(`Unknown drop zone: ${dropZoneId}`)
  const pieces = resolveMapPieces(map, catalogue)
  const ctx = makeScoringContext(map, pieces, dropZone)
  const norm = makeNormContext(map, dropZone)
  // Direction pointing away from the anchor edge into the board (y is down).
  const forwardAngle =
    dropZone.anchorEdge === 'left'
      ? 0
      : dropZone.anchorEdge === 'right'
        ? Math.PI
        : dropZone.anchorEdge === 'top'
          ? Math.PI / 2
          : -Math.PI / 2
  const rng = mulberry32(seed ?? hashString(`${map.id}/${dropZoneId}`))
  const front = new ParetoFront<Scored>()
  const weightedTop: { score: number; item: Scored }[] = []

  let valid = 0
  const progressEvery = Math.max(1, Math.floor(attempts / 100))

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (onProgress && attempt % progressEvery === 0) {
      onProgress({ attempted: attempt, totalAttempts: attempts, valid, frontSize: front.size })
    }

    const m0 = sampleMarker0(rng, map, dropZone)
    if (!m0 || !markerPlacementClear(m0, pieces, map.widthIn, map.heightIn)) continue

    const rMin2 = MIN_LINK_CENTER_TO_CENTER_IN * MIN_LINK_CENTER_TO_CENTER_IN
    const rMax2 = MAX_LINK_CENTER_TO_CENTER_IN * MAX_LINK_CENTER_TO_CENTER_IN
    const chain: Chain = [m0]
    let dead = false
    for (let i = 1; i < CHAIN_LENGTH; i++) {
      const prev = chain[i - 1]
      // Draw LINK_CANDIDATES placements from the annulus around the previous
      // marker whose edge-to-edge gap is within [MIN_LINK_GAP_IN, MAX_LINK_GAP_IN],
      // restricted to a 180° arc centred on the forward direction so links advance
      // into the board rather than doubling back toward the anchor edge. Of the
      // valid candidates, commit the one whose partial chain scores best under the
      // weights (greedy one-step lookahead).
      let best: Vec | null = null
      let bestScore = -Infinity
      for (let c = 0; c < LINK_CANDIDATES; c++) {
        const angle = forwardAngle + (rng() - 0.5) * Math.PI
        const radius = Math.sqrt(rMin2 + rng() * (rMax2 - rMin2))
        const cand = { x: prev.x + radius * Math.cos(angle), y: prev.y + radius * Math.sin(angle) }
        if (!markerPlacementClear(cand, pieces, map.widthIn, map.heightIn)) continue
        chain.push(cand)
        const candScore = weightedScore(scoreChain(chain, ctx), weights, norm)
        chain.pop()
        if (candScore > bestScore) {
          bestScore = candScore
          best = cand
        }
      }
      if (!best) {
        dead = true
        break
      }
      chain.push(best)
    }
    if (dead) continue

    valid++
    const scores = scoreChain(chain, ctx)
    const item: Scored = { chain, scores }
    front.offer(toDominanceVector(scores), item)
    offerWeighted(weightedTop, weightedScore(scores, weights, norm), item, WEIGHTED_CANDIDATES)
  }

  const entries = front.entries
  const picks = kMedoids(
    entries.map((e) => e.vector),
    PARETO_CANDIDATES,
    rng,
  )
  const paretoCandidates = toCandidates(picks.map((i) => entries[i].item), map.id, dropZoneId)
  const weightedCandidates = toCandidates(weightedTop.map((w) => w.item), map.id, dropZoneId)

  onProgress?.({ attempted: attempts, totalAttempts: attempts, valid, frontSize: front.size })
  return { paretoCandidates, weightedCandidates, attempted: attempts, valid, frontSize: front.size }
}

/** Wrap chosen Scored items as TunnelCandidates, labelling each winning axis. */
function toCandidates(chosen: Scored[], mapId: string, dropZoneId: string): TunnelCandidate[] {
  const all = chosen.map((c) => c.scores)
  return chosen.map(({ chain, scores }) => ({
    mapId,
    dropZoneId,
    markers: chain,
    scores,
    wins: winningAxes(scores, all),
  }))
}

/** Axes on which `s` is (tied-)best among `all` — the "why is this plan shown" labels. */
export function winningAxes(s: Scores, all: Scores[]): (keyof Scores)[] {
  return SCORE_AXES.filter(({ key, higherIsBetter }) => {
    const v = s[key]
    return all.every((o) => (higherIsBetter ? v >= o[key] : v <= o[key]))
  }).map((a) => a.key)
}
