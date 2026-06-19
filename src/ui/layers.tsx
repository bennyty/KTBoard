import type { Chain, DropZone, Objective, PieceKind, Vec, WorldPiece } from '@/model/types'
import {
  COVERAGE_DISK_RADIUS_IN,
  COVERAGE_RANGE_IN,
  MARKER_RADIUS_IN,
  OBJECTIVE_RADIUS_IN,
  UNBURROW_CONTROL_RANGE_IN,
} from '@/model/constants'
import { gridFor } from '@/geometry/grid'

/** All layer components render in killzone-inch coordinates; the parent
 *  board wraps them in the pixel-scaling <g transform>. */

const polyPoints = (poly: Vec[]) => poly.map((p) => `${p.x},${p.y}`).join(' ')

function terrainFill(piece: WorldPiece): string {
  switch (piece.kind) {
    case 'stronghold':
      return 'rgba(40,40,48,0.45)'
    case 'wall':
      return 'rgba(150,150,160,0.85)'
    case 'pillar':
      return 'rgba(110,110,125,0.85)'
    default:
      return 'rgba(60,70,60,0.5)'
  }
}

function terrainStroke(piece: WorldPiece, selectedId?: string): string {
  if (piece.kind === 'wall' || piece.kind === 'pillar') { return 'transparent' }
  return piece.pieceId === selectedId ? '#ffd54a' : 'rgba(230,230,230,0.8)'
}

export function TerrainLayer({ pieces, selectedId, onPiecePointerDown }: {
  pieces: WorldPiece[]
  selectedId?: string
  onPiecePointerDown?: (pieceId: string, e: React.PointerEvent) => void
}) {
  return (
    <g>
      {pieces.map((piece, i) => (
        <g
          key={`${piece.pieceId}-${i}`}
          onPointerDown={onPiecePointerDown ? (e) => onPiecePointerDown(piece.pieceId, e) : undefined}
          style={onPiecePointerDown ? { cursor: 'grab' } : undefined}
        >
          <polygon
            points={polyPoints(piece.outer)}
            fill={terrainFill(piece)}
            stroke={terrainStroke(piece, selectedId)}
            strokeWidth={0.05}
          />
          {piece.innerFloor && (
            <polygon
              points={polyPoints(piece.innerFloor)}
              fill="rgba(190,190,200,0.25)"
              stroke="rgba(230,230,230,0.6)"
              strokeWidth={0.05}
            />
          )}
        </g>
      ))}
    </g>
  )
}

export function DropZoneLayer({ dropZones, activeId }: { dropZones: DropZone[]; activeId?: string }) {
  return (
    <g>
      {dropZones.map((dz) => (
        <polygon
          key={dz.id}
          points={polyPoints(dz.polygon)}
          fill={dz.id === activeId ? 'rgba(80,160,255,0.18)' : 'rgba(120,120,120,0.08)'}
          stroke={dz.id === activeId ? 'rgba(80,160,255,0.9)' : 'rgba(150,150,150,0.5)'}
          strokeWidth={0.06}
          strokeDasharray="0.3 0.18"
        />
      ))}
    </g>
  )
}

export function ObjectiveLayer({ objectives, homeId, onObjectivePointerDown, selectedId }: {
  objectives: Objective[]
  homeId?: string
  selectedId?: string
  onObjectivePointerDown?: (id: string, e: React.PointerEvent) => void
}) {
  return (
    <g>
      {objectives.map((o) => (
        <g
          key={o.id}
          onPointerDown={onObjectivePointerDown ? (e) => onObjectivePointerDown(o.id, e) : undefined}
          style={onObjectivePointerDown ? { cursor: 'grab' } : undefined}
        >
          <circle
            cx={o.center.x}
            cy={o.center.y}
            r={COVERAGE_DISK_RADIUS_IN}
            fill="none"
            stroke="rgba(255,140,40,0.35)"
            strokeWidth={0.04}
            strokeDasharray="0.18 0.12"
          />
          <circle
            cx={o.center.x}
            cy={o.center.y}
            r={OBJECTIVE_RADIUS_IN}
            fill={o.role === 'center' ? 'rgba(255,90,40,0.85)' : 'rgba(255,150,40,0.8)'}
            stroke={o.id === selectedId ? '#fff' : o.id === homeId ? '#7fd4ff' : '#30231a'}
            strokeWidth={o.id === homeId || o.id === selectedId ? 0.12 : 0.05}
          />
          <text
            x={o.center.x}
            y={o.center.y + 0.14}
            textAnchor="middle"
            fontSize={0.42}
            fill="#1b1208"
            style={{ pointerEvents: 'none', fontWeight: 700 }}
          >
            {o.role === 'center' ? 'C' : o.id === homeId ? 'H' : ''}
          </text>
        </g>
      ))}
    </g>
  )
}

