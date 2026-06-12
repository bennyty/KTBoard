import type { Vec } from '@/model/types'

export const vec = (x: number, y: number): Vec => ({ x, y })

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y
export const len = (a: Vec): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)

export const normalize = (a: Vec): Vec => {
  const l = len(a)
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

export const rotateDeg = (p: Vec, deg: number): Vec => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Distance from point p to segment ab. */
export function distPointSegment(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a)
  const ap = sub(p, a)
  const abLen2 = dot(ab, ab)
  if (abLen2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, dot(ap, ab) / abLen2))
  return dist(p, add(a, scale(ab, t)))
}
