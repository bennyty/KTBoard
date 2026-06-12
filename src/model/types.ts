/** All geometry is in killzone inches, origin top-left, y down.
 *  Pixels appear only at I/O boundaries (calibration UI, pointer events). */

export interface Vec {
  x: number
  y: number
}

/** Vertices in order; closed implicitly (last connects to first). */
export type Polygon = Vec[]

export type PieceKind = 'stronghold' | 'ruin' | 'rubble'

export interface PieceDef {
  id: string
  name: string
  kind: PieceKind
  /** Footprint in piece-local inches (origin = rotation pivot). For
   *  strongholds this is the outer-extent polygon (wall ring outline). */
  outer: Polygon
  /** Strongholds only: open floor inside the walls. Markers may be placed
   *  wholly inside this; the ring between outer and innerFloor is blocked. */
  innerFloor?: Polygon
}

export interface KillzoneCatalogue {
  killzone: string
  widthIn: number
  heightIn: number
  pieces: PieceDef[]
}

export interface PiecePlacement {
  pieceId: string
  x: number
  y: number
  rotationDeg: number
}

export type AnchorEdge = 'left' | 'right' | 'top' | 'bottom'

export interface DropZone {
  id: string
  name: string
  polygon: Polygon
  anchorEdge: AnchorEdge
}

export type ObjectiveRole = 'center' | 'other'

export interface Objective {
  id: string
  role: ObjectiveRole
  center: Vec
  /** Human-readable label for the annotation UI; falls back to id. */
  name?: string
}

export interface AnnotatedMap {
  id: string
  name: string
  killzone: string
  /** Layout image URL (decoration after calibration). */
  image: string
  widthIn: number
  heightIn: number
  /** Pixel↔inch calibration: px = originPx + inch * pxPerInch (per axis). */
  pxPerInchX: number
  pxPerInchY: number
  originPx: Vec
  placements: PiecePlacement[]
  dropZones: DropZone[]
  objectives: Objective[]
  /** True while the annotation is approximate / unverified. */
  draft?: boolean
  notes?: string
}

/** Five Tunnel marker positions, index = marker number. */
export type Chain = Vec[]

export interface Scores {
  /** Distinct terrain pieces crossed by between-segments. Higher = better. */
  zigzag: number
  /** Smallest N (0–4) whose partial TUNNEL reaches center obj control range; 5 = never. Lower = better. */
  centerAccess: number
  /** Objectives whose control-range disk lies wholly within 2" of the TUNNEL. Higher = better. */
  coverage: number
  /** Min distance (in) from home objective centre to a valid unburrow base centre. Lower = better. */
  homeUnburrow: number
  /** Max perpendicular distance (in) from anchor edge to any marker. Higher = better. */
  forwardReach: number
}

export const SCORE_AXES: { key: keyof Scores; label: string; higherIsBetter: boolean }[] = [
  { key: 'zigzag', label: 'Zigzag', higherIsBetter: true },
  { key: 'centerAccess', label: 'Center obj access', higherIsBetter: false },
  { key: 'coverage', label: 'Objective coverage', higherIsBetter: true },
  { key: 'homeUnburrow', label: 'Home obj unburrow', higherIsBetter: false },
  { key: 'forwardReach', label: 'Forward reach', higherIsBetter: true },
]

export interface Plan {
  mapId: string
  dropZoneId: string
  markers: Chain
}

export interface ScoredPlan extends Plan {
  scores: Scores
  /** Axis keys this plan is best at among the presented set. */
  wins: (keyof Scores)[]
}

/** A terrain piece resolved to world (killzone) inches. */
export interface WorldPiece {
  pieceId: string
  name: string
  kind: PieceKind
  outer: Polygon
  innerFloor?: Polygon
  /** Precomputed outer bounding box for cheap rejection. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}
