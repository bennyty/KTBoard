import { twJoin } from 'tailwind-merge'
import type { Chain, Scores } from '@/model/types'
import { SCORE_AXES } from '@/model/types'
import { normalizeAxis, weightedScore } from '@/scoring/weighted'
import type { NormContext } from '@/scoring/weighted'
import type { Violation } from '@/rules/validity'
import type { CandidateGroup, TunnelGenerator } from './useTunnelGenerator'
import type { TunnelCandidate } from '@/model/types'
import { Button, ErrorText, Field, Hint, Section } from '@/ui/components'

const AXIS_LABELS = Object.fromEntries(SCORE_AXES.map((a) => [a.key, a.label])) as Record<keyof Scores, string>

const TH = 'px-0.5 py-px text-xs font-semibold uppercase tracking-tighter text-muted'
const TD = 'px-0.5 py-px text-muted'
const TD_NUM = 'px-0.5 py-px text-right tabular-nums text-muted'
const TD_STRONG = 'px-0.5 py-px text-right tabular-nums text-text'

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
      <div className={twJoin('flex flex-col gap-2', dim && 'pointer-events-none opacity-40')}>
        {list.map((candidate, i) => {
          const selected = gen.selected?.group === group && gen.selected.index === i
          return (
            <Button
              key={i}
              className={twJoin('flex w-full flex-col gap-1.5 p-2 text-left', selected && 'border-accent bg-blue-950')}
              onClick={() => gen.selectCandidate(group, i)}
              disabled={dim || disabled}
            >
              <div className="flex items-baseline justify-between gap-1.5 font-semibold">
                <span>
                  Option {i + 1} · <strong>{weightedScore(candidate.scores, weights, norm).toFixed(1)}</strong>
                </span>
                <span className="flex flex-wrap justify-end gap-1">
                  {candidate.wins.map((w) => (
                    <span
                      key={w}
                      className="rounded-sm bg-accent-2 px-1 py-px text-xs font-bold text-black"
                      title={`Best ${AXIS_LABELS[w]}`}
                    >
                      {AXIS_LABELS[w]}
                    </span>
                  ))}
                </span>
              </div>
            </Button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <Section title="Tunnel generator">
        <Button variant="primary" onClick={gen.generate} disabled={gen.generating || disabled}>
          {gen.generating ? 'Generating…' : markers ? 'Regenerate tunnels' : 'Generate tunnels'}
        </Button>
        {markers && !gen.generating && (
          <Button variant="danger" onClick={onRemoveTunnel} disabled={disabled}>
            Remove tunnel from slide
          </Button>
        )}
        {!markers && !gen.generating && (
          <Button onClick={gen.generateOne} disabled={gen.generating || disabled}>
            {gen.generating ? 'Generating…' : 'Quick-add one tunnel'}
          </Button>
        )}
        {gen.progress && (
          <div className="flex flex-col gap-1">
            <progress className="w-full accent-accent" value={gen.progress.attempted} max={gen.progress.totalAttempts} />
            <div className="text-xs text-muted">
              {Math.round((100 * gen.progress.attempted) / gen.progress.totalAttempts)}% —{' '}
              {gen.progress.valid.toLocaleString()} valid, front {gen.progress.frontSize}
            </div>
          </div>
        )}
        {gen.error && <ErrorText>{gen.error}</ErrorText>}
        {draftMap && (
          <Hint>⚠ This map's annotation is a draft traced from the layout image. Verify it in Annotation mode.</Hint>
        )}
      </Section>

      {(gen.weightedCandidates.length > 0 || gen.paretoCandidates.length > 0) && (
        <Section>
          <details className="flex flex-col gap-2">
            <summary className="cursor-pointer text-sm uppercase tracking-tighter text-muted">Weight tuning</summary>
            <Hint>Adjust the weighted-sum priorities. Weighted options regenerate automatically; Pareto options stay fixed.</Hint>
            {SCORE_AXES.map(({ key, label }) => (
              <Field key={key} className="gap-1">
                <span className="flex items-baseline justify-between">
                  {label}
                  <span className="text-text tabular-nums">{weights[key]}</span>
                </span>
                <input
                  type="range"
                  className="w-full p-0 accent-accent"
                  min={0}
                  max={10}
                  step={1}
                  value={weights[key]}
                  disabled={gen.generating || disabled}
                  onChange={(e) => gen.setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                />
              </Field>
            ))}
          </details>
        </Section>
      )}

      {markers && (
        <Section title="Current tunnel">
          {violations.length > 0 ? (
            <ul className="m-0 list-disc pl-4 text-sm text-orange-300">
              {violations.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          ) : currentScores ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={twJoin(TH, 'text-left')}>Metric</th>
                  <th className={twJoin(TH, 'text-right')}>Value</th>
                  <th className={twJoin(TH, 'text-right')}>Norm</th>
                  <th className={twJoin(TH, 'text-right')}>Weighted</th>
                </tr>
              </thead>
              <tbody>
                {SCORE_AXES.map(({ key, label }) => {
                  const normalized = normalizeAxis(key, currentScores, norm)
                  return (
                    <tr key={key}>
                      <td className={TD}>{label}</td>
                      <td className={TD_NUM}>{formatScore(key, currentScores[key])}</td>
                      <td className={TD_NUM}>{normalized.toFixed(2)}</td>
                      <td className={TD_STRONG}>{(weights[key] * normalized).toFixed(2)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td className="border-t border-edge px-0.5 py-px font-semibold text-text" colSpan={3}>
                    Total (weighted)
                  </td>
                  <td className="border-t border-edge px-0.5 py-px text-right font-semibold tabular-nums text-text">
                    {weightedScore(currentScores, weights, norm).toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : null}
          <Hint>Drag markers on the board to refine.</Hint>
        </Section>
      )}

      {gen.weightedCandidates.length > 0 && (
        <Section title={`Weighted options (${gen.weightedCandidates.length})`}>
          {renderCandidates('weighted', gen.weightedCandidates, gen.tuning)}
        </Section>
      )}

      {gen.paretoCandidates.length > 0 && (
        <Section title={`Pareto options (${gen.paretoCandidates.length})`}>
          {renderCandidates('pareto', gen.paretoCandidates)}
        </Section>
      )}
    </>
  )
}
