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
      <defs>
        {/* Define the striped pattern */}
        <pattern id="striped" width="2" height="2" patternTransform="rotate(55)" patternUnits="userSpaceOnUse">
          <rect width="1" height="2" fill="rgba(80,160,255,0.1)" />
          <rect x="1" width="1" height="2" fill="transparent" />
        </pattern>
      </defs>
      {dropZones.map((dz) => (
        <polygon
          key={dz.id}
          points={polyPoints(dz.polygon)}
          fill={dz.id === activeId ? 'url(#striped)' : 'transparent'}
          stroke={dz.id === activeId ? 'rgba(80,160,255,0.9)' : 'rgba(150,150,150,0.5)'}
          strokeWidth={0.05}
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
          transform={`translate(${o.center.x},${o.center.y})`}
        >
          <circle
            r={COVERAGE_DISK_RADIUS_IN}
            fill="none"
            stroke="rgba(255,140,40,0.35)"
            strokeWidth={0.04}
            strokeDasharray="0.18 0.12"
          />
          <circle
            r={OBJECTIVE_RADIUS_IN}
            fill={o.role === 'center' ? 'rgba(255,90,40,0.85)' : 'rgba(255,150,40,0.8)'}
            stroke={o.id === selectedId ? '#fff' : o.id === homeId ? '#7fd4ff' : '#30231a'}
            strokeWidth={o.id === homeId || o.id === selectedId ? 0.12 : 0.05}
          />
          <text
            textAnchor="middle"
            alignmentBaseline="middle"
            dominantBaseline="middle"
            fontSize={0.5}
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

/** The boundary of the points within radius of the TUNNEL.
 *  Drawn as either a stroked polyline or an outline only (no fill). */
export function TunnelAuraLayer({ chain, radius, fill = false }: { chain: Chain; radius: number; fill?: boolean }) {
  const path = chain.map((m) => `${m.x},${m.y}`).join(' ')
  const width = radius * 2
  const outline = 0.02
  return (
    <g>
      {fill && <defs>
        <mask
          id={`tunnel-reach-outline-${radius}`}
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
      </defs>}
      <polyline
        points={path}
        fill="none"
        stroke="rgba(150,90,220,0.3)"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(fill && { mask: `url(#tunnel-reach-outline-${radius})` })}
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
      }).reverse()}
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
