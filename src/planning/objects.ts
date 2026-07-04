import type {
  ArrowObject,
  CircleObject,
  EllipseObject,
  ObjectColor,
  ObjectKind,
  RectObject,
  SlideObject,
  TextObject,
  Vec,
} from '@/model/types'
import {
  CIRCLE_DEFAULT_SIZE_MM,
  CIRCLE_PRESET_SIZES_MM,
  ELLIPSE_DEFAULT_HEIGHT_MM,
  ELLIPSE_DEFAULT_WIDTH_MM,
  ELLIPSE_PRESETS,
  IN_PER_MM,
  RECT_PRESETS,
} from '@/model/constants'

/** Short, collision-resistant id for slides and objects (URL-encoded fresh on load). */
export function genId(): string {
  return Math.random().toString(36).slice(2, 9)
}

/** Token → CSS color. Kept here so the palette is defined in one place. */
export const COLOR_HEX: Record<ObjectColor, string> = {
  red: '#e23b3b',
  blue: '#3b82e2',
  yellow: '#e2c23b',
  green: '#3bdc6e',
  white: '#f0f0f0',
  black: '#101010',
}

export const DEFAULT_OBJECT_COLOR: ObjectColor = 'red'

/** Snap a dragged radius (inches) to the nearest preset diameter, returning mm. */
export function snapCircleSizeMm(radiusIn: number): number {
  const diameterMm = (radiusIn * 2) / IN_PER_MM
  let best = CIRCLE_PRESET_SIZES_MM[0] as number
  let bestDelta = Infinity
  for (const size of CIRCLE_PRESET_SIZES_MM) {
    const delta = Math.abs(size - diameterMm)
    if (delta < bestDelta) {
      bestDelta = delta
      best = size
    }
  }
  return best
}

export type EllipsePreset = (typeof ELLIPSE_PRESETS)[number]

/** Snap a dragged size (mm) to the nearest oval-base preset. Orientation-agnostic
 *  so a portrait drag picks the same preset as a landscape one of equal size. */
export function snapEllipsePreset(widthMm: number, heightMm: number): EllipsePreset {
  let best: EllipsePreset = ELLIPSE_PRESETS[0]
  let bestDelta = Infinity
  for (const p of ELLIPSE_PRESETS) {
    const delta = Math.min(
      Math.hypot(p.widthMm - widthMm, p.heightMm - heightMm),
      Math.hypot(p.widthMm - heightMm, p.heightMm - widthMm),
    )
    if (delta < bestDelta) {
      bestDelta = delta
      best = p
    }
  }
  return best
}


/** Display text for a preset: its name, or its dimensions when unnamed. */
export function ellipsePresetLabel(p: EllipsePreset): string {
  const times = String.fromCharCode(215) // ×
  if (p.name) return `${p.name}\n(${p.widthMm}${times}${p.heightMm}mm)`
  return `${p.widthMm}${times}${p.heightMm}mm`
}

export function makeCircle(center: Vec, sizeMm = CIRCLE_DEFAULT_SIZE_MM, color: ObjectColor = DEFAULT_OBJECT_COLOR): CircleObject {
  return { id: genId(), kind: 'circle', x: center.x, y: center.y, sizeMm, color, label: '' }
}

export function makeEllipse(
  center: Vec,
  widthMm: number = ELLIPSE_DEFAULT_WIDTH_MM,
  heightMm: number = ELLIPSE_DEFAULT_HEIGHT_MM,
  rotationDeg = 0,
  color: ObjectColor = DEFAULT_OBJECT_COLOR,
): EllipseObject {
  return { id: genId(), kind: 'ellipse', x: center.x, y: center.y, rotationDeg, widthMm, heightMm, color, label: '' }
}

export function makeRect(center: Vec, rotationDeg: number, presetIndex: number, color: ObjectColor = DEFAULT_OBJECT_COLOR): RectObject {
  const preset = RECT_PRESETS[presetIndex] ?? RECT_PRESETS[0]
  return {
    id: genId(),
    kind: 'rect',
    x: center.x,
    y: center.y,
    rotationDeg,
    lengthMm: preset.lengthMm,
    widthMm: preset.widthMm,
    color,
    label: preset.name,
  }
}

export function makeArrow(start: Vec, end: Vec, color: ObjectColor = DEFAULT_OBJECT_COLOR): ArrowObject {
  return { id: genId(), kind: 'arrow', x1: start.x, y1: start.y, x2: end.x, y2: end.y, color, label: '' }
}

export function makeText(at: Vec): TextObject {
  return { id: genId(), kind: 'text', x: at.x, y: at.y, label: 'Text' }
}

/** Arrow length in killzone inches (board coordinates are already in inches). */
export function arrowLengthIn(o: Pick<ArrowObject, 'x1' | 'y1' | 'x2' | 'y2'>): number {
  return Math.hypot(o.x2 - o.x1, o.y2 - o.y1)
}

/** Format an inch measurement for display, e.g. `5.3"`. */
export function formatInches(inches: number): string {
  return `${inches.toFixed(2)}"`
}

/** Translate any object kind by (dx, dy) inches, returning a new object. */
export function translateObject(o: SlideObject, dx: number, dy: number): SlideObject {
  if (o.kind === 'arrow') {
    return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }
  }
  return { ...o, x: o.x + dx, y: o.y + dy }
}

export const OBJECT_KIND_LABELS: Record<ObjectKind, string> = {
  circle: 'Circle',
  ellipse: 'Ellipse',
  rect: 'Rectangle',
  arrow: 'Arrow',
  text: 'Text',
}
