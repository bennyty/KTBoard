import LZString from 'lz-string'
import type { Chain, ObjectColor, Plan, Slide, SlideObject } from '@/model/types'
import { OBJECT_COLORS } from '@/model/types'
import { genId } from './objects'

/**
 * Encode the whole Plan into a single URL-safe string (ADR 0003). The Plan is
 * serialized into a compact array form (short tuples, color tokens as palette
 * indices, coordinates rounded to 3 decimals) and then LZ-string compressed.
 * Slide/object ids are NOT encoded — they are regenerated on decode.
 *
 * The encoded array is prefixed with a codec version number so that a future
 * change to the layout can keep decoding plans shared under older versions.
 * Plans shared before versioning existed begin with the plan name (a string)
 * rather than a number, and are decoded as version 0.
 *
 * Version history:
 *   0/1 — map and drop zone live on the Plan; body is [name, mapId, dropZoneId,
 *         slides], each slide [name, markers, objects].
 *   2   — map and drop zone moved onto each Slide; body is [name, slides], each
 *         slide [name, mapId, dropZoneId, markers, objects]. Older plans decode
 *         by copying the plan-level map/drop zone onto every slide.
 */

const PLAN_CODEC_VERSION = 2

const ROUND = 1000
const r = (n: number) => Math.round(n * ROUND) / ROUND

const KIND_TAG = { circle: 0, rect: 1, arrow: 2, text: 3 } as const

type CompactObject = (number | string)[]
type CompactSlide = [string, string, string, number[] | 0, CompactObject[]]
type CompactPlanBody = [string, CompactSlide[]]
type CompactPlan = [number, ...CompactPlanBody]

function colorIndex(c: ObjectColor): number {
  const i = OBJECT_COLORS.indexOf(c)
  return i < 0 ? 0 : i
}

function encodeObject(o: SlideObject): CompactObject {
  switch (o.kind) {
    case 'circle':
      return [KIND_TAG.circle, r(o.x), r(o.y), o.sizeMm, colorIndex(o.color), o.label]
    case 'rect':
      return [KIND_TAG.rect, r(o.x), r(o.y), r(o.rotationDeg), o.lengthMm, o.widthMm, colorIndex(o.color), o.label]
    case 'arrow':
      return [KIND_TAG.arrow, r(o.x1), r(o.y1), r(o.x2), r(o.y2), colorIndex(o.color), o.label]
    case 'text':
      return [KIND_TAG.text, r(o.x), r(o.y), o.label]
  }
}

function encodeSlide(s: Slide): CompactSlide {
  const markers: number[] | 0 = s.markers ? s.markers.flatMap((m) => [r(m.x), r(m.y)]) : 0
  return [s.name, s.mapId, s.dropZoneId, markers, s.objects.map(encodeObject)]
}

export function encodePlan(plan: Plan): string {
  const compact: CompactPlan = [PLAN_CODEC_VERSION, plan.name, plan.slides.map(encodeSlide)]
  return LZString.compressToEncodedURIComponent(JSON.stringify(compact))
}

// --- decode (defensive: any malformed input yields null) ---

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function decodeColor(v: unknown): ObjectColor {
  return isNum(v) && v >= 0 && v < OBJECT_COLORS.length ? OBJECT_COLORS[v] : OBJECT_COLORS[0]
}

