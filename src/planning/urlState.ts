import type { Vec } from '@/model/types'

/** Plans are URL-shareable: map by ID (maps are pre-shipped, not encoded),
 *  drop zone by ID, markers as inch coordinates. */
export interface UrlPlanState {
  mapId?: string
  dropZoneId?: string
  markers?: Vec[]
}

export function readUrlState(): UrlPlanState {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const mapId = params.get('m') ?? undefined
  const dropZoneId = params.get('dz') ?? undefined
  const k = params.get('k')
  let markers: Vec[] | undefined
  if (k) {
    const parsed = k.split(';').map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return { x, y }
    })
    if (parsed.length > 0 && parsed.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      markers = parsed
    }
  }
  return { mapId, dropZoneId, markers }
}

export function writeUrlState(state: UrlPlanState): void {
  const params = new URLSearchParams()
  if (state.mapId) params.set('m', state.mapId)
  if (state.dropZoneId) params.set('dz', state.dropZoneId)
  if (state.markers) {
    params.set('k', state.markers.map((m) => `${m.x.toFixed(3)},${m.y.toFixed(3)}`).join(';'))
  }
  history.replaceState(null, '', `#${params.toString()}`)
}
