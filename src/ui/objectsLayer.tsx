import type { ArrowObject, CircleObject, EllipseObject, Polygon, RectObject, SlideObject, TextObject } from '@/model/types'
import {
  CONTROL_RANGE_IN,
  EQUIPMENT_SPACING_IN,
  IN_PER_MM,
  LADDER_ACCESSIBLE_SPACING_IN,
} from '@/model/constants'
import { equipmentName, rectCorners } from '@/rules/equipment'
import { arrowLengthIn, COLOR_HEX, formatInches } from '@/planning/objects'

/** Renders Slide Objects in killzone-inch coordinates (inside the Board's scaling <g>). */

const SELECT = '#ffffff'

/** Black reads as invisible on the dark board, so give it a light stroke. */
function strokeFor(color: string): string {
  return color === COLOR_HEX.black ? '#9a9aa6' : color
}

const LABEL_LINE_HEIGHT = 0.6

/** Faint outlined band echoing a shape's boundary, offset outward by the control
 *  range (1"). Rendered beneath the shape so the shape stays legible on top. */
const CONTROL_RANGE_STYLE = {
  fillOpacity: 0.05,
  strokeWidth: 0.02,
  strokeDasharray: '0.18 0.12',
} as const

function ObjectLabel({ x, y, text, color }: { x: number; y: number; text: string; color?: string }) {
  if (!text) return null
  // Newlines split the label across multiple centred lines. The block is
  // vertically centred on `y` so single-line labels are unaffected.
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  const startDy = -((lines.length - 1) / 2) * LABEL_LINE_HEIGHT
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={0.5}
      fill={color ?? '#f0f0f0'}
      stroke="#0c0c10"
      strokeWidth={0.04}
      style={{ paintOrder: 'stroke', pointerEvents: 'none', fontWeight: 600 }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : LABEL_LINE_HEIGHT}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

function CircleShape({ o, selected }: { o: CircleObject; selected: boolean }) {
  const hex = COLOR_HEX[o.color]
  const radius = (o.sizeMm * IN_PER_MM) / 2
  return (
    <>
      {o.showControlRange && (
        <circle cx={o.x} cy={o.y} r={radius + CONTROL_RANGE_IN} fill={hex} stroke={strokeFor(hex)} {...CONTROL_RANGE_STYLE} />
      )}
      <circle cx={o.x} cy={o.y} r={radius} fill={hex} fillOpacity={0.32} stroke={strokeFor(hex)} strokeWidth={0.06} />
      {selected && (
        <circle cx={o.x} cy={o.y} r={radius + 0.12} fill="none" stroke={SELECT} strokeWidth={0.05} strokeDasharray="0.18 0.12" />
      )}
      <ObjectLabel x={o.x} y={o.y + 0.18} text={o.label} />
    </>
  )
}

function EllipseShape({ o, selected }: { o: EllipseObject; selected: boolean }) {
  const hex = COLOR_HEX[o.color]
  const rx = (o.widthMm * IN_PER_MM) / 2
  const ry = (o.heightMm * IN_PER_MM) / 2
  return (
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotationDeg})`}>
      {o.showControlRange && (
        <ellipse cx={0} cy={0} rx={rx + CONTROL_RANGE_IN} ry={ry + CONTROL_RANGE_IN} fill={hex} stroke={strokeFor(hex)} {...CONTROL_RANGE_STYLE} />
      )}
      <ellipse cx={0} cy={0} rx={rx} ry={ry} fill={hex} fillOpacity={0.32} stroke={strokeFor(hex)} strokeWidth={0.06} />
      {selected && (
        <ellipse cx={0} cy={0} rx={rx + 0.12} ry={ry + 0.12} fill="none" stroke={SELECT} strokeWidth={0.05} strokeDasharray="0.18 0.12" />
      )}
      <ObjectLabel x={0} y={0.18} text={o.label} />
    </g>
  )
}

function RectShape({ o, selected }: { o: RectObject; selected: boolean }) {
  const hex = COLOR_HEX[o.color]
  const l = o.lengthMm * IN_PER_MM
  const w = o.widthMm * IN_PER_MM
  return (
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotationDeg})`}>
      {o.showControlRange && (
        <rect
          x={-l / 2 - CONTROL_RANGE_IN}
          y={-w / 2 - CONTROL_RANGE_IN}
          width={l + 2 * CONTROL_RANGE_IN}
          height={w + 2 * CONTROL_RANGE_IN}
          rx={CONTROL_RANGE_IN}
          ry={CONTROL_RANGE_IN}
          fill={hex}
          stroke={strokeFor(hex)}
          {...CONTROL_RANGE_STYLE}
        />
      )}
      <rect x={-l / 2} y={-w / 2} width={l} height={w} fill={hex} fillOpacity={0.32} stroke={strokeFor(hex)} strokeWidth={0.06} />
      {selected && (
        <rect
          x={-l / 2 - 0.12}
          y={-w / 2 - 0.12}
          width={l + 0.24}
          height={w + 0.24}
          fill="none"
          stroke={SELECT}
          strokeWidth={0.05}
          strokeDasharray="0.18 0.12"
        />
      )}
      <ObjectLabel x={0} y={w / 2 + 0.55} text={o.label} />
    </g>
  )
}

