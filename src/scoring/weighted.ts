/** Weighted-sum ranking of tunnel candidates.
 *  See docs/adr/0002-weighted-sum-experiment.md for why this exists alongside
 *  the Pareto front (ADR 0001). Each axis is normalised to [0,1] where 1 = good
 *  (lower-is-better axes are flipped), then combined as Σ weightᵢ · normᵢ. */

import type { AnnotatedMap, DropZone, Scores } from '@/model/types'
import {
  CHAIN_LENGTH,
  CONTROL_CENTER_TO_CENTER_IN,
  OBJECTIVE_COUNT_MAX,
  ZIGZAG_CAP,
} from '@/model/constants'

export type WeightConfig = Record<keyof Scores, number>

/** Initial weights (priority order); tuned empirically in Planning mode.
 *  See docs/adr/0002-weighted-sum-experiment.md. */
export const DEFAULT_WEIGHTS: WeightConfig = {
  objectiveDistance: 6,
  forwardReach: 7,
  centerAccess: 5,
  homeUnburrow: 4,
  coverage: 8,
  zigzag: 2,
}

/** Per-map normalisation bounds that don't come from constants. */
export interface NormContext {
  /** Max perpendicular distance from the anchor edge across the whole board. */
  forwardReachMax: number
}

export function makeNormContext(map: AnnotatedMap, dropZone: DropZone): NormContext {
  const horizontal = dropZone.anchorEdge === 'left' || dropZone.anchorEdge === 'right'
  return { forwardReachMax: horizontal ? map.widthIn : map.heightIn }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Normalise one axis to [0,1] with 1 = good (flipping lower-is-better axes). */
export function normalizeAxis(key: keyof Scores, scores: Scores, norm: NormContext): number {
  switch (key) {
    case 'objectiveDistance':
      return clamp01(scores.objectiveDistance / OBJECTIVE_COUNT_MAX)
    case 'forwardReach':
      return norm.forwardReachMax > 0 ? clamp01(scores.forwardReach / norm.forwardReachMax) : 0
    case 'centerAccess':
      // 2 (reached on marker 2) → 1; CHAIN_LENGTH (never) → 0.
      return clamp01((CHAIN_LENGTH - scores.centerAccess) / (CHAIN_LENGTH - 2))
    case 'homeUnburrow':
      // Binary: 1 if the home objective is reachable within control range.
      return scores.homeUnburrow <= CONTROL_CENTER_TO_CENTER_IN ? 1 : 0
    case 'coverage':
      return clamp01(scores.coverage / OBJECTIVE_COUNT_MAX)
    case 'zigzag':
      return clamp01(Math.min(scores.zigzag, ZIGZAG_CAP) / ZIGZAG_CAP)
  }
}

/** Weighted sum of normalised axes. Higher = better. */
export function weightedScore(scores: Scores, weights: WeightConfig, norm: NormContext): number {
  let sum = 0
  for (const key of Object.keys(weights) as (keyof Scores)[]) {
    sum += weights[key] * normalizeAxis(key, scores, norm)
  }
  return sum
}
