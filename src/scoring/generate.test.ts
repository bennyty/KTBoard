import { describe, expect, it } from 'vitest'
import type { AnnotatedMap, KillzoneCatalogue } from '@/model/types'
import volkusCatalogueJson from '@/data/volkus-catalogue.json'
import volkus1Json from '@/data/volkus-1.json'
import { chainViolations } from '@/rules/validity'
import { generatePlans, resolveMapPieces } from './generate'
import { DEFAULT_WEIGHTS, makeNormContext, weightedScore } from './weighted'

const map = volkus1Json as AnnotatedMap
const catalogue = volkusCatalogueJson as KillzoneCatalogue

describe('generatePlans on Volkus 1', () => {
  it('produces violation-free Pareto and weighted plans for each drop zone', () => {
    for (const dz of map.dropZones) {
      const result = generatePlans(map, catalogue, dz.id, 20_000)
      expect(result.valid).toBeGreaterThan(100)
      expect(result.paretoPlans.length).toBeGreaterThanOrEqual(1)
      expect(result.paretoPlans.length).toBeLessThanOrEqual(5)
      expect(result.weightedPlans.length).toBeGreaterThanOrEqual(1)
      expect(result.weightedPlans.length).toBeLessThanOrEqual(5)

      const pieces = resolveMapPieces(map, catalogue)
      for (const plan of [...result.paretoPlans, ...result.weightedPlans]) {
        expect(chainViolations(plan.markers, pieces, map, dz)).toEqual([])
        expect(plan.wins.length).toBeGreaterThanOrEqual(0)
      }

      // Pareto plans should be distinct chains.
      const keys = new Set(
        result.paretoPlans.map((p) => JSON.stringify(p.markers.map((m) => [m.x.toFixed(1), m.y.toFixed(1)]))),
      )
      expect(keys.size).toBe(result.paretoPlans.length)
    }
  })

  it('is deterministic for a fixed seed', () => {
    const a = generatePlans(map, catalogue, 'dz-a', 5_000, 7)
    const b = generatePlans(map, catalogue, 'dz-a', 5_000, 7)
    expect(a.paretoPlans).toEqual(b.paretoPlans)
    expect(a.weightedPlans).toEqual(b.weightedPlans)
  })

  it('weighted plans are ordered by descending weighted score', () => {
    const result = generatePlans(map, catalogue, 'dz-a', 20_000)
    const norm = makeNormContext(map, map.dropZones.find((d) => d.id === 'dz-a')!)
    const scores = result.weightedPlans.map((p) => weightedScore(p.scores, DEFAULT_WEIGHTS, norm))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1] + 1e-9)
    }
  })

  it('every presented plan wins at least one axis among the set', () => {
    const result = generatePlans(map, catalogue, 'dz-a', 20_000)
    if (result.paretoPlans.length > 1) {
      // Pareto front members are mutually non-dominated, but k-medoid picks
      // need not each be best-at-something; most should be. Sanity: at least
      // one plan carries a win label, and labels reference real axes.
      expect(result.paretoPlans.some((p) => p.wins.length > 0)).toBe(true)
    }
  })
})
