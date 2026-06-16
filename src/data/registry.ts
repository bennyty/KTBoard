import type { AnnotatedMap, KillzoneCatalogue } from '@/model/types'
import volkusCatalogueJson from './volkus-catalogue.json'
import volkus1Json from './volkus-1.json'
import one_obj_map from './one-obj-test-map.json'

export const catalogues: Record<string, KillzoneCatalogue> = {
  volkus: volkusCatalogueJson as KillzoneCatalogue,
}

export const maps: AnnotatedMap[] = [
  volkus1Json as AnnotatedMap,
  one_obj_map as AnnotatedMap
]

export function getMap(id: string): AnnotatedMap | undefined {
  return maps.find((m) => m.id === id)
}

export function getCatalogue(killzone: string): KillzoneCatalogue | undefined {
  return catalogues[killzone]
}
