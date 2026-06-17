import type { AnnotatedMap, KillzoneCatalogue } from '@/model/types'
import { generateCandidates } from '@/scoring/generate'
import type { GenerateProgress, GenerateResult } from '@/scoring/generate'
import type { WeightConfig } from '@/scoring/weighted'

export interface GenerateRequest {
  type: 'generate'
  map: AnnotatedMap
  catalogue: KillzoneCatalogue
  dropZoneId: string
  attempts: number
  weights: WeightConfig
  seed?: number
}

export type GeneratorMessage =
  | ({ type: 'progress' } & GenerateProgress)
  | ({ type: 'done' } & GenerateResult)
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const req = e.data
  if (req.type !== 'generate') return
  try {
    let lastPost = 0
    const result = generateCandidates(
      req.map,
      req.catalogue,
      req.dropZoneId,
      req.attempts,
      req.seed,
      (p) => {
        const now = Date.now()
        if (now - lastPost > 50) {
          lastPost = now
          self.postMessage({ type: 'progress', ...p } satisfies GeneratorMessage)
        }
      },
      req.weights,
    )
    self.postMessage({ type: 'done', ...result } satisfies GeneratorMessage)
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) } satisfies GeneratorMessage)
  }
}
