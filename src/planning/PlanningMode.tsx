import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chain, ScoredPlan, Scores, Vec } from '@/model/types'
import { SCORE_AXES } from '@/model/types'
import { getCatalogue, getMap, maps } from '@/data/registry'
import { resolveMapPieces, DEFAULT_ATTEMPTS } from '@/scoring/generate'
import { makeScoringContext, scoreChain } from '@/scoring/score'
import { chainViolations } from '@/rules/validity'
import type { Violation } from '@/rules/validity'
import type { GeneratorMessage } from '@/worker/generator.worker'
import { Board } from '@/ui/Board'
import { DropZoneLayer, ObjectiveLayer, TerrainLayer, TunnelLayer } from '@/ui/layers'
import { readUrlState, writeUrlState } from './urlState'

interface Progress {
  attempted: number
  totalAttempts: number
  valid: number
  frontSize: number
}

function formatScore(key: keyof Scores, v: number): string {
  switch (key) {
    case 'homeUnburrow':
    case 'forwardReach':
      return `${v.toFixed(1)}"`
    case 'centerAccess':
      return v >= 5 ? 'never' : `marker ${v}`
    default:
      return String(v)
  }
}

const AXIS_LABELS: Record<keyof Scores, string> = Object.fromEntries(
  SCORE_AXES.map((a) => [a.key, a.label]),
) as Record<keyof Scores, string>