function ArrowShape({ o, selected, showLength }: { o: ArrowObject; selected: boolean; showLength?: boolean }) {
  const hex = COLOR_HEX[o.color]
  const stroke = strokeFor(hex)
  const dx = o.x2 - o.x1
  const dy = o.y2 - o.y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Arrowhead barbs.
  const head = 0.4
  const halfW = 0.24
  const baseX = o.x2 - ux * head
  const baseY = o.y2 - uy * head
  const barb = `${o.x2},${o.y2} ${baseX - uy * halfW},${baseY + ux * halfW} ${baseX + uy * halfW},${baseY - ux * halfW}`
  const midX = (o.x1 + o.x2) / 2
  const midY = (o.y1 + o.y2) / 2
  // Length readout sits just above the head
  const lenLabelX = o.x2
  const lenLabelY = o.y2 - 0.4
  return (
    <g>
      <line x1={o.x1} y1={o.y1} x2={baseX} y2={baseY} stroke={stroke} strokeWidth={0.1} strokeLinecap="round" />
      <polygon points={barb} fill={stroke} />
      {selected && (
        <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={SELECT} strokeWidth={0.04} strokeDasharray="0.16 0.12" />
      )}
      <ObjectLabel x={midX} y={midY - 0.25} text={o.label} />
      {showLength && <ObjectLabel x={lenLabelX} y={lenLabelY} text={formatInches(arrowLengthIn(o))} />}
    </g>
  )
}

function TextShape({ o, selected }: { o: TextObject; selected: boolean }) {
  return (
    <g>
      {selected && <circle cx={o.x} cy={o.y - 0.15} r={0.18} fill="none" stroke={SELECT} strokeWidth={0.04} />}
      <ObjectLabel x={o.x} y={o.y} text={o.label || 'Text'} />
    </g>
  )
}

function Shape({ o, selected, showArrowLength }: { o: SlideObject; selected: boolean; showArrowLength?: boolean }) {
  switch (o.kind) {
    case 'circle':
      return <CircleShape o={o} selected={selected} />
    case 'ellipse':
      return <EllipseShape o={o} selected={selected} />
    case 'rect':
      return <RectShape o={o} selected={selected} />
    case 'arrow':
      return <ArrowShape o={o} selected={selected} showLength={showArrowLength} />
    case 'text':
      return <TextShape o={o} selected={selected} />
  }
}

const WARN = '#ff9d2e'

/** Amber outline + badge marking an Equipment rect placed too close to another
 *  piece of equipment or to accessible terrain (see rules/equipment.ts). */
