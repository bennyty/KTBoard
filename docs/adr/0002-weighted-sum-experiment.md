# Add weighted-sum scoring alongside Pareto front

Experiment with weighted-sum scoring as a parallel ranking strategy alongside the existing Pareto front approach.

## Context

ADR 0001 rejected weighted-sum scoring because "the user explicitly signalled that nailing down exact tactical weights 'isn't possible or helpful.'" The Pareto front was chosen to avoid committing to fixed weights.

However, early playtesting reveals that Pareto-ranked tunnels sometimes feel tactically poor despite being Pareto-optimal. The diversity that Pareto guarantees (trade-off between all axes) doesn't always align with human tactical intuition. The user believes that sensible weights *are* discoverable through iteration on real Kill Team tactical scenarios — the assumption in ADR 0001 may have been premature.

## Decision

Implement weighted-sum scoring as a **parallel** strategy:
- Generate ~500k candidate tunnel chains (same pool as Pareto)
- Score each using both approaches
- Present **5 highest-weighted-sum plans** and **5 Pareto-sampled plans** in the sidebar
- Use default weights reflecting a player's tactical priorities, tunable through iteration

The weighted-sum approach is an experiment to test whether the constraint in ADR 0001 (weights are impossible) actually holds. If tactically good tunnels emerge from weighted-sum, weights *are* discoverable. If weighted-sum continues to produce poor tunnels after weight iteration, the experiment is abandoned and Pareto remains the primary strategy.

## Alternatives considered

- **Stick with Pareto only.** Preserves the position of ADR 0001 but accepts that user feedback about tunnel quality may go unaddressed.
- **Replace Pareto entirely with weighted-sum.** Simpler to implement, but higher risk if weights prove unchosen or oscillating.
- **Support user-configurable weights in the UI.** Defers the weight-discovery problem to the player; more flexible but increases cognitive load.

## Why weighted-sum alongside Pareto (not instead of)

Both modes serve different needs:
- **Pareto** guarantees diversity and explores the trade-off space; useful for understanding what's possible.
- **Weighted-sum** optimizes for the user's tactical priorities; useful for finding a "best" plan to refine.

Showing both side-by-side lets the user see where weighted-sum differs from Pareto, and reveals whether the weights are making sense tactically.

## Initial weights

Default weights (to be iterated): `[6, 5, 4, 3, 2, 1]` for `[Objective distance, Forward reach, Center objective access, Home objective unburrow, Objective coverage, Zigzag]`.

These reflect an initial hypothesis about what matters most in Raveners play (proximity to objectives >> push forward >> speed to center >> safe home unburrow >> terrain coverage >> last priority is just crossing pieces). Weights will be adjusted based on the quality of generated tunnels.

## Consequences

- **Implementation:** 6-axis scoring at the boundary of Pareto viability (ADR 0001 warned that 6+ axes bloats the front, but both modes are supported).
- **UI:** Both plan sets visible in the sidebar, labeled clearly so users know which is which.
- **Iteration:** The user will adjust weights empirically based on playing with generated tunnels. This is a hypothesis-driven experiment, not a settled design.
- **Success criterion:** If weighted-sum produces tactically sound tunnels after 1–2 weight iterations, the experiment succeeds and weights *are* discoverable (ADR 0001's assumption is wrong). If weighted-sum produces poor tunnels regardless of weight tweaks, the feature is abandoned and Pareto remains primary.

## Open questions

- How many weight iterations will it take to find a good weighting?
- Will the weights differ across different maps/kiltzones, or is a single default sufficient?
- Should players be able to adjust weights themselves, or is developer iteration enough?
