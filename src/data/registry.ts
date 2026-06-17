import type { AnnotatedMap, KillzoneCatalogue } from '@/model/types'
import volkusCatalogueJson from './volkus-catalogue.json'
import volkus1Json from './volkus-1.json'
import volkus2Json from './volkus-2.json'
import volkus3Json from './volkus-3.json'
import volkus4Json from './volkus-4.json'
import volkus5Json from './volkus-5.json'
import volkus6Json from './volkus-6.json'
import one_obj_map from './one-obj-test-map.json'

export const catalogues: Record<string, KillzoneCatalogue> = {
  volkus: volkusCatalogueJson as KillzoneCatalogue,
}

export const maps: AnnotatedMap[] = [
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
