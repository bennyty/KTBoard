import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chain, ScoredPlan, Scores, Vec } from '@/model/types'
import { SCORE_AXES } from '@/model/types'
import { getCatalogue, getMap, maps } from '@/data/registry'
import { resolveMapPieces, DEFAULT_ATTEMPTS, TUNE_ATTEMPTS } from '@/scoring/generate'
import type { GenerateResult } from '@/scoring/generate'
import { DEFAULT_WEIGHTS, makeNormContext, normalizeAxis, weightedScore } from '@/scoring/weighted'
import type { WeightConfig } from '@/scoring/weighted'
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

type PlanGroup = 'weighted' | 'pareto'
interface Selection {
  group: PlanGroup
  index: number
}

function formatScore(key: keyof Scores, v: number): string {
  switch (key) {
    case 'objectiveDistance':
      return v.toFixed(2)
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
  const norm = useMemo(() => makeNormContext(map, dropZone), [map, dropZone])

  const [weightedPlans, setWeightedPlans] = useState<ScoredPlan[]>([])
  const [paretoPlans, setParetoPlans] = useState<ScoredPlan[]>([])
  const [weights, setWeights] = useState<WeightConfig>(DEFAULT_WEIGHTS)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [markers, setMarkers] = useState<Chain | null>(initial.markers?.length === 5 ? initial.markers : null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [generating, setGenerating] = useState(false)
  const [tuning, setTuning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const dragIndex = useRef<number | null>(null)
  // True once a full generation has produced a Pareto front to keep stable
  // while only the weighted plans re-tune.
  const generatedRef = useRef(false)

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

  /** Spawn a fresh worker for one generation pass. Cancels any in-flight run. */
  function runGeneration(opts: {
    attempts: number
    weights: WeightConfig
    onProgress?: (p: Progress) => void
    onDone: (res: GenerateResult) => void
    onError: (msg: string) => void
  }) {
    workerRef.current?.terminate()
    const worker = new Worker(new URL('../worker/generator.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<GeneratorMessage>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        opts.onProgress?.(msg)
      } else if (msg.type === 'done') {
        opts.onDone(msg)
        worker.terminate()
      } else {
        opts.onError(msg.message)
        worker.terminate()
      }
    }
    worker.postMessage({ type: 'generate', map, catalogue, dropZoneId, attempts: opts.attempts, weights: opts.weights })
  }

  /** Full generation: rebuilds both the Pareto and weighted plan sets. */
  function generate() {
    setGenerating(true)
    setError(null)
    setWeightedPlans([])
    setParetoPlans([])
    setSelected(null)
    generatedRef.current = false
    setProgress({ attempted: 0, totalAttempts: DEFAULT_ATTEMPTS, valid: 0, frontSize: 0 })
    runGeneration({
      attempts: DEFAULT_ATTEMPTS,
      weights,
      onProgress: setProgress,
      onDone: (res) => {
        setWeightedPlans(res.weightedPlans)
        setParetoPlans(res.paretoPlans)
        setGenerating(false)
        setProgress(null)
        generatedRef.current = true
        const first = res.weightedPlans[0] ?? res.paretoPlans[0]
        if (first) {
          setSelected(res.weightedPlans[0] ? { group: 'weighted', index: 0 } : { group: 'pareto', index: 0 })
          setMarkers(first.markers)
        }
      },
      onError: (m) => {
        setError(m)
        setGenerating(false)
        setProgress(null)
      },
    })
  }

  // Re-tune only the weighted plans when weights change (debounced), reusing
  // the cheaper attempt budget so the sliders stay responsive. The Pareto plans
  // stay fixed from the last full generation.
  useEffect(() => {
    if (!generatedRef.current) return
    const t = setTimeout(() => {
      setTuning(true)
      runGeneration({
        attempts: TUNE_ATTEMPTS,
        weights,
        onDone: (res) => {
          setWeightedPlans(res.weightedPlans)
          setTuning(false)
          setSelected((sel) => {
            if (sel?.group !== 'weighted') return sel
            if (res.weightedPlans.length === 0) return null
            const index = Math.min(sel.index, res.weightedPlans.length - 1)
            setMarkers(res.weightedPlans[index].markers)
            return { group: 'weighted', index }
          })
        },
        onError: (m) => {
          setError(m)
          setTuning(false)
        },
      })
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights])

  function resetPlans() {
    setWeightedPlans([])
    setParetoPlans([])
    setSelected(null)
    setMarkers(null)
    generatedRef.current = false
  }

  function selectMap(id: string) {
    setMapId(id)
    resetPlans()
  }

  function selectDropZone(id: string) {
    setDropZoneId(id)
    resetPlans()
  }

  function selectPlan(group: PlanGroup, index: number, plan: ScoredPlan) {
    setSelected({ group, index })
    setMarkers(plan.markers)
  }

  function onMarkerPointerDown(index: number, e: React.PointerEvent) {
    dragIndex.current = index
    setSelected(null)
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

  function renderPlanList(group: PlanGroup, list: ScoredPlan[], dim = false) {
    return (
      <div className={`plan-cards${dim ? ' dim' : ''}`}>
        {list.map((plan, i) => (
          <button
            key={i}
            className={`plan-card${selected?.group === group && selected.index === i ? ' selected' : ''}`}
            onClick={() => selectPlan(group, i, plan)}
            disabled={dim}
          >
            <div className="plan-card-head">
              <span>
                Plan {i + 1} · <strong>{weightedScore(plan.scores, weights, norm).toFixed(1)}</strong>
              </span>
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
    )
  }

  return (
    <div className="planning">
      <aside className="sidebar">
        <section>
          <h2>Setup</h2>
          <label>
            Annotated map
            <select value={mapId} onChange={(e) => selectMap(e.target.value)}>
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

        {(weightedPlans.length > 0 || paretoPlans.length > 0) && (
          <section>
            <details className="weight-tuning">
              <summary>Weight tuning</summary>
              <p className="hint">
                Adjust the weighted-sum priorities. Weighted plans regenerate automatically; Pareto plans stay fixed.
              </p>
              {SCORE_AXES.map(({ key, label }) => (
                <label key={key} className="weight-slider">
                  <span className="weight-slider-head">
                    {label}
                    <span className="weight-value">{weights[key]}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={weights[key]}
                    disabled={generating}
                    onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </details>
          </section>
        )}

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
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Norm</th>
                    <th>Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_AXES.map(({ key, label }) => {
                    const normalized = normalizeAxis(key, currentScores, norm)
                    return (
                      <tr key={key}>
                        <td>{label}</td>
                        <td>{formatScore(key, currentScores[key])}</td>
                        <td>{normalized.toFixed(2)}</td>
                        <td>{(weights[key] * normalized).toFixed(2)}</td>
                      </tr>
                    )
                  })}
                  <tr className="scores-total">
                    <td colSpan={3}>Total (weighted)</td>
                    <td>{weightedScore(currentScores, weights, norm).toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}
            <p className="hint">Drag markers to refine. Shareable link updates automatically.</p>
          </section>
        )}

        {weightedPlans.length > 0 && (
          <section>
            <h2>Weighted plans ({weightedPlans.length})</h2>
            {renderPlanList('weighted', weightedPlans, tuning)}
          </section>
        )}

        {paretoPlans.length > 0 && (
          <section>
            <h2>Pareto plans ({paretoPlans.length})</h2>
            {renderPlanList('pareto', paretoPlans)}
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
