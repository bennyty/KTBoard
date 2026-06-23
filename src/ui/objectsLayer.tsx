import type { ArrowObject, CircleObject, RectObject, SlideObject, TextObject } from '@/model/types'
import { IN_PER_MM } from '@/model/constants'
import { arrowLengthIn, COLOR_HEX, formatInches } from '@/planning/objects'

/** Renders Slide Objects in killzone-inch coordinates (inside the Board's scaling <g>). */

const SELECT = '#ffffff'

/** Black reads as invisible on the dark board, so give it a light stroke. */
function strokeFor(color: string): string {
  return color === COLOR_HEX.black ? '#9a9aa6' : color
}

const LABEL_LINE_HEIGHT = 0.6

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
      <circle cx={o.x} cy={o.y} r={radius} fill={hex} fillOpacity={0.32} stroke={strokeFor(hex)} strokeWidth={0.06} />
      {selected && (
        <circle cx={o.x} cy={o.y} r={radius + 0.12} fill="none" stroke={SELECT} strokeWidth={0.05} strokeDasharray="0.18 0.12" />
      )}
      <ObjectLabel x={o.x} y={o.y + 0.18} text={o.label} />
    </>
  )
}

function RectShape({ o, selected }: { o: RectObject; selected: boolean }) {
  const hex = COLOR_HEX[o.color]
  const l = o.lengthMm * IN_PER_MM
  const w = o.widthMm * IN_PER_MM
  return (
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotationDeg})`}>
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
    case 'rect':
      return <RectShape o={o} selected={selected} />
    case 'arrow':
      return <ArrowShape o={o} selected={selected} showLength={showArrowLength} />
    case 'text':
      return <TextShape o={o} selected={selected} />
  }
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

export function ObjectsLayer({
  objects,
  selectedId,
  interactive,
  draft,
  onObjectPointerDown,
  onArrowHandlePointerDown,
}: {
  objects: SlideObject[]
  selectedId?: string
  /** When false (placement tool active or locked), objects ignore pointer events. */
  interactive: boolean
  /** In-progress object being placed; rendered with reduced opacity. */
  draft?: SlideObject | null
  onObjectPointerDown?: (id: string, e: React.PointerEvent) => void
  onArrowHandlePointerDown?: (id: string, end: 'start' | 'end', e: React.PointerEvent) => void
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
