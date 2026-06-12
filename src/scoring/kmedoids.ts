import type { Rng } from './rng'

/**
 * Pick k diverse representatives from points in score space (k-medoids,
 * k-means++-style seeding + alternating assignment/medoid updates).
 * Deterministic given the rng. Returns indices into `points`.
 */
export function kMedoids(points: number[][], k: number, rng: Rng): number[] {
  const n = points.length
  if (n <= k) return points.map((_, i) => i)

  // Normalize each axis to [0,1] so no axis dominates the distance metric.
  const dims = points[0].length
  const mins = new Array(dims).fill(Infinity)
  const maxs = new Array(dims).fill(-Infinity)
  for (const p of points) {
    for (let d = 0; d < dims; d++) {
      if (p[d] < mins[d]) mins[d] = p[d]
      if (p[d] > maxs[d]) maxs[d] = p[d]
    }
  }
  const norm = points.map((p) =>
    p.map((x, d) => (maxs[d] === mins[d] ? 0 : (x - mins[d]) / (maxs[d] - mins[d]))),
  )

  const dist2 = (a: number[], b: number[]) => {
    let s = 0
    for (let d = 0; d < dims; d++) {
      const dx = a[d] - b[d]
      s += dx * dx
    }
    return s
  }

  // k-means++ seeding.
  const medoids: number[] = [Math.floor(rng() * n)]
  const minD = new Array(n).fill(Infinity)
  while (medoids.length < k) {
    const last = norm[medoids[medoids.length - 1]]
    let total = 0
    for (let i = 0; i < n; i++) {
      const d = dist2(norm[i], last)
      if (d < minD[i]) minD[i] = d
      total += minD[i]
    }
    if (total === 0) {
      // All remaining points coincide with a medoid; fill arbitrarily.
      for (let i = 0; i < n && medoids.length < k; i++) {
        if (!medoids.includes(i)) medoids.push(i)
      }
      break
    }
    let target = rng() * total
    let pick = n - 1
    for (let i = 0; i < n; i++) {
      target -= minD[i]
      if (target <= 0) {
        pick = i
        break
      }
    }
    medoids.push(pick)
  }

  // Alternate assignment / medoid update.
  for (let iter = 0; iter < 10; iter++) {
    const clusters: number[][] = medoids.map(() => [])
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestD = Infinity
      for (let m = 0; m < medoids.length; m++) {
        const d = dist2(norm[i], norm[medoids[m]])
        if (d < bestD) {
          bestD = d
          best = m
        }
      }
      clusters[best].push(i)
    }
    let changed = false
    for (let m = 0; m < medoids.length; m++) {
      const cluster = clusters[m]
      if (cluster.length === 0) continue
      let bestIdx = medoids[m]
      let bestCost = Infinity
      for (const candidate of cluster) {
        let cost = 0
        for (const other of cluster) cost += dist2(norm[candidate], norm[other])
        if (cost < bestCost) {
          bestCost = cost
          bestIdx = candidate
        }
      }
      if (bestIdx !== medoids[m]) {
        medoids[m] = bestIdx
        changed = true
      }
    }
    if (!changed) break
  }

  return [...new Set(medoids)]
}
