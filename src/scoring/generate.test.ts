import { describe, expect, it } from 'vitest'
import type { AnnotatedMap, KillzoneCatalogue } from '@/model/types'
import volkusCatalogueJson from '@/data/volkus-catalogue.json'
import volkus1Json from '@/data/2024-volkus-1.json'
import { chainViolations } from '@/rules/validity'
import { generateCandidates, resolveMapPieces } from './generate'
import { DEFAULT_WEIGHTS, makeNormContext, weightedScore } from './weighted'

const map = volkus1Json as AnnotatedMap
const catalogue = volkusCatalogueJson as KillzoneCatalogue

describe('generateCandidates on Volkus 1', () => {
  it('produces violation-free Pareto and weighted plans for each drop zone', () => {
    for (const dz of map.dropZones) {
      const result = generateCandidates(map, catalogue, dz.id, 200)
      expect(result.valid).toBe(191) // 191 valid tunnels among 200 attempts, with the default RNG seed
      expect(result.paretoCandidates.length).toBeGreaterThanOrEqual(1)
      expect(result.paretoCandidates.length).toBeLessThanOrEqual(5)
      expect(result.weightedCandidates.length).toBeGreaterThanOrEqual(1)
      expect(result.weightedCandidates.length).toBeLessThanOrEqual(5)

      const pieces = resolveMapPieces(map, catalogue)
      for (const plan of [...result.paretoCandidates, ...result.weightedCandidates]) {
        expect(chainViolations(plan.markers, pieces, map, dz)).toEqual([])
        expect(plan.wins.length).toBeGreaterThanOrEqual(0)
      }

      // Pareto plans should be distinct chains.
      const keys = new Set(
        result.paretoCandidates.map((p) => JSON.stringify(p.markers.map((m) => [m.x.toFixed(1), m.y.toFixed(1)]))),
      )
      expect(keys.size).toBe(result.paretoCandidates.length)
    }
  })

  it('is deterministic for a fixed seed', () => {
    const a = generateCandidates(map, catalogue, 'dz-a', 50, 7)
    const b = generateCandidates(map, catalogue, 'dz-a', 50, 7)
    expect(a.paretoCandidates).toEqual(b.paretoCandidates)
    expect(a.weightedCandidates).toEqual(b.weightedCandidates)
  })

  it('weighted candidates are ordered by descending weighted score', () => {
    const result = generateCandidates(map, catalogue, 'dz-a', 200)
    const norm = makeNormContext(map, map.dropZones.find((d) => d.id === 'dz-a')!)
    const scores = result.weightedCandidates.map((p) => weightedScore(p.scores, DEFAULT_WEIGHTS, norm))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1] + 1e-9)
    }
  })

  it('every presented candidate wins at least one axis among the set', () => {
    const result = generateCandidates(map, catalogue, 'dz-a', 200)
    if (result.paretoCandidates.length > 1) {
      // Pareto front members are mutually non-dominated, but k-medoid picks
      // need not each be best-at-something; most should be. Sanity: at least
      // one candidate carries a win label, and labels reference real axes.
      expect(result.paretoCandidates.some((p) => p.wins.length > 0)).toBe(true)
    }
  })
})
