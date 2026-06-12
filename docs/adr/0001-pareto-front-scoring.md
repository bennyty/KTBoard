# Score candidate tunnels as a Pareto front, not a weighted sum

The MVP scorer ranks ~100k generated tunnel candidates against five soft criteria (Zigzag, Center objective access, Objective coverage, Home objective unburrow, Forward reach). We rank by **Pareto dominance** — retaining all candidates that no other candidate beats on every axis — and sample 6 plans for presentation via k-medoid clustering in score space.

## Considered alternatives

- **Weighted sum.** Each criterion gets a numeric weight; total score = Σ(weight × criterion). Rejected because the user explicitly signalled that nailing down exact tactical weights "isn't possible or helpful" — there is no honest weighting to commit to, and weighted-sum top-N tends to cluster around a single strategy. Picking arbitrary weights would impose an opinion the planner doesn't have.
- **Lexicographic priority.** Strict criterion ordering with tie-breakers. Rejected for the same reason — assumes a fixed priority the user explicitly disclaimed.

## Why this is non-obvious

Most score-and-rank tools weight. A reader skimming the scorer expecting `score = w1*a + w2*b + ...` will instead find a dominance comparator and a clustering step. The reason is the design constraint above: the scorer is *intentionally incomplete*. Top-6 plans are guaranteed to differ in trade-off, and the human applies tactical judgment to pick among them via drag-and-drop refinement. Diversity is the point, and Pareto + k-medoids gives it without weights.

## Consequences

- Adding or removing a scoring axis is cheap (just another comparator dimension) — but more than ~6 axes makes the Pareto front large and the diversity sampling less meaningful.
- The front must fit in worker memory; for 100k candidates on five axes this is comfortable (few hundred non-dominated candidates typically).
- The presentation layer must convey *why* each of the 6 shown plans is on the front (which axis it wins on) — otherwise the user sees six similar-looking tunnels with no obvious distinction.
