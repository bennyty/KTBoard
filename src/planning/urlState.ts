import type { Plan } from '@/model/types'
import { decodePlan, encodePlan } from './planCodec'

/** The whole Plan rides in a single LZ-compressed hash param (ADR 0003). */

export function readPlanFromUrl(): Plan | null {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const p = params.get('p')
  return p ? decodePlan(p) : null
}

export function writePlanToUrl(plan: Plan): void {
  history.replaceState(null, '', `#p=${encodePlan(plan)}`)
}
