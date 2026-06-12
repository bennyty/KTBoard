import { useMemo, useRef, useState } from 'react'
import type {
  AnchorEdge,
  AnnotatedMap,
  KillzoneCatalogue,
  Objective,
  PiecePlacement,
  Polygon,
  Vec,
} from '@/model/types'
import { IN_PER_MM } from '@/model/constants'
import { catalogues, maps } from '@/data/registry'
import { calibrate, inchesToPx } from '@/geometry/transform'
import { polygonCentroid, polygonToLocal, resolvePiece } from '@/geometry/polygon'
import { rotateDeg, sub, add } from '@/geometry/vec'
import { Board, mapTransform } from '@/ui/Board'
import { DropZoneLayer, GridLayer, ObjectiveLayer, TerrainLayer } from '@/ui/layers'

type Tab = 'calibrate' | 'pieces' | 'place' | 'zones' | 'objectives' | 'export'

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
  const [tab, setTab] = useState<Tab>('calibrate')

  // Calibration state
  const [cornerA, setCornerA] = useState<Vec | null>(null) // image px
  const [showGrid, setShowGrid] = useState(false)
  const [cursorIn, setCursorIn] = useState<Vec | null>(null)
  const [showCursorCircles, setShowCursorCircles] = useState(false)

  // Tracing state
  const [tracePieceId, setTracePieceId] = useState<string>('')
  const [traceTarget, setTraceTarget] = useState<'outer' | 'innerFloor'>('outer')
  const [traceShape, setTraceShape] = useState<'polygon' | 'rectangle'>('polygon')
  const [traceVertices, setTraceVertices] = useState<Polygon>([]) // world inches

  // Placement / objective selection + dragging
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null)
  const dragPiece = useRef<{ pieceId: string; offset: Vec } | null>(null)
  const dragObjective = useRef<string | null>(null)

  // Drop zone drawing
  const [zoneVertices, setZoneVertices] = useState<Polygon>([])
  const [zoneAnchor, setZoneAnchor] = useState<AnchorEdge>('left')
  const [zoneName, setZoneName] = useState('')

  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

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
    if (!tracePieceId || vertices.length < 3) return
    const def = draftCatalogue.pieces.find((p) => p.id === tracePieceId)
    if (!def) return
    const existing = draftMap.placements.find((pl) => pl.pieceId === tracePieceId)

    if (existing) {
      // Keep the piece's local frame: world → local via inverse placement.
      const origin = { x: existing.x, y: existing.y }
      const local = vertices.map((v) => rotateDeg(sub(v, origin), -existing.rotationDeg))
      setDraftCatalogue((c) => ({
        ...c,
        pieces: c.pieces.map((p) => (p.id === tracePieceId ? { ...p, [traceTarget]: local } : p)),
      }))
    } else {
      const pivot = polygonCentroid(vertices)
      const local = polygonToLocal(vertices, pivot)
      setDraftCatalogue((c) => ({
        ...c,
        pieces: c.pieces.map((p) => (p.id === tracePieceId ? { ...p, [traceTarget]: local } : p)),
      }))
      setDraftMap((m) => ({
        ...m,
        placements: [...m.placements, { pieceId: tracePieceId, x: pivot.x, y: pivot.y, rotationDeg: 0 }],
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

  function onBoardPointerDown(inches: Vec) {
    if (tab === 'calibrate') onCalibrateClick(inches)
    else if (tab === 'pieces' && tracePieceId) {
      if (traceShape === 'rectangle') {
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

  const tracedPiece = draftCatalogue.pieces.find((p) => p.id === tracePieceId)
  const selectedPlacement = draftMap.placements.find((p) => p.pieceId === selectedPieceId)
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
          <nav className="tabs">
            {(['calibrate', 'pieces', 'place', 'zones', 'objectives', 'export'] as Tab[]).map((x) => (
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
              Show 1" verification grid
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={showCursorCircles}
                onChange={(e) => setShowCursorCircles(e.target.checked)}
              />
              Show 32mm / 40mm cursor circles
            </label>
            <p className="hint">
              pxPerInch: {draftMap.pxPerInchX.toFixed(3)} × {draftMap.pxPerInchY.toFixed(3)}, origin (
              {draftMap.originPx.x.toFixed(1)}, {draftMap.originPx.y.toFixed(1)})
            </p>
          </section>
        )}

        {tab === 'pieces' && (
          <section>
            <h2>Trace piece footprints</h2>
            <label>
              Piece
              <select value={tracePieceId} onChange={(e) => setTracePieceId(e.target.value)}>
                <option value="">— select —</option>
                {draftCatalogue.pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {tracedPiece?.kind === 'stronghold' && (
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
          {showGrid && tab === 'calibrate' && <GridLayer widthIn={draftMap.widthIn} heightIn={draftMap.heightIn} />}
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
              {[...traceVertices, ...zoneVertices].map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={0.12} fill="#ffd54a" />
              ))}
            </g>
          )}
          {showCursorCircles && cursorIn && tab === 'calibrate' && (
            <g fill="none" strokeWidth={0.04}>
              <circle cx={cursorIn.x} cy={cursorIn.y} r={16 * IN_PER_MM} stroke="#7fd4ff" />
              <circle cx={cursorIn.x} cy={cursorIn.y} r={20 * IN_PER_MM} stroke="#ff7fd4" />
            </g>
          )}
        </Board>
      </main>
    </div>
  )
}
