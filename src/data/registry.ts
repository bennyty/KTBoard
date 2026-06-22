import type { AnnotatedMap, KillzoneCatalogue } from '@/model/types'
import volkusCatalogueJson from './volkus-catalogue.json'
import gallowdarkCatalogueJson from './gallowdark-catalogue.json'
import twCatalogueJson from './tombworld-catalogue.json'
import volkus1 from './2024-volkus-1.json'
import volkus2 from './2024-volkus-2.json'
import volkus3 from './2024-volkus-3.json'
import volkus4 from './2024-volkus-4.json'
import volkus5 from './2024-volkus-5.json'
import volkus6 from './2024-volkus-6.json'
import volkus7 from './2025-volkus-1.json'
import volkus8 from './2025-volkus-2.json'
import volkus9 from './2025-volkus-3.json'
import volkus10 from './2025-volkus-4.json'
import volkus11 from './2025-volkus-5.json'
import volkus12 from './2025-volkus-6.json'
import tw1 from './tombworld-1.json'
import tw2 from './tombworld-2.json'
import tw3 from './tombworld-3.json'
import tw4 from './tombworld-4.json'
import tw5 from './tombworld-5.json'
import tw6 from './tombworld-6.json'
import gd1 from './gallowdark-1.json'
import gd2 from './gallowdark-2.json'
import gd3 from './gallowdark-3.json'
import gd4 from './gallowdark-4.json'
import gd5 from './gallowdark-5.json'
import gd6 from './gallowdark-6.json'
import one_obj_map from './one-obj-test-map.json'

export const catalogues: Record<string, KillzoneCatalogue> = {
  volkus: volkusCatalogueJson as KillzoneCatalogue,
  gallowdark: gallowdarkCatalogueJson as KillzoneCatalogue,
  tombworld: twCatalogueJson as KillzoneCatalogue
}

export interface MapGroup {
  name: string
  maps: AnnotatedMap[]
}

export const maps: MapGroup[] = [
  {
    name: 'Volkus',
    maps: [
      volkus7 as AnnotatedMap,
      volkus8 as AnnotatedMap,
      volkus9 as AnnotatedMap,
      volkus10 as AnnotatedMap,
      volkus11 as AnnotatedMap,
      volkus12 as AnnotatedMap,
    ]
  },
  {
    name: 'Gallowdark',
    maps: [
      gd1 as AnnotatedMap,
      gd2 as AnnotatedMap,
      gd3 as AnnotatedMap,
      gd4 as AnnotatedMap,
      gd5 as AnnotatedMap,
      gd6 as AnnotatedMap,
    ]
  },
  {
    name: 'Tombworld',
    maps: [
      tw1 as AnnotatedMap,
      tw2 as AnnotatedMap,
      tw3 as AnnotatedMap,
      tw4 as AnnotatedMap,
      tw5 as AnnotatedMap,
      tw6 as AnnotatedMap,
    ]
  },
  {
    name: 'Archived Maps',
    maps: [
      volkus1 as AnnotatedMap,
      volkus2 as AnnotatedMap,
      volkus3 as AnnotatedMap,
      volkus4 as AnnotatedMap,
      volkus5 as AnnotatedMap,
      volkus6 as AnnotatedMap,
    ]
  },
]

export function getMap(id: string): AnnotatedMap | undefined {
  for (const mapGroup of maps) {
    const map = mapGroup.maps.find((m) => m.id === id)
    if (map) {
      return map
    }
  }
}

export const DEFAULT_MAP = volkus7 as AnnotatedMap

export function getCatalogue(killzone: string): KillzoneCatalogue | undefined {
  return catalogues[killzone]
}

// let pillars: any[] = []
// let walls: any[] = []
// let other: any[] = []
// tw1.placements.forEach((p) => {
//   if (p.pieceId === 'tw-pillar') {
//     pillars.push(p)
//   } else if (p.pieceId === 'tw-wall') {
//     walls.push(p)
//   } else {
//     other.push(p)
//   }
// })
// console.log(JSON.stringify([
//   ...other,
//   ...walls,
//   ...pillars,
// ], null, 2))