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
import { IN_PER_MM } from '@/model/constants'
import { catalogues, maps } from '@/data/registry'
import { calibrate, inchesToPx } from '@/geometry/transform'
import { polygonCentroid, polygonToLocal, resolvePiece } from '@/geometry/polygon'
import { rotateDeg, sub, add } from '@/geometry/vec'
import { Board, mapTransform } from '@/ui/Board'
import { DropZoneLayer, GridLayer, ObjectiveLayer, TerrainLayer } from '@/ui/layers'
import { useImageSize } from '@/ui/useImageSize'

type Tab = 'calibrate' | 'pieces' | 'place' | 'zones' | 'objectives' | 'export'

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
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function TraceLoupe({ image, imgSize, map, cursor, vertex }: TraceLoupeProps) {
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
    </g>
  )
}

const blankMap: AnnotatedMap = {
  id: 'new-map',
  name: 'New map',
  killzone: 'volkus',
  image: '/maps/Volkus/Volkus1.jpg',
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
  const [draftMap, setDraftMap] = useState<AnnotatedMap>(() => structuredClone(maps[0]))
  const [draftCatalogue, setDraftCatalogue] = useState<KillzoneCatalogue>(() =>
    structuredClone(catalogues[maps[0].killzone]),
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
  const [traceTarget, setTraceTarget] = useState<'outer' | 'innerFloor'>('outer')
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

  const imgSize = useImageSize(draftMap.image)

  const pieces = useMemo(() => {
    const defs = new Map(draftCatalogue.pieces.map((p) => [p.id, p]))
    return draftMap.placements.flatMap((pl) => {
      const def = defs.get(pl.pieceId)
      return def ? [resolvePiece(def, pl)] : []
    })
  }, [draftMap, draftCatalogue])

  const t = mapTransform(draftMap)

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
            }
          : p,
      ),
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
        pieces: c.pieces.map((p) =>
          p.id === pieceId ? { ...p, kind: tracePieceKind, [traceTarget]: local } : p,
        ),
      }))
    } else {
      const pivot = polygonCentroid(vertices)
      const local = polygonToLocal(vertices, pivot)
      setDraftCatalogue((c) => ({
        ...c,
        pieces: c.pieces.map((p) =>
          p.id === pieceId ? { ...p, kind: tracePieceKind, [traceTarget]: local } : p,
        ),
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

  function onBoardPointerMove(inches: Vec) {
    setCursorIn(inches)
    if (dragTraceVertexIndex.current !== null) {
      const i = dragTraceVertexIndex.current
      setTraceVertices((v) => v.map((p, k) => (k === i ? inches : p)))
      return
    }
    if (dragPiece.current) {
      const { pieceId, offset } = dragPiece.current
      const pos = add(inches, offset)
      setDraftMap((m) => ({
        ...m,
        placements: m.placements.map((pl) => (pl.pieceId === pieceId ? { ...pl, x: pos.x, y: pos.y } : pl)),
      }))
    } else if (dragObjective.current) {
      const id = dragObjective.current
      setDraftMap((m) => ({
        ...m,
        objectives: m.objectives.map((o) => (o.id === id ? { ...o, center: inches } : o)),
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

  return (
    <div className="planning">
      <aside className="sidebar">
        <section>
          <h2>Annotation (dev)</h2>
          <label>
            Base
            <select
              onChange={(e) => {
                if (e.target.value === '__blank') {
                  setDraftMap(structuredClone(blankMap))
                } else {
                  const m = maps.find((x) => x.id === e.target.value)
                  if (m) {
                    setDraftMap(structuredClone(m))
                    setDraftCatalogue(structuredClone(catalogues[m.killzone]))
                  }
                }
              }}
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="__blank">Blank (Volkus image)</option>
            </select>
          </label>
          <label>
            Image URL
            <input value={draftMap.image} onChange={(e) => patchMap({ image: e.target.value })} />
          </label>
          <label>
            Killzone
            <input value={draftMap.killzone} onChange={(e) => patchMap({ killzone: e.target.value })} />
          </label>
          <nav className="tabs">
            {(['pieces', 'place', 'zones', 'objectives', 'calibrate', 'export'] as Tab[]).map((x) => (
              <button key={x} className={tab === x ? 'selected' : ''} onClick={() => setTab(x)}>
                {x}
              </button>
            ))}
          </nav>
        </section>

        {tab === 'calibrate' && (
          <section>
            <h2>Calibrate pixel↔inch</h2>
            <label>
              Killzone width (in)
              <input
                type="number"
                value={draftMap.widthIn}
                onChange={(e) => patchMap({ widthIn: Number(e.target.value) })}
              />
            </label>
            <label>
              Killzone height (in)
              <input
                type="number"
                value={draftMap.heightIn}
                onChange={(e) => patchMap({ heightIn: Number(e.target.value) })}
              />
            </label>
            <p className="hint">
              {cornerA
                ? 'Now click the bottom-right corner of the killzone.'
                : 'Click the top-left corner of the killzone on the image.'}
            </p>
            <label className="row">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              Show verification grid
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={showCursorCircles}
                onChange={(e) => setShowCursorCircles(e.target.checked)}
              />
              Show 32mm / 40mm cursor circles
            </label>
            <div className="fine-tune">
              <p className="hint">
                Fine-tune the transform with the grid on until the 1" lines and 40mm circle land
                exactly on the killzone.
              </p>
              <div className="row">
                <label>
                  px / inch X
                  <input
                    type="number"
                    step={0.01}
                    value={Number(draftMap.pxPerInchX.toFixed(4))}
                    onChange={(e) => patchMap({ pxPerInchX: Number(e.target.value) })}
                  />
                </label>
                <label>
                  px / inch Y
                  <input
                    type="number"
                    step={0.01}
                    value={Number(draftMap.pxPerInchY.toFixed(4))}
                    onChange={(e) => patchMap({ pxPerInchY: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="row">
                <button onClick={() => nudgeCalibration({ pxPerInchX: -0.1 })}>X −0.1</button>
                <button onClick={() => nudgeCalibration({ pxPerInchX: 0.1 })}>X +0.1</button>
                <button onClick={() => nudgeCalibration({ pxPerInchY: -0.1 })}>Y −0.1</button>
                <button onClick={() => nudgeCalibration({ pxPerInchY: 0.1 })}>Y +0.1</button>
              </div>
              <div className="row">
                <label>
                  origin X (px)
                  <input
                    type="number"
                    step={1}
                    value={Number(draftMap.originPx.x.toFixed(2))}
                    onChange={(e) => patchMap({ originPx: { ...draftMap.originPx, x: Number(e.target.value) } })}
                  />
                </label>
                <label>
                  origin Y (px)
                  <input
                    type="number"
                    step={1}
                    value={Number(draftMap.originPx.y.toFixed(2))}
                    onChange={(e) => patchMap({ originPx: { ...draftMap.originPx, y: Number(e.target.value) } })}
                  />
                </label>
              </div>
              <div className="row">
                <button onClick={() => nudgeCalibration({ originX: -1 })}>◀ 1px</button>
                <button onClick={() => nudgeCalibration({ originX: 1 })}>1px ▶</button>
                <button onClick={() => nudgeCalibration({ originY: -1 })}>▲ 1px</button>
                <button onClick={() => nudgeCalibration({ originY: 1 })}>1px ▼</button>
              </div>
            </div>
          </section>
        )}

        {tab === 'pieces' && (
          <section>
            <h2>Trace piece footprints</h2>
            <label>
              Name
              <input
                type="text"
                value={tracePieceName}
                onChange={(e) => setTracePieceName(e.target.value)}
                placeholder="piece name"
              />
            </label>
            <label>
              Kind
              <select value={tracePieceKind} onChange={(e) => setTracePieceKind(e.target.value as PieceKind)}>
                {PIECE_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            {tracePieceKind === 'stronghold' && (
              <label>
                Polygon
                <select value={traceTarget} onChange={(e) => setTraceTarget(e.target.value as 'outer' | 'innerFloor')}>
                  <option value="outer">outer extent (wall ring)</option>
                  <option value="innerFloor">inner floor</option>
                </select>
              </label>
            )}
            <label>
              Shape
              <select
                value={traceShape}
                onChange={(e) => {
                  setTraceShape(e.target.value as 'polygon' | 'rectangle')
                  setTraceVertices([])
                }}
              >
                <option value="polygon">polygon (click each vertex)</option>
                <option value="rectangle">rectangle (click two corners)</option>
              </select>
            </label>
            {traceShape === 'rectangle' ? (
              <>
                <p className="hint">
                  {traceVertices.length === 0
                    ? 'Click one corner of the rectangle.'
                    : 'Now click the opposite corner.'}
                </p>
                <div className="row">
                  <button onClick={() => setTraceVertices([])}>Clear</button>
                </div>
              </>
            ) : (
              <>
                <p className="hint">Click vertices on the image; finish with ≥3 points.</p>
                <div className="row">
                  <button onClick={finishTrace} disabled={traceVertices.length < 3}>
                    Finish polygon ({traceVertices.length} pts)
                  </button>
                  <button onClick={() => setTraceVertices([])}>Clear</button>
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'place' && (
          <section>
            <h2>Place pieces</h2>
            <p className="hint">Drag pieces on the board, or select one to fine-tune below.</p>
            {selectedPlacement ? (
              <div className="fine-tune">
                <label>
                  Name
                  <input
                    value={pieceName(selectedPlacement.pieceId)}
                    onChange={(e) => renamePiece(selectedPlacement.pieceId, e.target.value)}
                  />
                </label>
                <label>
                  Kind
                  <select
                    value={selectedDef?.kind ?? 'rubble'}
                    onChange={(e) => setPieceKind(selectedPlacement.pieceId, e.target.value as PieceKind)}
                  >
                    { PIECE_KINDS.map((k) => (
                      <option value={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <div className="row">
                  <label>
                    X (in)
                    <input
                      type="number"
                      step={0.1}
                      value={Number(selectedPlacement.x.toFixed(3))}
                      onChange={(e) =>
                        patchPlacement(selectedPlacement.pieceId, () => ({ x: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Y (in)
                    <input
                      type="number"
                      step={0.1}
                      value={Number(selectedPlacement.y.toFixed(3))}
                      onChange={(e) =>
                        patchPlacement(selectedPlacement.pieceId, () => ({ y: Number(e.target.value) }))
                      }
                    />
                  </label>
                </div>
                <div className="row">
                  <button onClick={() => nudgePlacement(selectedPlacement.pieceId, -0.05, 0)}>◀ X</button>
                  <button onClick={() => nudgePlacement(selectedPlacement.pieceId, 0.05, 0)}>X ▶</button>
                  <button onClick={() => nudgePlacement(selectedPlacement.pieceId, 0, -0.05)}>▲ Y</button>
                  <button onClick={() => nudgePlacement(selectedPlacement.pieceId, 0, 0.05)}>Y ▼</button>
                </div>
                <label>
                  Rotation (°)
                  <input
                    type="number"
                    step={1}
                    value={selectedPlacement.rotationDeg}
                    onChange={(e) =>
                      patchPlacement(selectedPlacement.pieceId, () => ({
                        rotationDeg: Math.round(Number(e.target.value) * 10) / 10,
                      }))
                    }
                  />
                </label>
                <div className="row">
                  <button onClick={() => rotateSelected(-15)}>⟲ 15°</button>
                  <button onClick={() => rotateSelected(-1)}>⟲ 1°</button>
                  <button onClick={() => rotateSelected(1)}>⟳ 1°</button>
                  <button onClick={() => rotateSelected(15)}>⟳ 15°</button>
                </div>
                <label>
                  Footprint scale
                  <span className="hint">Grow or shrink the traced footprint about its pivot.</span>
                </label>
                <div className="row">
                  <button onClick={() => scaleFootprint(selectedPlacement.pieceId, 0.98)}>− 2%</button>
                  <button onClick={() => scaleFootprint(selectedPlacement.pieceId, 1 / 0.98)}>+ 2%</button>
                  <button onClick={() => scaleFootprint(selectedPlacement.pieceId, 0.9)}>− 10%</button>
                  <button onClick={() => scaleFootprint(selectedPlacement.pieceId, 1 / 0.9)}>+ 10%</button>
                </div>
              </div>
            ) : (
              <p className="hint">Click a piece in the list to select it.</p>
            )}
            <ul className="list">
              {draftMap.placements.map((pl) => (
                <li key={pl.pieceId} className={pl.pieceId === selectedPieceId ? 'selected' : ''}>
                  <input
                    value={pieceName(pl.pieceId)}
                    onChange={(e) => renamePiece(pl.pieceId, e.target.value)}
                    onFocus={() => setSelectedPieceId(pl.pieceId)}
                  />
                  <button onClick={() => setSelectedPieceId(pl.pieceId)}>⌖</button>
                  <button
                    className="danger"
                    onClick={() =>
                      setDraftMap((m) => ({
                        ...m,
                        placements: m.placements.filter((x) => x.pieceId !== pl.pieceId),
                      }))
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'zones' && (
          <section>
            <h2>Drop zones</h2>
            <label>
              Name
              <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="A (west)" />
            </label>
            <label>
              Anchor edge
              <select value={zoneAnchor} onChange={(e) => setZoneAnchor(e.target.value as AnchorEdge)}>
                <option value="left">left</option>
                <option value="right">right</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
              </select>
            </label>
            <p className="hint">Click polygon vertices on the board.</p>
            <div className="row">
              <button
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
              </button>
              <button onClick={() => setZoneVertices([])}>Clear</button>
            </div>
            <ul className="list">
              {draftMap.dropZones.map((dz) => (
                <li key={dz.id}>
                  <input
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
                  <select
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
                  </select>
                  <button
                    className="danger"
                    onClick={() =>
                      setDraftMap((m) => ({ ...m, dropZones: m.dropZones.filter((x) => x.id !== dz.id) }))
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'objectives' && (
          <section>
            <h2>Objectives</h2>
            <p className="hint">Click the board to add; drag to move.</p>
            <ul className="list">
              {draftMap.objectives.map((o) => {
                const patchObjective = (patch: Partial<Objective>) =>
                  setDraftMap((m) => ({
                    ...m,
                    objectives: m.objectives.map((x) => (x.id === o.id ? { ...x, ...patch } : x)),
                  }))
                return (
                  <li key={o.id} className={o.id === selectedObjectiveId ? 'selected' : ''}>
                    <input
                      value={o.name ?? ''}
                      placeholder={o.id}
                      onChange={(e) => patchObjective({ name: e.target.value })}
                      onFocus={() => setSelectedObjectiveId(o.id)}
                    />
                    <select value={o.role} onChange={(e) => patchObjective({ role: e.target.value as Objective['role'] })}>
                      <option value="center">center</option>
                      <option value="other">other</option>
                    </select>
                    <button
                      className="danger"
                      onClick={() =>
                        setDraftMap((m) => ({ ...m, objectives: m.objectives.filter((x) => x.id !== o.id) }))
                      }
                    >
                      ✕
                    </button>
                    <div className="row">
                      <label>
                        X (in)
                        <input
                          type="number"
                          step={0.1}
                          value={Number(o.center.x.toFixed(3))}
                          onChange={(e) => patchObjective({ center: { ...o.center, x: Number(e.target.value) } })}
                        />
                      </label>
                      <label>
                        Y (in)
                        <input
                          type="number"
                          step={0.1}
                          value={Number(o.center.y.toFixed(3))}
                          onChange={(e) => patchObjective({ center: { ...o.center, y: Number(e.target.value) } })}
                        />
                      </label>
                    </div>
                    <div className="row">
                      <button onClick={() => nudgeObjective(o.id, -0.05, 0)}>◀ X</button>
                      <button onClick={() => nudgeObjective(o.id, 0.05, 0)}>X ▶</button>
                      <button onClick={() => nudgeObjective(o.id, 0, -0.05)}>▲ Y</button>
                      <button onClick={() => nudgeObjective(o.id, 0, 0.05)}>Y ▼</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {tab === 'export' && (
          <section>
            <h2>Export / import</h2>
            <label>
              Map ID
              <input value={draftMap.id} onChange={(e) => patchMap({ id: e.target.value })} />
            </label>
            <label>
              Map name
              <input value={draftMap.name} onChange={(e) => patchMap({ name: e.target.value })} />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={!!draftMap.draft}
                onChange={(e) => patchMap({ draft: e.target.checked })}
              />
              Draft (annotation unverified)
            </label>
            <div className="row">
              <button onClick={() => download(`${draftMap.id}.json`, draftMap)}>Download map JSON</button>
              <button onClick={() => download(`${draftMap.killzone}-catalogue.json`, draftCatalogue)}>
                Download catalogue JSON
              </button>
            </div>
            <p className="hint">
              Drop the files into <code>src/data/</code> and register them in <code>registry.ts</code>.
            </p>
            <label>
              Import JSON (map or catalogue)
              <textarea rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} />
            </label>
            <button onClick={applyImport}>Apply import</button>
            {importError && <div className="error">{importError}</div>}
          </section>
        )}
      </aside>

      <main className="board-pane">
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
            />
          )}
        </Board>
      </main>
    </div>
  )
}
