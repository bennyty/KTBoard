import type { Chain, Scores } from '@/model/types'
import { SCORE_AXES } from '@/model/types'
import { normalizeAxis, weightedScore } from '@/scoring/weighted'
import type { NormContext } from '@/scoring/weighted'
import type { Violation } from '@/rules/validity'
import type { CandidateGroup, TunnelGenerator } from './useTunnelGenerator'
import type { TunnelCandidate } from '@/model/types'

const AXIS_LABELS = Object.fromEntries(SCORE_AXES.map((a) => [a.key, a.label])) as Record<keyof Scores, string>

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

export function TunnelTab({
  gen,
  markers,
  violations,
  currentScores,
  norm,
  disabled,
  onRemoveTunnel,
  draftMap,
}: {
  gen: TunnelGenerator
  markers: Chain | null
  violations: Violation[]
  currentScores: Scores | null
  norm: NormContext
  disabled: boolean
  onRemoveTunnel(): void
  draftMap: boolean
}) {
  const { weights } = gen

  function renderCandidates(group: CandidateGroup, list: TunnelCandidate[], dim = false) {
    return (
      <div className={`plan-cards${dim ? ' dim' : ''}`}>
        {list.map((candidate, i) => (
          <button
            key={i}
            className={`plan-card${gen.selected?.group === group && gen.selected.index === i ? ' selected' : ''}`}
            onClick={() => gen.selectCandidate(group, i)}
            disabled={dim || disabled}
          >
            <div className="plan-card-head">
              <span>
                Option {i + 1} · <strong>{weightedScore(candidate.scores, weights, norm).toFixed(1)}</strong>
              </span>
              <span className="wins">
                {candidate.wins.map((w) => (
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
    <>
      <section>
        <h2>Tunnel generator</h2>
        <button className="primary" onClick={gen.generate} disabled={gen.generating || disabled}>
          {gen.generating ? 'Generating…' : markers ? 'Regenerate tunnels' : 'Generate tunnels'}
        </button>
        {markers && !gen.generating && (
          <button className="danger" onClick={onRemoveTunnel} disabled={disabled}>
            Remove tunnel from slide
          </button>
        )}
        {gen.progress && (
          <div className="progress">
            <progress value={gen.progress.attempted} max={gen.progress.totalAttempts} />
            <div className="progress-text">
              {Math.round((100 * gen.progress.attempted) / gen.progress.totalAttempts)}% —{' '}
              {gen.progress.valid.toLocaleString()} valid, front {gen.progress.frontSize}
            </div>
          </div>
        )}
        {gen.error && <div className="error">{gen.error}</div>}
        {draftMap && (
          <p className="hint">⚠ This map's annotation is a draft traced from the layout image. Verify it in Annotation mode.</p>
        )}
      </section>

      {(gen.weightedCandidates.length > 0 || gen.paretoCandidates.length > 0) && (
        <section>
          <details className="weight-tuning">
            <summary>Weight tuning</summary>
            <p className="hint">Adjust the weighted-sum priorities. Weighted options regenerate automatically; Pareto options stay fixed.</p>
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
                  disabled={gen.generating || disabled}
                  onChange={(e) => gen.setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </details>
        </section>
      )}

      {markers && (
        <section>
          <h2>Current tunnel</h2>
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
          <p className="hint">Drag markers on the board to refine.</p>
        </section>
      )}

      {gen.weightedCandidates.length > 0 && (
        <section>
          <h2>Weighted options ({gen.weightedCandidates.length})</h2>
          {renderCandidates('weighted', gen.weightedCandidates, gen.tuning)}
        </section>
      )}

      {gen.paretoCandidates.length > 0 && (
        <section>
          <h2>Pareto options ({gen.paretoCandidates.length})</h2>
          {renderCandidates('pareto', gen.paretoCandidates)}
        </section>
      )}
    </>
  )
}
