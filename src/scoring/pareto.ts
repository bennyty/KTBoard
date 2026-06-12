/** Incremental Pareto front over maximize-everything vectors.
 *  See docs/adr/0001-pareto-front-scoring.md for why dominance, not weights. */

export interface FrontEntry<T> {
  vector: number[]
  item: T
}

/** a dominates b: ≥ on every axis, > on at least one. */
export function dominates(a: number[], b: number[]): boolean {
  let strict = false
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return false
    if (a[i] > b[i]) strict = true
  }
  return strict
}

export class ParetoFront<T> {
  entries: FrontEntry<T>[] = []
  /** Rounded-vector keys, to drop near-duplicate candidates that would bloat the front. */
  private seen = new Set<string>()

  private key(v: number[]): string {
    return v.map((x) => Math.round(x * 20)).join(',') // 0.05 resolution
  }

  /** Returns true if the candidate was admitted to the front. */
  offer(vector: number[], item: T): boolean {
    for (const e of this.entries) {
      if (dominates(e.vector, vector)) return false
    }
    const k = this.key(vector)
    if (this.seen.has(k)) return false
    this.seen.add(k)
    this.entries = this.entries.filter((e) => !dominates(vector, e.vector))
    this.entries.push({ vector, item })
    return true
  }

  get size(): number {
    return this.entries.length
  }
}