function decodeObject(a: unknown): SlideObject | null {
  if (!Array.isArray(a) || !isNum(a[0])) return null
  switch (a[0]) {
    case KIND_TAG.circle:
      if (!isNum(a[1]) || !isNum(a[2]) || !isNum(a[3]) || !isStr(a[5])) return null
      return { id: genId(), kind: 'circle', x: a[1], y: a[2], sizeMm: a[3], color: decodeColor(a[4]), label: a[5] }
    case KIND_TAG.rect:
      if (!isNum(a[1]) || !isNum(a[2]) || !isNum(a[3]) || !isNum(a[4]) || !isNum(a[5]) || !isStr(a[7])) return null
      return {
        id: genId(),
        kind: 'rect',
        x: a[1],
        y: a[2],
        rotationDeg: a[3],
        lengthMm: a[4],
        widthMm: a[5],
        color: decodeColor(a[6]),
        label: a[7],
      }
    case KIND_TAG.arrow:
      if (!isNum(a[1]) || !isNum(a[2]) || !isNum(a[3]) || !isNum(a[4]) || !isStr(a[6])) return null
      return { id: genId(), kind: 'arrow', x1: a[1], y1: a[2], x2: a[3], y2: a[4], color: decodeColor(a[5]), label: a[6] }
    case KIND_TAG.text:
      if (!isNum(a[1]) || !isNum(a[2]) || !isStr(a[3])) return null
      return { id: genId(), kind: 'text', x: a[1], y: a[2], label: a[3] }
    default:
      return null
  }
}

function decodeMarkers(v: unknown): Chain | null {
  if (v === 0 || v == null) return null
  if (!Array.isArray(v) || v.length === 0 || v.length % 2 !== 0) return null
  const chain: Chain = []
  for (let i = 0; i < v.length; i += 2) {
    if (!isNum(v[i]) || !isNum(v[i + 1])) return null
    chain.push({ x: v[i], y: v[i + 1] })
  }
  return chain
}

function decodeObjects(raw: unknown): SlideObject[] | null {
  if (!Array.isArray(raw)) return null
  const objects: SlideObject[] = []
  for (const r of raw) {
    const o = decodeObject(r)
    if (!o) return null
    objects.push(o)
  }
  return objects
}

/** Version 2 slide: [name, mapId, dropZoneId, markers, objects]. */
function decodeSlide(a: unknown): Slide | null {
  if (!Array.isArray(a) || !isStr(a[0]) || !isStr(a[1]) || !isStr(a[2])) return null
  const objects = decodeObjects(a[4])
  if (!objects) return null
  return { id: genId(), name: a[0], mapId: a[1], dropZoneId: a[2], markers: decodeMarkers(a[3]), objects }
}

/** Legacy (v0/v1) slide: [name, markers, objects]; map/drop zone come from the
 *  plan level and are copied onto every slide. */
function decodeLegacySlide(a: unknown, mapId: string, dropZoneId: string): Slide | null {
  if (!Array.isArray(a) || !isStr(a[0])) return null
  const objects = decodeObjects(a[2])
  if (!objects) return null
  return { id: genId(), name: a[0], mapId, dropZoneId, markers: decodeMarkers(a[1]), objects }
}

export function decodePlan(encoded: string): Plan | null {
  let parsed: unknown
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  // Versioned plans lead with a numeric codec version; legacy plans lead with
  // the plan name (a string) and are treated as version 0.
  const version = isNum(parsed[0]) ? parsed[0] : 0
  switch (version) {
    case 0:
    case 1:
      return decodeLegacyBody(version === 0 ? parsed : parsed.slice(1))
    case 2:
      return decodeV2Body(parsed.slice(1))
    default:
      return null
  }
}

/** v2 body: [name, slides] where each slide carries its own map/drop zone. */
function decodeV2Body(body: unknown[]): Plan | null {
  if (!isStr(body[0]) || !Array.isArray(body[1])) return null
  const slides: Slide[] = []
  for (const raw of body[1]) {
    const s = decodeSlide(raw)
    if (!s) return null
    slides.push(s)
  }
  if (slides.length === 0) return null
  return { name: body[0], slides }
}

// The body layout `[name, mapId, dropZoneId, slides]` is shared by versions 0
// and 1; only the version prefix differs. The plan-level map/drop zone is
// copied onto each slide to lift the plan into the current (per-slide) shape.
function decodeLegacyBody(body: unknown[]): Plan | null {
  if (!isStr(body[0]) || !isStr(body[1]) || !isStr(body[2]) || !Array.isArray(body[3])) return null
  const slides: Slide[] = []
  for (const raw of body[3]) {
    const s = decodeLegacySlide(raw, body[1], body[2])
    if (!s) return null
    slides.push(s)
  }
  if (slides.length === 0) return null
  return { name: body[0], slides }
}