function EquipmentWarning({ o }: { o: RectObject }) {
  const l = o.lengthMm * IN_PER_MM
  const w = o.widthMm * IN_PER_MM
  const badgeY = o.y - w / 2 - 0.5
  return (
    <g style={{ pointerEvents: 'none' }}>
      <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotationDeg})`}>
        <rect
          x={-l / 2 - 0.09}
          y={-w / 2 - 0.09}
          width={l + 0.18}
          height={w + 0.18}
          fill="none"
          stroke={WARN}
          strokeWidth={0.07}
          strokeDasharray="0.16 0.1"
        />
      </g>
      <text
        x={o.x}
        y={badgeY}
        textAnchor="middle"
        fontSize={0.55}
        style={{ paintOrder: 'stroke' }}
        stroke="#0c0c10"
        strokeWidth={0.05}
        fill={WARN}
      >
        ⚠
      </text>
    </g>
  )
}

/** A polygon expanded outward by `clearance` inches, drawn as a keep-out halo.
 *  A round-joined stroke of width 2·clearance is exactly the Minkowski buffer
 *  the spacing rule measures (polygonPolygonDistance ≤ clearance), so the shaded
 *  ring marks precisely where the dragged equipment's edge may not enter. Full
 *  opacity inside the group, dimmed once by group opacity so overlaps stay even. */
function ClearanceHalo({ polygon, clearance }: { polygon: Polygon; clearance: number }) {
  const points = polygon.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <g style={{ opacity: 0.16 }}>
      <polygon
        points={points}
        fill={WARN}
        stroke={WARN}
        strokeWidth={2 * clearance}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  )
}

/** While an Equipment rect is being dragged, shade the keep-out zones around
 *  every other piece of equipment and every Accessible region so the user can
 *  see where a legal placement must stay clear of. Mirrors rules/equipment.ts:
 *  equipment↔equipment is 2" (Mines exempt on both sides); Accessible terrain is
 *  1" for a Ladder, 2" otherwise. */
export function EquipmentClearanceLayer({
  dragged,
  objects,
  accessibleRegions,
}: {
  dragged: RectObject
  objects: SlideObject[]
  accessibleRegions: Polygon[]
}) {
  const draggedName = equipmentName(dragged)
  if (!draggedName) return null
  const draggedIsMines = draggedName === 'Mines'
  const accessibleClearance = draggedName === 'Ladder' ? LADDER_ACCESSIBLE_SPACING_IN : EQUIPMENT_SPACING_IN

  const halos: { key: string; polygon: Polygon; clearance: number }[] = []

  // Other equipment: skip self, and skip Mines on either side (they are exempt).
  if (!draggedIsMines) {
    for (const o of objects) {
      if (o.id === dragged.id) continue
      const name = equipmentName(o)
      if (!name || name === 'Mines') continue
      halos.push({ key: `eq-${o.id}`, polygon: rectCorners(o as RectObject), clearance: EQUIPMENT_SPACING_IN })
    }
  }
  // Accessible terrain (access points, doors) always constrains equipment.
  accessibleRegions.forEach((region, i) => {
    if (region.length >= 3) halos.push({ key: `acc-${i}`, polygon: region, clearance: accessibleClearance })
  })

  return (
    <g style={{ pointerEvents: 'none' }}>
      {halos.map((h) => (
        <ClearanceHalo key={h.key} polygon={h.polygon} clearance={h.clearance} />
      ))}
    </g>
  )
}

/** A transparent, generously sized hit target so thin shapes are easy to grab. */
function HitTarget({ o }: { o: SlideObject }) {
  if (o.kind === 'arrow') {
    return <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke="transparent" strokeWidth={0.5} strokeLinecap="round" />
  }
  if (o.kind === 'text') {
    return <circle cx={o.x} cy={o.y - 0.15} r={0.6} fill="transparent" />
  }
  return null
}

/** Objects with a rotation, and the local half-extent (inches) their handle
 *  sits beyond so it clears the shape. */
function rotatableExtentX(o: RectObject | EllipseObject): number {
  return o.kind === 'rect' ? (o.lengthMm * IN_PER_MM) / 2 : (o.widthMm * IN_PER_MM) / 2
}

/** A draggable knob offset along the object's facing axis; dragging it spins the
 *  object about its centre. Shown on selected rotatable objects (rect, ellipse). */
function RotationHandle({
  o,
  onPointerDown,
}: {
  o: RectObject | EllipseObject
  onPointerDown?: (id: string, e: React.PointerEvent) => void
}) {
  const rad = (o.rotationDeg * Math.PI) / 180
  const ux = Math.cos(rad)
  const uy = Math.sin(rad)
  const extentX = rotatableExtentX(o)
  const gap = 0.5
  const handleX = o.x + ux * (extentX + gap)
  const handleY = o.y + uy * (extentX + gap)
  return (
    <>
      <line
        x1={o.x + ux * extentX}
        y1={o.y + uy * extentX}
        x2={handleX}
        y2={handleY}
        stroke={SELECT}
        strokeWidth={0.03}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={handleX}
        cy={handleY}
        r={0.16}
        fill={SELECT}
        stroke="#0c0c10"
        strokeWidth={0.03}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => onPointerDown?.(o.id, e)}
      />
    </>
  )
}

export function ObjectsLayer({
  objects,
  selectedId,
  interactive,
  draft,
  warningIds,
  onObjectPointerDown,
  onArrowHandlePointerDown,
  onRotateHandlePointerDown,
}: {
  objects: SlideObject[]
  selectedId?: string
  /** When false (placement tool active or locked), objects ignore pointer events. */
  interactive: boolean
  /** In-progress object being placed; rendered with reduced opacity. */
  draft?: SlideObject | null
  /** Ids of Equipment placed too close to other equipment / accessible terrain. */
  warningIds?: Set<string>
  onObjectPointerDown?: (id: string, e: React.PointerEvent) => void
  onArrowHandlePointerDown?: (id: string, end: 'start' | 'end', e: React.PointerEvent) => void
  onRotateHandlePointerDown?: (id: string, e: React.PointerEvent) => void
}) {
  return (
    <g>
      {objects.map((o) => {
        const selected = o.id === selectedId
        return (
          <g
            key={o.id}
            onPointerDown={interactive && onObjectPointerDown ? (e) => onObjectPointerDown(o.id, e) : undefined}
            style={{ cursor: interactive ? 'grab' : 'default', pointerEvents: interactive ? 'auto' : 'none' }}
          >
            {warningIds?.has(o.id) && o.kind === 'rect' && <EquipmentWarning o={o} />}
            <Shape o={o} selected={selected} />
            {interactive && <HitTarget o={o} />}
            {selected && interactive && o.kind === 'arrow' && (
              <>
                <circle
                  cx={o.x1}
                  cy={o.y1}
                  r={0.16}
                  fill={SELECT}
                  stroke="#0c0c10"
                  strokeWidth={0.03}
                  style={{ cursor: 'crosshair' }}
                  onPointerDown={(e) => onArrowHandlePointerDown?.(o.id, 'start', e)}
                />
                <circle
                  cx={o.x2}
                  cy={o.y2}
                  r={0.16}
                  fill={SELECT}
                  stroke="#0c0c10"
                  strokeWidth={0.03}
                  style={{ cursor: 'crosshair' }}
                  onPointerDown={(e) => onArrowHandlePointerDown?.(o.id, 'end', e)}
                />
              </>
            )}
            {selected && interactive && (o.kind === 'rect' || o.kind === 'ellipse') && (
              <RotationHandle o={o} onPointerDown={onRotateHandlePointerDown} />
            )}
          </g>
        )
      })}
      {draft && (
        <g style={{ opacity: 0.6, pointerEvents: 'none' }}>
          <Shape o={draft} selected={false} showArrowLength />
        </g>
      )}
    </g>
  )
}