export function PlanningMode() {
  const initial = useMemo(readUrlState, [])
  const [mapId, setMapId] = useState(initial.mapId && getMap(initial.mapId) ? initial.mapId : maps[0].id)
  const map = getMap(mapId)!
  const catalogue = getCatalogue(map.killzone)!
  const [dropZoneId, setDropZoneId] = useState(() =>
    map.dropZones.some((d) => d.id === initial.dropZoneId) ? initial.dropZoneId! : map.dropZones[0].id,
  )
  const dropZone = map.dropZones.find((d) => d.id === dropZoneId) ?? map.dropZones[0]

  const pieces = useMemo(() => resolveMapPieces(map, catalogue), [map, catalogue])
  const ctx = useMemo(() => makeScoringContext(map, pieces, dropZone), [map, pieces, dropZone])

  const [plans, setPlans] = useState<ScoredPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null)
  const [markers, setMarkers] = useState<Chain | null>(initial.markers?.length === 5 ? initial.markers : null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const dragIndex = useRef<number | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  useEffect(() => {
    writeUrlState({ mapId, dropZoneId, markers: markers ?? undefined })
  }, [mapId, dropZoneId, markers])

  const violations: Violation[] = useMemo(
    () => (markers ? chainViolations(markers, pieces, map, dropZone) : []),
    [markers, pieces, map, dropZone],
  )
  const isValid = violations.length === 0
  // The plan is not scored as a whole until it is valid (warn-but-allow UX).
  const currentScores: Scores | null = useMemo(
    () => (markers && isValid ? scoreChain(markers, ctx) : null),
    [markers, isValid, ctx],
  )
  const invalidMarkers = useMemo(() => new Set(violations.map((v) => v.marker)), [violations])

  function generate() {
    workerRef.current?.terminate()
    setGenerating(true)
    setError(null)
    setPlans([])
    setSelectedPlan(null)
    setProgress({ attempted: 0, totalAttempts: DEFAULT_ATTEMPTS, valid: 0, frontSize: 0 })
    const worker = new Worker(new URL('../worker/generator.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<GeneratorMessage>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress(msg)
      } else if (msg.type === 'done') {
        setPlans(msg.plans)
        setGenerating(false)
        setProgress(null)
        if (msg.plans.length > 0) {
          setSelectedPlan(0)
          setMarkers(msg.plans[0].markers)
        }
        worker.terminate()
      } else {
        setError(msg.message)
        setGenerating(false)
        setProgress(null)
        worker.terminate()
      }
    }
    worker.postMessage({ type: 'generate', map, catalogue, dropZoneId, attempts: DEFAULT_ATTEMPTS })
  }

  function selectDropZone(id: string) {
    setDropZoneId(id)
    setPlans([])
    setSelectedPlan(null)
    setMarkers(null)
  }

  function onMarkerPointerDown(index: number, e: React.PointerEvent) {
    dragIndex.current = index
    setSelectedPlan(null)
    ;(e.currentTarget.closest('svg') as SVGSVGElement)?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onBoardPointerMove(inches: Vec) {
    const i = dragIndex.current
    if (i === null || !markers) return
    const clamped = {
      x: Math.min(Math.max(inches.x, 0), map.widthIn),
      y: Math.min(Math.max(inches.y, 0), map.heightIn),
    }
    setMarkers(markers.map((m, k) => (k === i ? clamped : m)))
  }

  function onBoardPointerUp() {
    dragIndex.current = null
  }

  const homeId = ctx.homeObjective?.id

  return (
    <div className="planning">
      <aside className="sidebar">
        <section>
          <h2>Setup</h2>
          <label>
            Annotated map
            <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.draft ? ' (draft annotation)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Drop zone
            <select value={dropZoneId} onChange={(e) => selectDropZone(e.target.value)}>
              {map.dropZones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={generate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate tunnels'}
          </button>
          {progress && (
            <div className="progress">
              <progress value={progress.attempted} max={progress.totalAttempts} />
              <div className="progress-text">
                {Math.round((100 * progress.attempted) / progress.totalAttempts)}% — {progress.valid.toLocaleString()}{' '}
                valid, front {progress.frontSize}
              </div>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          {map.draft && (
            <p className="hint">
              ⚠ This map's annotation is a draft traced from the layout image. Verify it in Annotation mode.
            </p>
          )}
        </section>

        {markers && (
          <section>
            <h2>Current plan</h2>
            {violations.length > 0 ? (
              <ul className="violations">
                {violations.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            ) : currentScores ? (
              <table className="scores">
                <tbody>
                  {SCORE_AXES.map(({ key, label }) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{formatScore(key, currentScores[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <p className="hint">Drag markers to refine. Shareable link updates automatically.</p>
          </section>
        )}

        {plans.length > 0 && (
          <section>
            <h2>
              Generated Plans ({plans.length})
              <span className="plan-nav">
                <button
                  className="plan-nav-btn"
                  onClick={() => {
                    const i = Math.max(0, (selectedPlan ?? 0) - 1)
                    setSelectedPlan(i)
                    setMarkers(plans[i].markers)
                  }}
                  disabled={selectedPlan === null || selectedPlan === 0}
                  aria-label="Previous plan"
                >
                  ‹
                </button>
                <button
                  className="plan-nav-btn"
                  onClick={() => {
                    const i = Math.min(plans.length - 1, (selectedPlan ?? 0) + 1)
                    setSelectedPlan(i)
                    setMarkers(plans[i].markers)
                  }}
                  disabled={selectedPlan === null || selectedPlan === plans.length - 1}
                  aria-label="Next plan"
                >
                  ›
                </button>
              </span>
            </h2>
            <div className="plan-cards">
              {plans.map((plan, i) => (
                <button
                  key={i}
                  className={`plan-card${selectedPlan === i ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedPlan(i)
                    setMarkers(plan.markers)
                  }}
                >
                  <div className="plan-card-head">
                    <span>Plan {i + 1}</span>
                    <span className="wins">
                      {plan.wins.map((w) => (
                        <span key={w} className="win-badge" title={`Best ${AXIS_LABELS[w]}`}>
                          {AXIS_LABELS[w]}
                        </span>
                      ))}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

      </aside>

      <main className="board-pane">
        <Board map={map} onPointerMove={onBoardPointerMove} onPointerUp={onBoardPointerUp}>
          <DropZoneLayer dropZones={map.dropZones} activeId={dropZoneId} />
          <TerrainLayer pieces={pieces} />
          <ObjectiveLayer objectives={map.objectives} homeId={homeId} />
          {markers && (
            <TunnelLayer chain={markers} invalidMarkers={invalidMarkers} onMarkerPointerDown={onMarkerPointerDown} />
          )}
        </Board>
      </main>
    </div>
  )
}
