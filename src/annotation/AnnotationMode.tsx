import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PIECE_KINDS,
  type AnchorEdge,
  type AnnotatedMap,
  type KillzoneCatalogue,
  type Objective,
  type PieceDef,
  type PieceKind,
  type PiecePlacement,
  type Polygon,
  type Vec,
} from '@/model/types'
import { IN_PER_MM, WALL_ACCESS_WIDTHS_MM } from '@/model/constants'
import { catalogues, DEFAULT_MAP, getMap, maps } from '@/data/registry'
import { calibrate, inchesToPx } from '@/geometry/transform'
import { pointInPolygon, polygonCentroid, polygonToLocal, resolvePiece } from '@/geometry/polygon'
import {
  PILLAR_DEF_ID,
  WALL_DEF_ID,
  gridFor,
  makePillarDef,
  makeWallAccessDef,
  makeWallDef,
  snapPillar,
  snapToFineIntersection,
  snapWall,
  wallAccessDefId,
} from '@/geometry/grid'
import { rotateDeg, sub, add } from '@/geometry/vec'
import { Board, mapTransform } from '@/ui/Board'
import { DropZoneLayer, GridLayer, ObjectiveLayer, TerrainLayer } from '@/ui/layers'
import { useImageSize } from '@/ui/useImageSize'
import {
  Button,
  ErrorText,
  Field,
  Hint,
  Input,
  List,
  ListItem,
  Row,
  Section,
  Select,
  Sidebar,
  Textarea,
} from '@/ui/components'

type Tab = 'calibrate' | 'pieces' | 'place' | 'zones' | 'objectives' | 'walls' | 'export'

const LOUPE_R = 2
const LOUPE_ZOOM = 4
const LOUPE_OFFSET_X = LOUPE_R * 1.6
const LOUPE_OFFSET_Y = -LOUPE_R * 0.4

interface TraceLoupeProps {
  image: string
  imgSize: { width: number; height: number }
  map: AnnotatedMap
  cursor: Vec
  vertex: Vec
  /** Previous vertex, if any; used to show the distance from the dragged point. */
  refPoint: Vec | null
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function TraceLoupe({ image, imgSize, map, cursor, vertex, refPoint }: TraceLoupeProps) {
  // Canvas bounds in inch-coordinate space
  const canvasMinX = -map.originPx.x / map.pxPerInchX
  const canvasMaxX = (imgSize.width - map.originPx.x) / map.pxPerInchX
  const canvasMinY = -map.originPx.y / map.pxPerInchY
  const canvasMaxY = (imgSize.height - map.originPx.y) / map.pxPerInchY

  // Prefer loupe to the right; flip left if right edge would clip it.
  let lx = cursor.x + LOUPE_OFFSET_X
  if (lx + LOUPE_R > canvasMaxX) lx = cursor.x - LOUPE_OFFSET_X
  lx = clamp(lx, canvasMinX + LOUPE_R, canvasMaxX - LOUPE_R)

  // Prefer loupe slightly above; flip below if top edge would clip it.
  let ly = cursor.y + LOUPE_OFFSET_Y
  if (ly - LOUPE_R < canvasMinY) ly = cursor.y - LOUPE_OFFSET_Y
  ly = clamp(ly, canvasMinY + LOUPE_R, canvasMaxY - LOUPE_R)

  // Image in inch-coordinate space (matching the Board <g> transform)
  const imageX = -map.originPx.x / map.pxPerInchX
  const imageY = -map.originPx.y / map.pxPerInchY
  const imageW = imgSize.width / map.pxPerInchX
  const imageH = imgSize.height / map.pxPerInchY
  const gap = 0.12

  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id="trace-loupe-clip">
          <circle cx={lx} cy={ly} r={LOUPE_R} />
        </clipPath>
      </defs>
      <circle cx={lx} cy={ly} r={LOUPE_R} fill="#0c0c10" />
      <g clipPath="url(#trace-loupe-clip)">
        <image
          href={image}
          x={lx + (imageX - vertex.x) * LOUPE_ZOOM}
          y={ly + (imageY - vertex.y) * LOUPE_ZOOM}
          width={imageW * LOUPE_ZOOM}
          height={imageH * LOUPE_ZOOM}
          imageRendering="pixelated"
        />
        <line x1={lx - LOUPE_R} y1={ly} x2={lx - gap} y2={ly} stroke="rgba(255,60,60,0.9)" strokeWidth={0.03} />
        <line x1={lx + gap} y1={ly} x2={lx + LOUPE_R} y2={ly} stroke="rgba(255,60,60,0.9)" strokeWidth={0.03} />
        <line x1={lx} y1={ly - LOUPE_R} x2={lx} y2={ly - gap} stroke="rgba(255,60,60,0.9)" strokeWidth={0.03} />
        <line x1={lx} y1={ly + gap} x2={lx} y2={ly + LOUPE_R} stroke="rgba(255,60,60,0.9)" strokeWidth={0.03} />
      </g>
      <circle cx={lx} cy={ly} r={LOUPE_R} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.06} />
      {refPoint &&
        (() => {
          const distIn = Math.hypot(vertex.x - refPoint.x, vertex.y - refPoint.y)
          const distMm = distIn / IN_PER_MM
          const ty = ly + LOUPE_R + 0.5
          return (
            <text
              x={lx}
              y={ty}
              textAnchor="middle"
              fontSize={0.42}
              fill="#fff"
              stroke="#0c0c10"
              strokeWidth={0.09}
              paintOrder="stroke"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              Dist from last point: {distMm.toFixed(1)} mm · {distIn.toFixed(3)}″
            </text>
          )
        })()}
    </g>
  )
}

const blankMap: AnnotatedMap = {
  id: 'new-map',
  name: 'New map',
  killzone: 'volkus',
  image: '/KTBoard/maps/Volkus/Volkus1.jpg',
  widthIn: 30,
  heightIn: 22,
  pxPerInchX: 20,
  pxPerInchY: 20,
  originPx: { x: 0, y: 0 },
  placements: [],
  dropZones: [],
  objectives: [],
  draft: true,
}

