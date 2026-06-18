import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnnotatedMap, Chain, KillzoneCatalogue, TunnelCandidate } from '@/model/types'
import { DEFAULT_ATTEMPTS, TUNE_ATTEMPTS } from '@/scoring/generate'
import type { GenerateResult } from '@/scoring/generate'
import { DEFAULT_WEIGHTS } from '@/scoring/weighted'
import type { WeightConfig } from '@/scoring/weighted'
import type { GeneratorMessage } from '@/worker/generator.worker'

export type CandidateGroup = 'weighted' | 'pareto'

export interface CandidateSelection {
  group: CandidateGroup
  index: number
}

export interface Progress {
  attempted: number
  totalAttempts: number
  valid: number
  frontSize: number
}

export interface TunnelGenerator {
  weightedCandidates: TunnelCandidate[]
  paretoCandidates: TunnelCandidate[]
  weights: WeightConfig
  setWeights: React.Dispatch<React.SetStateAction<WeightConfig>>
  progress: Progress | null
  generating: boolean
  tuning: boolean
  error: string | null
  selected: CandidateSelection | null
  generate(): void
  generateOne(): void
  selectCandidate(group: CandidateGroup, index: number): void
  clearSelection(): void
  reset(): void
}

/**
 * Owns the worker-backed tunnel candidate generation (ADR 0001/0002). Picking a
 * candidate (or finishing a generation) calls `onPickMarkers` to load it into the
 * caller's current Slide.
 */
export function useTunnelGenerator({
  map,
  catalogue,
  dropZoneId,
  onPickMarkers,
}: {
  map: AnnotatedMap
  catalogue: KillzoneCatalogue
  dropZoneId: string
  onPickMarkers: (markers: Chain) => void
}): TunnelGenerator {
  const [weightedCandidates, setWeightedCandidates] = useState<TunnelCandidate[]>([])
  const [paretoCandidates, setParetoCandidates] = useState<TunnelCandidate[]>([])
  const [weights, setWeights] = useState<WeightConfig>(DEFAULT_WEIGHTS)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [generating, setGenerating] = useState(false)
  const [tuning, setTuning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CandidateSelection | null>(null)
  const workerRef = useRef<Worker | null>(null)
  // True once a full generation has produced a Pareto front, so weight tuning
  // can re-tune only the weighted list without rebuilding the front.
  const generatedRef = useRef(false)
  // Keep the latest onPickMarkers without resubscribing the tuning effect.
  const onPickRef = useRef(onPickMarkers)
  onPickRef.current = onPickMarkers

  useEffect(() => () => workerRef.current?.terminate(), [])

  const runGeneration = useCallback(
    (opts: {
      attempts: number
      weights: WeightConfig
      onProgress?: (p: Progress) => void
      onDone: (res: GenerateResult) => void
      onError: (msg: string) => void
    }) => {
      workerRef.current?.terminate()
      const worker = new Worker(new URL('../worker/generator.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = (e: MessageEvent<GeneratorMessage>) => {
        const msg = e.data
        if (msg.type === 'progress') {
          opts.onProgress?.(msg)
        } else if (msg.type === 'done') {
          opts.onDone(msg)
          worker.terminate()
        } else {
          opts.onError(msg.message)
          worker.terminate()
        }
      }
      worker.postMessage({ type: 'generate', map, catalogue, dropZoneId, attempts: opts.attempts, weights: opts.weights })
    },
    [map, catalogue, dropZoneId],
  )

  const reset = useCallback(() => {
    workerRef.current?.terminate()
    setWeightedCandidates([])
    setParetoCandidates([])
    setSelected(null)
    setProgress(null)
    setGenerating(false)
    setTuning(false)
    setError(null)
    generatedRef.current = false
  }, [])

  // Candidates are keyed to a (map, drop zone); rebuild from scratch on change.
  useEffect(() => {
    reset()
  }, [map.id, dropZoneId, reset])

  const generate = useCallback(() => {
    setGenerating(true)
    setError(null)
    setWeightedCandidates([])
    setParetoCandidates([])
    setSelected(null)
    generatedRef.current = false
    setProgress({ attempted: 0, totalAttempts: DEFAULT_ATTEMPTS, valid: 0, frontSize: 0 })
    runGeneration({
      attempts: DEFAULT_ATTEMPTS,
      weights,
      onProgress: setProgress,
      onDone: (res) => {
        setWeightedCandidates(res.weightedCandidates)
        setParetoCandidates(res.paretoCandidates)
        setGenerating(false)
        setProgress(null)
        generatedRef.current = true
        const first = res.weightedCandidates[0] ?? res.paretoCandidates[0]
        if (first) {
          setSelected(res.weightedCandidates[0] ? { group: 'weighted', index: 0 } : { group: 'pareto', index: 0 })
          onPickRef.current(first.markers)
        }
      },
      onError: (m) => {
        setError(m)
        setGenerating(false)
        setProgress(null)
      },
    })
  }, [runGeneration, weights])

  const generateOne = useCallback(() => {
    setGenerating(true)
    setError(null)
    setWeightedCandidates([])
    setParetoCandidates([])
    setSelected(null)
    generatedRef.current = false
    setProgress({ attempted: 0, totalAttempts: 1, valid: 0, frontSize: 0 })
    runGeneration({
      attempts: 1,
      weights,
      onProgress: setProgress,
      onDone: (res) => {
        setWeightedCandidates(res.weightedCandidates)
        setParetoCandidates(res.paretoCandidates)
        setGenerating(false)
        setProgress(null)
        generatedRef.current = true
        const first = res.weightedCandidates[0] ?? res.paretoCandidates[0]
        if (first) {
          setSelected(res.weightedCandidates[0] ? { group: 'weighted', index: 0 } : { group: 'pareto', index: 0 })
          onPickRef.current(first.markers)
        }
      },
      onError: (m) => {
        setError(m)
        setGenerating(false)
        setProgress(null)
      },
    })
  }, [runGeneration, weights])

  // Re-tune only the weighted list when weights change (debounced); the Pareto
  // list stays fixed from the last full generation.
  useEffect(() => {
    if (!generatedRef.current) return
    const t = setTimeout(() => {
      setTuning(true)
      runGeneration({
        attempts: TUNE_ATTEMPTS,
        weights,
        onDone: (res) => {
          setWeightedCandidates(res.weightedCandidates)
          setTuning(false)
          setSelected((sel) => {
            if (sel?.group !== 'weighted') return sel
            if (res.weightedCandidates.length === 0) return null
            const index = Math.min(sel.index, res.weightedCandidates.length - 1)
            onPickRef.current(res.weightedCandidates[index].markers)
            return { group: 'weighted', index }
          })
        },
        onError: (m) => {
          setError(m)
          setTuning(false)
        },
      })
    }, 500)
    return () => clearTimeout(t)
  }, [weights, runGeneration])

  const selectCandidate = useCallback(
    (group: CandidateGroup, index: number) => {
      const list = group === 'weighted' ? weightedCandidates : paretoCandidates
      const candidate = list[index]
      if (!candidate) return
      setSelected({ group, index })
      onPickRef.current(candidate.markers)
    },
    [weightedCandidates, paretoCandidates],
  )

  const clearSelection = useCallback(() => setSelected(null), [])

  return {
    weightedCandidates,
    paretoCandidates,
    weights,
    setWeights,
    progress,
    generating,
    tuning,
    error,
    selected,
    generate,
    generateOne,
    selectCandidate,
    clearSelection,
    reset,
  }
}