/** The set of points within COVERAGE_RANGE_IN of the TUNNEL. The tunnel region
 *  is the chain stroked at MARKER_RADIUS_IN (see distToTunnel); widening that
 *  stroke by COVERAGE_RANGE_IN yields exactly the 2" aura, rounded caps and all. */
export function TunnelTremorscytheAuraLayer({ chain }: { chain: Chain }) {
  const path = chain.map((m) => `${m.x},${m.y}`).join(' ')
  return (
    <polyline
      points={path}
      fill="none"
      stroke="rgba(150,90,220,0.18)"
      strokeWidth={(MARKER_RADIUS_IN + COVERAGE_RANGE_IN) * 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/** The boundary of the points within REACH_RANGE_IN of the TUNNEL, drawn as an
 *  outline only (no fill). A stroked polyline fills the whole band, so we mask it
 *  with a slightly narrower band to leave just the perimeter ring. */
export function TunnelUnburrowReachLayer({ chain }: { chain: Chain }) {
  const path = chain.map((m) => `${m.x},${m.y}`).join(' ')
  const width = (MARKER_RADIUS_IN + UNBURROW_CONTROL_RANGE_IN) * 2
  const outline = 0.02
  return (
    <g>
      <defs>
        <mask
          id="tunnel-reach-outline"
          // The mask region must cover the full stroked band. objectBoundingBox (default) ignores stroke width, clipping the band to the centerline bbox
          maskUnits="userSpaceOnUse"
        >
          <polyline
            points={path}
            fill="none"
            stroke="white"
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={path}
            fill="none"
            stroke="black"
            strokeWidth={width - 2 * outline}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <polyline
        points={path}
        fill="none"
        stroke="rgba(150,90,220,0.9)"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        mask="url(#tunnel-reach-outline)"
      />
    </g>
  )
}

export function TunnelLayer({ chain, invalidMarkers, onMarkerPointerDown }: {
  chain: Chain
  invalidMarkers?: Set<number>
  onMarkerPointerDown?: (index: number, e: React.PointerEvent) => void
}) {
  const path = chain.map((m) => `${m.x},${m.y}`).join(' ')
  return (
    <g>
      <polyline
        points={path}
        fill="none"
        stroke="rgba(150,90,220,0.45)"
        strokeWidth={MARKER_RADIUS_IN * 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {chain.map((m, i) => {
        const invalid = invalidMarkers?.has(i)
        return (
          <g
            key={i}
            onPointerDown={onMarkerPointerDown ? (e) => onMarkerPointerDown(i, e) : undefined}
            style={onMarkerPointerDown ? { cursor: 'grab' } : undefined}
          >
            <circle
              cx={m.x}
              cy={m.y}
              r={MARKER_RADIUS_IN}
              fill={invalid ? '#e23b3b' : '#9050e0'}
              stroke={invalid ? '#ffd0d0' : '#e8d8ff'}
              strokeWidth={0.06}
            />
            <circle cx={m.x} cy={m.y} r={MARKER_RADIUS_IN * 2.2} fill="transparent" />
            <text
              x={m.x}
              y={m.y + 0.12}
              textAnchor="middle"
              fontSize={0.36}
              fill="#fff"
              style={{ pointerEvents: 'none', fontWeight: 700 }}
            >
              {i}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** Verification grid for calibration, and (density=2) the half-grid snap lattice
 *  for placing walls and pillars. */
export function GridLayer({
  killzone,
  widthIn,
  heightIn,
  density = 1,
}: {
  killzone: string
  widthIn: number
  heightIn: number
  density?: 1 | 2
}) {
  const lines = []
  const grid = gridFor(killzone)
  if (grid) {
    const step = grid.stepIn / density
    let n = 0
    for (let x = grid.offsetIn; x <= widthIn + 1e-6; x += step, n++) {
      lines.push(<line key={`v${n}`} x1={x} y1={0} x2={x} y2={heightIn} />)
    }
    n = 0
    for (let y = grid.offsetIn; y <= heightIn + 1e-6; y += step, n++) {
      lines.push(<line key={`h${n}`} x1={0} y1={y} x2={widthIn} y2={y} />)
    }
    return <g stroke="rgba(80,220,120,0.5)" strokeWidth={0.02}>{lines}</g>
  }
  if (killzone === 'volkus') {
    for (let x = 0; x <= widthIn; x++) {
      lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={heightIn} />)
    }
    for (let y = 0; y <= heightIn; y++) {
      lines.push(<line key={`h${y}`} x1={0} y1={y} x2={widthIn} y2={y} />)
    }
    return <g stroke="rgba(80,220,120,0.5)" strokeWidth={0.02}>{lines}</g>
  }
  return null
}