export function AnnotationMode() {
  const [draftMap, setDraftMap] = useState<AnnotatedMap>(() => structuredClone(DEFAULT_MAP))
  const [draftCatalogue, setDraftCatalogue] = useState<KillzoneCatalogue>(() =>
    structuredClone(catalogues[DEFAULT_MAP.killzone]),
  )
  const [tab, setTab] = useState<Tab>('pieces')

  // Calibration state
  const [cornerA, setCornerA] = useState<Vec | null>(null) // image px
  const [showGrid, setShowGrid] = useState(false)
  const [cursorIn, setCursorIn] = useState<Vec | null>(null)
  const [showCursorCircles, setShowCursorCircles] = useState(false)

  // Tracing state
  const [tracePieceName, setTracePieceName] = useState<string>('')
  const [tracePieceKind, setTracePieceKind] = useState<PieceKind>('rubble')
  const [traceTarget, setTraceTarget] = useState<'outer' | 'innerFloor' | 'accessible'>('outer')
  const [traceShape, setTraceShape] = useState<'polygon' | 'rectangle'>('polygon')
  const [traceVertices, setTraceVertices] = useState<Polygon>([]) // world inches

  // Placement / objective selection + dragging
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null)
  const dragPiece = useRef<{ pieceId: string; offset: Vec } | null>(null)
  const dragObjective = useRef<string | null>(null)
  const dragTraceVertexIndex = useRef<number | null>(null)

  // Drop zone drawing
  const [zoneVertices, setZoneVertices] = useState<Polygon>([])
  const [zoneAnchor, setZoneAnchor] = useState<AnchorEdge>('left')
  const [zoneName, setZoneName] = useState('')

  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [draggingVertex, setDraggingVertex] = useState(false)

  // Grid-aligned walls & pillars
  const [wallMode, setWallMode] = useState<'wall' | 'wallAccess' | 'pillar'>('wall')
  // Which of the killzone's named door-gap widths a new "Wall (accessible)"
  // placement carries (Tomb World's kit has two distinct sizes).
  const [wallAccessWidthMm, setWallAccessWidthMm] = useState<number>(
    WALL_ACCESS_WIDTHS_MM[draftMap.killzone]?.[0]?.widthMm ?? 0,
  )
  const wallAccessOptions = WALL_ACCESS_WIDTHS_MM[draftMap.killzone] ?? []
  const grid = gridFor(draftMap.killzone)

  // Switching killzone may invalidate the selected width; fall back to that
  // killzone's first named variant.
  useEffect(() => {
    const options = WALL_ACCESS_WIDTHS_MM[draftMap.killzone] ?? []
    if (!options.some((o) => o.widthMm === wallAccessWidthMm)) {
      setWallAccessWidthMm(options[0]?.widthMm ?? 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftMap.killzone])

  const imgSize = useImageSize(draftMap.image)

  const pieces = useMemo(() => {
    const defs = new Map(draftCatalogue.pieces.map((p) => [p.id, p]))
    return draftMap.placements.flatMap((pl) => {
      const def = defs.get(pl.pieceId)
      return def ? [resolvePiece(def, pl)] : []
    })
  }, [draftMap, draftCatalogue])

  const t = mapTransform(draftMap)

  // Seed the canonical wall/pillar defs into the catalogue when the walls tab
  // is opened (covers blank / gallowdark catalogues that lack them).
  useEffect(() => {
    if (tab !== 'walls') return
    setDraftCatalogue((c) => {
      const have = new Set(c.pieces.map((p) => p.id))
      const missing: PieceDef[] = []
      if (!have.has(draftMap.killzone + WALL_DEF_ID)) missing.push(makeWallDef(draftMap.killzone))
      for (const { widthMm } of WALL_ACCESS_WIDTHS_MM[draftMap.killzone] ?? []) {
        if (!have.has(wallAccessDefId(draftMap.killzone, widthMm))) {
          missing.push(makeWallAccessDef(draftMap.killzone, widthMm))
        }
      }
      if (!have.has(draftMap.killzone + PILLAR_DEF_ID)) missing.push(makePillarDef(draftMap.killzone))
      
      console.log(missing)
      return missing.length ? { ...c, pieces: [...c.pieces, ...missing] } : c
    })
  }, [tab])

  /** Index of the wall/pillar placement whose footprint contains `inches`, or -1.
   *  Scoped to wall/pillar kinds so real terrain is never hit by the eraser. */
  function wallPillarHitIndex(inches: Vec): number {
    const defs = new Map(draftCatalogue.pieces.map((p) => [p.id, p]))
    return draftMap.placements.findIndex((pl) => {
      const def = defs.get(pl.pieceId)
      if (!def || (def.kind !== 'wall' && def.kind !== 'pillar')) return false
      return pointInPolygon(inches, resolvePiece(def, pl).outer)
    })
  }

  function removeWallsAndPillars() {
    const wpIds = new Set(
      draftCatalogue.pieces.filter((p) => p.kind === 'wall' || p.kind === 'pillar').map((p) => p.id),
    )
    setDraftMap((m) => ({ ...m, placements: m.placements.filter((pl) => !wpIds.has(pl.pieceId)) }))
  }

  function patchMap(patch: Partial<AnnotatedMap>) {
    setDraftMap((m) => ({ ...m, ...patch }))
  }

  // Rounding keeps the editable fields readable without losing meaningful precision.
  const r3 = (n: number) => Math.round(n * 1000) / 1000
  const r4 = (n: number) => Math.round(n * 10000) / 10000

  // ---- Fine-tune helpers (shared by the numeric editors and nudge buttons) ----

  function nudgeCalibration(patch: {
    pxPerInchX?: number
    pxPerInchY?: number
    originX?: number
    originY?: number
  }) {
    setDraftMap((m) => ({
      ...m,
      pxPerInchX: r4(m.pxPerInchX + (patch.pxPerInchX ?? 0)),
      pxPerInchY: r4(m.pxPerInchY + (patch.pxPerInchY ?? 0)),
      originPx: {
        x: r3(m.originPx.x + (patch.originX ?? 0)),
        y: r3(m.originPx.y + (patch.originY ?? 0)),
      },
    }))
  }

  function nudgePlacement(pieceId: string, dx: number, dy: number) {
    patchPlacement(pieceId, (pl) => ({ x: r3(pl.x + dx), y: r3(pl.y + dy) }))
  }

  function setPieceKind(pieceId: string, kind: PieceKind) {
    setDraftCatalogue((c) => ({
      ...c,
      pieces: c.pieces.map((p) => {
        if (p.id !== pieceId) return p
        // Strongholds carry an inner-floor polygon; other kinds don't.
        return kind === 'stronghold' ? { ...p, kind } : { ...p, kind, innerFloor: undefined }
      }),
    }))
  }

  /** Uniformly scale a piece's footprint about its local pivot to fine-tune size. */
  function scaleFootprint(pieceId: string, factor: number) {
    setDraftCatalogue((c) => ({
      ...c,
      pieces: c.pieces.map((p) =>
        p.id === pieceId
          ? {
              ...p,
              outer: p.outer.map((v) => ({ x: r4(v.x * factor), y: r4(v.y * factor) })),
              innerFloor: p.innerFloor?.map((v) => ({ x: r4(v.x * factor), y: r4(v.y * factor) })),
              accessible: p.accessible?.map((poly) =>
                poly.map((v) => ({ x: r4(v.x * factor), y: r4(v.y * factor) })),
              ),
            }
          : p,
      ),
    }))
  }

  /** Drop all Accessible regions from a piece (tracing only appends). */
  function clearAccessible(pieceId: string) {
    setDraftCatalogue((c) => ({
      ...c,
      pieces: c.pieces.map((p) => (p.id === pieceId ? { ...p, accessible: undefined } : p)),
    }))
  }

  function nudgeObjective(id: string, dx: number, dy: number) {
    setDraftMap((m) => ({
      ...m,
      objectives: m.objectives.map((o) =>
        o.id === id ? { ...o, center: { x: r3(o.center.x + dx), y: r3(o.center.y + dy) } } : o,
      ),
    }))
  }

  // ---- Calibration ----

  function onCalibrateClick(inches: Vec) {
    const px = inchesToPx(t, inches)
    if (!cornerA) {
      setCornerA(px)
    } else {
      const cal = calibrate(cornerA, px, draftMap.widthIn, draftMap.heightIn)
      patchMap({ originPx: cal.originPx, pxPerInchX: cal.pxPerInchX, pxPerInchY: cal.pxPerInchY })
      setCornerA(null)
      setShowGrid(true)
    }
  }

  // ---- Tracing ----

  function commitTrace(vertices: Polygon) {
    const name = tracePieceName.trim()
    if (!name || vertices.length < 3) return

    const existingDef = draftCatalogue.pieces.find((p) => p.name === name)
    const pieceId = existingDef?.id ?? `piece-${Date.now()}`
    const existing = draftMap.placements.find((pl) => pl.pieceId === pieceId)

    // Accessible regions accumulate (a piece may have several); outer and
    // innerFloor are single polygons and are replaced.
    const applyTarget = (p: PieceDef, local: Polygon): PieceDef =>
      traceTarget === 'accessible'
        ? { ...p, kind: tracePieceKind, accessible: [...(p.accessible ?? []), local] }
        : { ...p, kind: tracePieceKind, [traceTarget]: local }

    if (!existingDef) {
      const pivot = polygonCentroid(vertices)
      const local = polygonToLocal(vertices, pivot)
      const newPiece: PieceDef = { id: pieceId, name, kind: tracePieceKind, outer: local }
      setDraftCatalogue((c) => ({ ...c, pieces: [...c.pieces, newPiece] }))
      setDraftMap((m) => ({
        ...m,
        placements: [...m.placements, { pieceId, x: pivot.x, y: pivot.y, rotationDeg: 0 }],
      }))
    } else if (existing) {
      const origin = { x: existing.x, y: existing.y }
      const local = vertices.map((v) => rotateDeg(sub(v, origin), -existing.rotationDeg))
      setDraftCatalogue((c) => ({
        ...c,
        pieces: c.pieces.map((p) => (p.id === pieceId ? applyTarget(p, local) : p)),
      }))
    } else {
      const pivot = polygonCentroid(vertices)
      const local = polygonToLocal(vertices, pivot)
      setDraftCatalogue((c) => ({
        ...c,
        pieces: c.pieces.map((p) => (p.id === pieceId ? applyTarget(p, local) : p)),
      }))
      setDraftMap((m) => ({
        ...m,
        placements: [...m.placements, { pieceId, x: pivot.x, y: pivot.y, rotationDeg: 0 }],
      }))
    }
    setTraceVertices([])
  }

  function finishTrace() {
    commitTrace(traceVertices)
  }

  /** Build a 4-vertex rectangle polygon from two opposite corners. */
  function rectFromCorners(a: Vec, b: Vec): Polygon {
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
      { x: a.x, y: b.y },
    ]
  }

  // ---- Board pointer routing ----

  const VERTEX_HIT_R = 0.2

  function onBoardPointerDown(inches: Vec, e: React.PointerEvent<SVGSVGElement>) {
    if (tab === 'calibrate') onCalibrateClick(inches)
    else if (tab === 'pieces' && tracePieceName.trim()) {
      const hitIdx = traceVertices.findIndex(
        (v) => Math.hypot(v.x - inches.x, v.y - inches.y) < VERTEX_HIT_R,
      )
      if (hitIdx !== -1) {
        dragTraceVertexIndex.current = hitIdx
        setDraggingVertex(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (traceShape === 'rectangle') {
        // Two clicks on opposite corners define the rectangle.
        if (traceVertices.length === 0) setTraceVertices([inches])
        else commitTrace(rectFromCorners(traceVertices[0], inches))
      } else {
        setTraceVertices((v) => [...v, inches])
      }
    } else if (tab === 'walls' && grid) {
      const hit = wallPillarHitIndex(inches)
      if (hit !== -1) {
        setDraftMap((m) => ({ ...m, placements: m.placements.filter((_, k) => k !== hit) }))
      } else if (wallMode === 'pillar') {
        const c = snapPillar(inches, grid)
        setDraftMap((m) => ({
          ...m,
          placements: [...m.placements, { pieceId: draftMap.killzone + PILLAR_DEF_ID, x: c.x, y: c.y, rotationDeg: 0 }],
        }))
      } else {
        const { center, rotationDeg } = snapWall(inches, grid)
        const wallDefId =
          wallMode === 'wallAccess'
            ? wallAccessDefId(draftMap.killzone, wallAccessWidthMm)
            : draftMap.killzone + WALL_DEF_ID
        setDraftMap((m) => ({
          ...m,
          placements: [...m.placements, { pieceId: wallDefId, x: center.x, y: center.y, rotationDeg }],
        }))
      }
    } else if (tab === 'zones') setZoneVertices((v) => [...v, inches])
    else if (tab === 'objectives' && !dragObjective.current) {
      const id = `obj-${Date.now() % 100000}`
      setDraftMap((m) => ({
        ...m,
        objectives: [...m.objectives, { id, role: 'other', center: inches }],
      }))
      setSelectedObjectiveId(id)
    }
  }

  function onBoardPointerMove(pointerPos: Vec) {
    setCursorIn(pointerPos)
    if (dragTraceVertexIndex.current !== null) {
      const i = dragTraceVertexIndex.current
      setTraceVertices((v) => v.map((p, k) => (k === i ? pointerPos : p)))
      return
    }
    if (dragPiece.current) {
      const { pieceId, offset } = dragPiece.current
      const pos = add(pointerPos, offset)
      setDraftMap((m) => ({
        ...m,
        placements: m.placements.map((pl) => (pl.pieceId === pieceId ? { ...pl, x: pos.x, y: pos.y } : pl)),
      }))
    } else if (dragObjective.current) {
      const id = dragObjective.current
      // On gridded killzones, snap the objective centre to grid intersections.
      const center = grid ? snapToFineIntersection(pointerPos, grid) : pointerPos
      setDraftMap((m) => ({
        ...m,
        objectives: m.objectives.map((o) => (o.id === id ? { ...o, center } : o)),
      }))
    }
  }

  function onBoardPointerUp() {
    if (dragTraceVertexIndex.current !== null) setDraggingVertex(false)
    dragTraceVertexIndex.current = null
    dragPiece.current = null
    dragObjective.current = null
  }

  function onPiecePointerDown(pieceId: string, e: React.PointerEvent) {
    if (tab !== 'place') return
    e.stopPropagation()
    setSelectedPieceId(pieceId)
    const pl = draftMap.placements.find((p) => p.pieceId === pieceId)
    if (!pl) return
    const svg = (e.target as Element).closest('svg') as SVGSVGElement
    svg?.setPointerCapture(e.pointerId)
    // Offset between placement origin and pointer, so the piece doesn't jump.
    const offset = cursorIn ? sub({ x: pl.x, y: pl.y }, cursorIn) : { x: 0, y: 0 }
    dragPiece.current = { pieceId, offset }
  }

  function onObjectivePointerDown(id: string, e: React.PointerEvent) {
    if (tab !== 'objectives') return
    e.stopPropagation()
    setSelectedObjectiveId(id)
    dragObjective.current = id
    ;((e.target as Element).closest('svg') as SVGSVGElement)?.setPointerCapture(e.pointerId)
  }

  function rotateSelected(deg: number) {
    if (!selectedPieceId) return
    patchPlacement(selectedPieceId, (pl) => ({
      rotationDeg: Math.round((pl.rotationDeg + deg) * 10) / 10,
    }))
  }

  // Press "r" to rotate the selected piece 90° while placing.
  useEffect(() => {
    if (tab !== 'place' || !selectedPieceId) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'r' && e.key !== 'R') return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      e.preventDefault()
      if (e.key === 'r') {rotateSelected(90)}
      if (e.key === 'R') {rotateSelected(-90)}
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tab, selectedPieceId])

  function patchPlacement(pieceId: string, patch: (pl: PiecePlacement) => Partial<PiecePlacement>) {
    setDraftMap((m) => ({
      ...m,
      placements: m.placements.map((pl) => (pl.pieceId === pieceId ? { ...pl, ...patch(pl) } : pl)),
    }))
  }

  function renamePiece(pieceId: string, name: string) {
    setDraftCatalogue((c) => ({
      ...c,
      pieces: c.pieces.map((p) => (p.id === pieceId ? { ...p, name } : p)),
    }))
  }

  function download(filename: string, data: object) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function applyImport() {
    setImportError(null)
    try {
      const parsed = JSON.parse(importText)
      if (Array.isArray(parsed.pieces)) setDraftCatalogue(parsed as KillzoneCatalogue)
      else if (Array.isArray(parsed.placements)) setDraftMap(parsed as AnnotatedMap)
      else setImportError('JSON is neither an annotated map nor a piece catalogue')
    } catch (e) {
      setImportError(String(e))
    }
  }


  const selectedPlacement = draftMap.placements.find((p) => p.pieceId === selectedPieceId)
  const selectedDef = draftCatalogue.pieces.find((p) => p.id === selectedPieceId)
  const pieceName = (id: string) => draftCatalogue.pieces.find((p) => p.id === id)?.name ?? id

  // Wall/pillar hover: when over an existing piece, show the eraser highlight;
  // otherwise show the snap ghost for the active mode.
  const wallHoverIndex = tab === 'walls' && cursorIn && grid ? wallPillarHitIndex(cursorIn) : -1
  const wallHoverPiece =
    wallHoverIndex !== -1
      ? (() => {
          const pl = draftMap.placements[wallHoverIndex]
          const def = draftCatalogue.pieces.find((p) => p.id === pl.pieceId)
          return def ? resolvePiece(def, pl) : null
        })()
      : null
  const wallGhostPiece =
    tab === 'walls' && cursorIn && grid && wallHoverIndex === -1
      ? wallMode === 'pillar'
        ? resolvePiece(makePillarDef(draftMap.killzone), { pieceId: draftMap.killzone + PILLAR_DEF_ID, ...snapPillar(cursorIn, grid), rotationDeg: 0 })
        : (() => {
            const { center, rotationDeg } = snapWall(cursorIn, grid)
            const def =
              wallMode === 'wallAccess'
                ? makeWallAccessDef(draftMap.killzone, wallAccessWidthMm)
                : makeWallDef(draftMap.killzone)
            const pieceId =
              wallMode === 'wallAccess'
                ? wallAccessDefId(draftMap.killzone, wallAccessWidthMm)
                : draftMap.killzone + WALL_DEF_ID
            return resolvePiece(def, { pieceId, x: center.x, y: center.y, rotationDeg })
          })()
      : null

  return (
    <div className="flex flex-col md:flex-row flex-1 md:min-h-0">
      <Sidebar className="
        order-last md:order-first
        basis-0 grow md:max-w-fit">
        <Section title="Annotation (dev)">
          <Field label="Base">
            <Select
              onChange={(e) => {
                if (e.target.value === '__blank') {
                  setDraftMap(structuredClone(blankMap))
                } else {
                  const m = getMap(e.target.value)
                  if (m) {
                    setDraftMap(structuredClone(m))
                    setDraftCatalogue(structuredClone(catalogues[m.killzone]))
                  }
                }
              }}
            >
              {maps.map((group) => (
                <optgroup key={group.name} label={group.name}>
                  {group.maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="__blank">Blank (Volkus image)</option>
            </Select>
          </Field>
          <Field label="Image URL">
            <Input value={draftMap.image} onChange={(e) => patchMap({ image: e.target.value })} />
          </Field>
          <Field label="Killzone">
            <Input value={draftMap.killzone} onChange={(e) => patchMap({ killzone: e.target.value })} />
          </Field>
          <nav className="flex flex-wrap gap-1">
            {(['pieces', 'place', 'zones', 'objectives', 'walls', 'calibrate', 'export'] as Tab[])
              .filter((x) => x !== 'walls' || grid)
              .map((x) => (
                <Button key={x} className="px-2 py-1 text-xs" selected={tab === x} onClick={() => setTab(x)}>
                  {x}
                </Button>
              ))}
          </nav>
        </Section>

        {tab === 'calibrate' && (
          <Section title="Calibrate pixel↔inch">
            <Field label="Killzone width (in)">
              <Input
                type="number"
                value={draftMap.widthIn}
                onChange={(e) => patchMap({ widthIn: Number(e.target.value) })}
              />
            </Field>
            <Field label="Killzone height (in)">
              <Input
                type="number"
                value={draftMap.heightIn}
                onChange={(e) => patchMap({ heightIn: Number(e.target.value) })}
              />
            </Field>
            <Hint>
              {cornerA
                ? 'Now click the bottom-right corner of the killzone.'
                : 'Click the top-left corner of the killzone on the image.'}
            </Hint>
            <Field row>
              <input type="checkbox" className="accent-accent" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              Show verification grid
            </Field>
            <Field row>
              <input
                type="checkbox"
                className="accent-accent"
                checked={showCursorCircles}
                onChange={(e) => setShowCursorCircles(e.target.checked)}
              />
              Show 32mm / 40mm cursor circles
            </Field>
            <div className="flex flex-col gap-2 rounded-md bg-panel-2 p-2">
              <Hint>
                Fine-tune the transform with the grid on until the 1" lines and 40mm circle land
                exactly on the killzone.
              </Hint>
              <Row>
                <Field label="px / inch X">
                  <Input
                    type="number"
                    step={0.01}
                    value={Number(draftMap.pxPerInchX.toFixed(4))}
                    onChange={(e) => patchMap({ pxPerInchX: Number(e.target.value) })}
                  />
                </Field>
                <Field label="px / inch Y">
                  <Input
                    type="number"
                    step={0.01}
                    value={Number(draftMap.pxPerInchY.toFixed(4))}
                    onChange={(e) => patchMap({ pxPerInchY: Number(e.target.value) })}
                  />
                </Field>
              </Row>
              <Row>
                <Button onClick={() => nudgeCalibration({ pxPerInchX: -0.1 })}>X −0.1</Button>
                <Button onClick={() => nudgeCalibration({ pxPerInchX: 0.1 })}>X +0.1</Button>
                <Button onClick={() => nudgeCalibration({ pxPerInchY: -0.1 })}>Y −0.1</Button>
                <Button onClick={() => nudgeCalibration({ pxPerInchY: 0.1 })}>Y +0.1</Button>
              </Row>
              <Row>
                <Field label="origin X (px)">
                  <Input
                    type="number"
                    step={1}
                    value={Number(draftMap.originPx.x.toFixed(2))}
                    onChange={(e) => patchMap({ originPx: { ...draftMap.originPx, x: Number(e.target.value) } })}
                  />
                </Field>
                <Field label="origin Y (px)">
                  <Input
                    type="number"
                    step={1}
                    value={Number(draftMap.originPx.y.toFixed(2))}
                    onChange={(e) => patchMap({ originPx: { ...draftMap.originPx, y: Number(e.target.value) } })}
                  />
                </Field>
              </Row>
              <Row>
                <Button onClick={() => nudgeCalibration({ originX: -1 })}>◀ 1px</Button>
                <Button onClick={() => nudgeCalibration({ originX: 1 })}>1px ▶</Button>
                <Button onClick={() => nudgeCalibration({ originY: -1 })}>▲ 1px</Button>
                <Button onClick={() => nudgeCalibration({ originY: 1 })}>1px ▼</Button>
              </Row>
            </div>
          </Section>
        )}

        {tab === 'pieces' && (
          <Section title="Trace piece footprints">
            <Field label="Name">
              <Input
                type="text"
                value={tracePieceName}
                onChange={(e) => setTracePieceName(e.target.value)}
                placeholder="piece name"
              />
            </Field>
            <Field label="Kind">
              <Select
                value={tracePieceKind}
                onChange={(e) => {
                  const kind = e.target.value as PieceKind
                  setTracePieceKind(kind)
                  // innerFloor is stronghold-only; fall back to outer otherwise.
                  if (kind !== 'stronghold' && traceTarget === 'innerFloor') setTraceTarget('outer')
                }}
              >
                {PIECE_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            </Field>
            <Field label="Polygon">
              <Select value={traceTarget} onChange={(e) => setTraceTarget(e.target.value as typeof traceTarget)}>
                <option value="outer">outer extent{tracePieceKind === 'stronghold' ? ' (wall ring)' : ''}</option>
                {tracePieceKind === 'stronghold' && <option value="innerFloor">inner floor</option>}
                <option value="accessible">accessible region</option>
              </Select>
            </Field>
            <Field label="Shape">
              <Select
                value={traceShape}
                onChange={(e) => {
                  setTraceShape(e.target.value as 'polygon' | 'rectangle')
                  setTraceVertices([])
                }}
              >
                <option value="polygon">polygon (click each vertex)</option>
                <option value="rectangle">rectangle (click two corners)</option>
              </Select>
            </Field>
            {traceShape === 'rectangle' ? (
              <>
                <Hint>
                  {traceVertices.length === 0
                    ? 'Click one corner of the rectangle.'
                    : 'Now click the opposite corner.'}
                </Hint>
                <Row>
                  <Button onClick={() => setTraceVertices([])}>Clear</Button>
                </Row>
              </>
            ) : (
              <>
                <Hint>Click vertices on the image; finish with ≥3 points.</Hint>
                <Row>
                  <Button onClick={finishTrace} disabled={traceVertices.length < 3}>
                    Finish polygon ({traceVertices.length} pts)
                  </Button>
                  <Button onClick={() => setTraceVertices([])}>Clear</Button>
                </Row>
              </>
            )}
            {traceVertices.length > 0 && (
              <List>
                {traceVertices.map((v, i) => (
                  <ListItem key={i}>
                    <span className="grow tabular-nums text-xs">
                      {i + 1}. ({v.x.toFixed(2)}, {v.y.toFixed(2)})
                    </span>
                    <Button
                      variant="danger"
                      onClick={() => setTraceVertices((vs) => vs.filter((_, k) => k !== i))}
                    >
                      ✕
                    </Button>
                  </ListItem>
                ))}
              </List>
            )}
          </Section>
        )}

        {tab === 'place' && (
          <Section title="Place pieces">
            <Hint>Drag pieces on the board, or select one to fine-tune below.</Hint>
            {selectedPlacement ? (
              <div className="flex flex-col gap-2 rounded-md bg-panel-2 p-2">
                <Field label="Name">
                  <Input
                    value={pieceName(selectedPlacement.pieceId)}
                    onChange={(e) => renamePiece(selectedPlacement.pieceId, e.target.value)}
                  />
                </Field>
                <Field label="Kind">
                  <Select
                    value={selectedDef?.kind ?? 'rubble'}
                    onChange={(e) => setPieceKind(selectedPlacement.pieceId, e.target.value as PieceKind)}
                  >
                    { PIECE_KINDS.map((k) => (
                      <option value={k}>{k}</option>
                    ))}
                  </Select>
                </Field>
                <Row>
                  <Field label="X (in)">
                    <Input
                      type="number"
                      step={0.1}
                      value={Number(selectedPlacement.x.toFixed(3))}
                      onChange={(e) =>
                        patchPlacement(selectedPlacement.pieceId, () => ({ x: Number(e.target.value) }))
                      }
                    />
                  </Field>
                  <Field label="Y (in)">
                    <Input
                      type="number"
                      step={0.1}
                      value={Number(selectedPlacement.y.toFixed(3))}
                      onChange={(e) =>
                        patchPlacement(selectedPlacement.pieceId, () => ({ y: Number(e.target.value) }))
                      }
                    />
                  </Field>
                </Row>
                <Row>
                  <Button onClick={() => nudgePlacement(selectedPlacement.pieceId, -0.05, 0)}>◀ X</Button>
                  <Button onClick={() => nudgePlacement(selectedPlacement.pieceId, 0.05, 0)}>X ▶</Button>
                  <Button onClick={() => nudgePlacement(selectedPlacement.pieceId, 0, -0.05)}>▲ Y</Button>
                  <Button onClick={() => nudgePlacement(selectedPlacement.pieceId, 0, 0.05)}>Y ▼</Button>
                </Row>
                <Field label="Rotation (°)">
                  <Input
                    type="number"
                    step={1}
                    value={selectedPlacement.rotationDeg}
                    onChange={(e) =>
                      patchPlacement(selectedPlacement.pieceId, () => ({
                        rotationDeg: Math.round(Number(e.target.value) * 10) / 10,
                      }))
                    }
                  />
                </Field>
                <Row>
                  <Button onClick={() => rotateSelected(-15)}>⟲ 15°</Button>
                  <Button onClick={() => rotateSelected(-1)}>⟲ 1°</Button>
                  <Button onClick={() => rotateSelected(1)}>⟳ 1°</Button>
                  <Button onClick={() => rotateSelected(15)}>⟳ 15°</Button>
                </Row>
                <Field label="Footprint scale">
                  <Hint as="span">Grow or shrink the traced footprint about its pivot.</Hint>
                </Field>
                <Row>
                  <Button onClick={() => scaleFootprint(selectedPlacement.pieceId, 0.98)}>− 2%</Button>
                  <Button onClick={() => scaleFootprint(selectedPlacement.pieceId, 1 / 0.98)}>+ 2%</Button>
                  <Button onClick={() => scaleFootprint(selectedPlacement.pieceId, 0.9)}>− 10%</Button>
                  <Button onClick={() => scaleFootprint(selectedPlacement.pieceId, 1 / 0.9)}>+ 10%</Button>
                </Row>
                {!!selectedDef?.accessible?.length && (
                  <Row>
                    <Button variant="danger" onClick={() => clearAccessible(selectedPlacement.pieceId)}>
                      Clear accessible regions ({selectedDef.accessible.length})
                    </Button>
                  </Row>
                )}
              </div>
            ) : (
              <Hint>Click a piece in the list to select it.</Hint>
            )}
            <List>
              {draftMap.placements.map((pl) => (
                <ListItem key={pl.pieceId} selected={pl.pieceId === selectedPieceId}>
                  <Input
                    value={pieceName(pl.pieceId)}
                    onChange={(e) => renamePiece(pl.pieceId, e.target.value)}
                    onFocus={() => setSelectedPieceId(pl.pieceId)}
                  />
                  <Button onClick={() => setSelectedPieceId(pl.pieceId)}>⌖</Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setDraftMap((m) => ({
                        ...m,
                        placements: m.placements.filter((x) => x.pieceId !== pl.pieceId),
                      }))
                    }
                  >
                    ✕
                  </Button>
                </ListItem>
              ))}
            </List>
          </Section>
        )}

        {tab === 'zones' && (
          <Section title="Drop zones">
            <Field label="Name">
              <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="A (west)" />
            </Field>
            <Field label="Anchor edge">
              <Select value={zoneAnchor} onChange={(e) => setZoneAnchor(e.target.value as AnchorEdge)}>
                <option value="left">left</option>
                <option value="right">right</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
              </Select>
            </Field>
            <Hint>Click polygon vertices on the board.</Hint>
            <Row>
              <Button
                disabled={zoneVertices.length < 3}
                onClick={() => {
                  const id = `dz-${Date.now() % 100000}`
                  setDraftMap((m) => ({
                    ...m,
                    dropZones: [
                      ...m.dropZones,
                      { id, name: zoneName || id, polygon: zoneVertices, anchorEdge: zoneAnchor },
                    ],
                  }))
                  setZoneVertices([])
                  setZoneName('')
                }}
              >
                Add zone ({zoneVertices.length} pts)
              </Button>
              <Button onClick={() => setZoneVertices([])}>Clear</Button>
            </Row>
            <List>
              {draftMap.dropZones.map((dz) => (
                <ListItem key={dz.id}>
                  <Input
                    value={dz.name}
                    onChange={(e) =>
                      setDraftMap((m) => ({
                        ...m,
                        dropZones: m.dropZones.map((x) =>
                          x.id === dz.id ? { ...x, name: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <Select
                    value={dz.anchorEdge}
                    onChange={(e) =>
                      setDraftMap((m) => ({
                        ...m,
                        dropZones: m.dropZones.map((x) =>
                          x.id === dz.id ? { ...x, anchorEdge: e.target.value as AnchorEdge } : x,
                        ),
                      }))
                    }
                  >
                    <option value="left">left</option>
                    <option value="right">right</option>
                    <option value="top">top</option>
                    <option value="bottom">bottom</option>
                  </Select>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setDraftMap((m) => ({ ...m, dropZones: m.dropZones.filter((x) => x.id !== dz.id) }))
                    }
                  >
                    ✕
                  </Button>
                </ListItem>
              ))}
            </List>
          </Section>
        )}

        {tab === 'objectives' && (
          <Section title="Objectives">
            <Hint>Click the board to add; drag to move.</Hint>
            <List>
              {draftMap.objectives.map((o) => {
                const patchObjective = (patch: Partial<Objective>) =>
                  setDraftMap((m) => ({
                    ...m,
                    objectives: m.objectives.map((x) => (x.id === o.id ? { ...x, ...patch } : x)),
                  }))
                return (
                  <ListItem key={o.id} selected={o.id === selectedObjectiveId}>
                    <Input
                      value={o.name ?? ''}
                      placeholder={o.id}
                      onChange={(e) => patchObjective({ name: e.target.value })}
                      onFocus={() => setSelectedObjectiveId(o.id)}
                    />
                    <Select value={o.role} onChange={(e) => patchObjective({ role: e.target.value as Objective['role'] })}>
                      <option value="center">center</option>
                      <option value="other">other</option>
                    </Select>
                    <Button
                      variant="danger"
                      onClick={() =>
                        setDraftMap((m) => ({ ...m, objectives: m.objectives.filter((x) => x.id !== o.id) }))
                      }
                    >
                      ✕
                    </Button>
                    <Row className="basis-full">
                      <Field label="X (in)">
                        <Input
                          type="number"
                          step={0.1}
                          value={Number(o.center.x.toFixed(3))}
                          onChange={(e) => patchObjective({ center: { ...o.center, x: Number(e.target.value) } })}
                        />
                      </Field>
                      <Field label="Y (in)">
                        <Input
                          type="number"
                          step={0.1}
                          value={Number(o.center.y.toFixed(3))}
                          onChange={(e) => patchObjective({ center: { ...o.center, y: Number(e.target.value) } })}
                        />
                      </Field>
                    </Row>
                    <Row className="basis-full">
                      <Button onClick={() => nudgeObjective(o.id, -0.05, 0)}>◀ X</Button>
                      <Button onClick={() => nudgeObjective(o.id, 0.05, 0)}>X ▶</Button>
                      <Button onClick={() => nudgeObjective(o.id, 0, -0.05)}>▲ Y</Button>
                      <Button onClick={() => nudgeObjective(o.id, 0, 0.05)}>Y ▼</Button>
                    </Row>
                  </ListItem>
                )
              })}
            </List>
          </Section>
        )}

        {tab === 'walls' && (
          <Section title="Walls & pillars">
            <Row>
              <Button selected={wallMode === 'wall'} onClick={() => setWallMode('wall')}>
                Wall
              </Button>
              <Button selected={wallMode === 'wallAccess'} onClick={() => setWallMode('wallAccess')}>
                Wall (accessible)
              </Button>
              <Button selected={wallMode === 'pillar'} onClick={() => setWallMode('pillar')}>
                Pillar
              </Button>
            </Row>
            {wallMode === 'wallAccess' && wallAccessOptions.length > 1 && (
              <Row>
                {wallAccessOptions.map((o) => (
                  <Button
                    key={o.widthMm}
                    selected={wallAccessWidthMm === o.widthMm}
                    onClick={() => setWallAccessWidthMm(o.widthMm)}
                  >
                    {o.name}
                  </Button>
                ))}
              </Row>
            )}
            <Hint>
              Click an empty grid spot to place; click an existing wall/pillar to delete. Everything
              snaps to the half-grid. "Wall (accessible)" carries a pre-measured door gap already
              marked as Accessible terrain (teal), centred on the wall; killzones with more than one
              door-gap size (e.g. Tomb World) let you pick which width to place next. Footprint sizes
              live in <code>src/model/constants.ts</code>.
            </Hint>
            <Row>
              <Button variant="danger" onClick={removeWallsAndPillars}>
                Clear all walls &amp; pillars
              </Button>
            </Row>
          </Section>
        )}

        {tab === 'export' && (
          <Section title="Export / import">
            <Field label="Map ID">
              <Input value={draftMap.id} onChange={(e) => patchMap({ id: e.target.value })} />
            </Field>
            <Field label="Map name">
              <Input value={draftMap.name} onChange={(e) => patchMap({ name: e.target.value })} />
            </Field>
            <Field row>
              <input
                type="checkbox"
                className="accent-accent"
                checked={!!draftMap.draft}
                onChange={(e) => patchMap({ draft: e.target.checked })}
              />
              Draft (annotation unverified)
            </Field>
            <Row>
              <Button onClick={() => download(`${draftMap.id}.json`, draftMap)}>Download map JSON</Button>
              <Button onClick={() => download(`${draftMap.killzone}-catalogue.json`, draftCatalogue)}>
                Download catalogue JSON
              </Button>
            </Row>
            <Hint>
              Drop the files into <code>src/data/</code> and register them in <code>registry.ts</code>.
            </Hint>
            <Field label="Import JSON (map or catalogue)">
              <Textarea rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} />
            </Field>
            <Button onClick={applyImport}>Apply import</Button>
            {importError && <ErrorText>{importError}</ErrorText>}
          </Section>
        )}
      </Sidebar>

      <main className="
          h-9/12 p-3 md:h-full md:min-h-0
          grow-3
          flex items-center justify-center">
        <Board
          map={draftMap}
          fullImage
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
        >
          <DropZoneLayer dropZones={draftMap.dropZones} />
          <TerrainLayer
            pieces={pieces}
            selectedId={selectedPieceId ?? undefined}
            onPiecePointerDown={tab === 'place' ? onPiecePointerDown : undefined}
          />
          <ObjectiveLayer
            objectives={draftMap.objectives}
            selectedId={selectedObjectiveId ?? undefined}
            onObjectivePointerDown={tab === 'objectives' ? onObjectivePointerDown : undefined}
          />
          {showGrid && tab === 'calibrate' && <GridLayer killzone={draftMap.killzone} widthIn={draftMap.widthIn} heightIn={draftMap.heightIn} />}
          {tab === 'walls' && (
            <GridLayer
              killzone={draftMap.killzone}
              widthIn={draftMap.widthIn}
              heightIn={draftMap.heightIn}
              density={2}
            />
          )}
          {wallGhostPiece && (
            <>
              <polygon
                points={wallGhostPiece.outer.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(255,220,80,0.35)"
                stroke="#ffd54a"
                strokeWidth={0.04}
                style={{ pointerEvents: 'none' }}
              />
              {wallGhostPiece.accessible?.map((poly, i) => (
                <polygon
                  key={i}
                  points={poly.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(60,210,190,0.35)"
                  stroke="#3cd2be"
                  strokeWidth={0.04}
                  style={{ pointerEvents: 'none' }}
                />
              ))}
            </>
          )}
          {wallHoverPiece && (
            <polygon
              points={wallHoverPiece.outer.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(226,59,59,0.3)"
              stroke="#e23b3b"
              strokeWidth={0.05}
              style={{ pointerEvents: 'none' }}
            />
          )}
          {tab === 'pieces' && traceShape === 'rectangle' && traceVertices.length === 1 && cursorIn && (
            <polygon
              points={rectFromCorners(traceVertices[0], cursorIn)
                .map((p) => `${p.x},${p.y}`)
                .join(' ')}
              fill="rgba(255,220,80,0.15)"
              stroke="#ffd54a"
              strokeWidth={0.05}
              strokeDasharray="0.2 0.12"
            />
          )}
          {(traceVertices.length > 0 || zoneVertices.length > 0) && (
            <g>
              <polyline
                points={[...traceVertices, ...zoneVertices].map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(255,220,80,0.15)"
                stroke="#ffd54a"
                strokeWidth={0.05}
              />
              {zoneVertices.map((p, i) => (
                <circle key={`z${i}`} cx={p.x} cy={p.y} r={0.12} fill="#ffd54a" />
              ))}
              {traceVertices.map((p, i) => (
                <circle
                  key={`t${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={0.12}
                  fill="#ffd54a"
                  style={{ cursor: 'grab' }}
                />
              ))}
            </g>
          )}
          {showCursorCircles && cursorIn && tab === 'calibrate' && (
            <g fill="none" strokeWidth={0.04}>
              <circle cx={cursorIn.x} cy={cursorIn.y} r={16 * IN_PER_MM} stroke="#7fd4ff" />
              <circle cx={cursorIn.x} cy={cursorIn.y} r={20 * IN_PER_MM} stroke="#ff7fd4" />
            </g>
          )}
          {draggingVertex && dragTraceVertexIndex.current !== null && cursorIn && imgSize && (
            <TraceLoupe
              image={draftMap.image}
              imgSize={imgSize}
              map={draftMap}
              cursor={cursorIn}
              vertex={traceVertices[dragTraceVertexIndex.current]}
              refPoint={
                traceVertices.length > 1
                  ? traceVertices[
                      (dragTraceVertexIndex.current - 1 + traceVertices.length) % traceVertices.length
                    ]
                  : null
              }
            />
          )}
        </Board>
      </main>
    </div>
  )
}
