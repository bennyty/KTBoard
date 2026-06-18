import type { AnnotatedMap, KillzoneCatalogue } from '@/model/types'
import volkusCatalogueJson from './volkus-catalogue.json'
import volkus1Json from './2024-volkus-1.json'
import volkus2Json from './2024-volkus-2.json'
import volkus3Json from './2024-volkus-3.json'
import volkus4Json from './2024-volkus-4.json'
import volkus5Json from './2024-volkus-5.json'
import volkus6Json from './2024-volkus-6.json'
import volkus7Json from './2025-volkus-1.json'
import volkus8Json from './2025-volkus-2.json'
import volkus9Json from './2025-volkus-3.json'
import volkus10Json from './2025-volkus-4.json'
import volkus11Json from './2025-volkus-5.json'
import volkus12Json from './2025-volkus-6.json'
import one_obj_map from './one-obj-test-map.json'

export const catalogues: Record<string, KillzoneCatalogue> = {
  volkus: volkusCatalogueJson as KillzoneCatalogue,
}

export const maps: AnnotatedMap[] = [
  volkus7Json as AnnotatedMap,
  volkus8Json as AnnotatedMap,
  volkus9Json as AnnotatedMap,
  volkus10Json as AnnotatedMap,
  volkus11Json as AnnotatedMap,
  volkus12Json as AnnotatedMap,
  volkus1Json as AnnotatedMap,
  volkus2Json as AnnotatedMap,
  volkus3Json as AnnotatedMap,
  volkus4Json as AnnotatedMap,
  volkus5Json as AnnotatedMap,
  volkus6Json as AnnotatedMap,
  one_obj_map as AnnotatedMap
]

export function getMap(id: string): AnnotatedMap | undefined {
  return maps.find((m) => m.id === id)
}

export function getCatalogue(killzone: string): KillzoneCatalogue | undefined {
  return catalogues[killzone]
}
