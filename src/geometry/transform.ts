import type { Vec } from '@/model/types'

/** Pixel↔inch affine transform. This is the load-bearing calibration:
 *  all stored geometry is in inches; pixels exist only at I/O boundaries. */
export interface PxTransform {
  originPx: Vec
  pxPerInchX: number
  pxPerInchY: number
}

export function inchesToPx(t: PxTransform, p: Vec): Vec {
  return { x: t.originPx.x + p.x * t.pxPerInchX, y: t.originPx.y + p.y * t.pxPerInchY }
}

export function pxToInches(t: PxTransform, p: Vec): Vec {
  return { x: (p.x - t.originPx.x) / t.pxPerInchX, y: (p.y - t.originPx.y) / t.pxPerInchY }
}

/**
 * Calibrate from two opposite killzone corners clicked in image pixels:
 * cornerA ↔ inch (0,0), cornerB ↔ inch (widthIn, heightIn).
 */
export function calibrate(cornerA: Vec, cornerB: Vec, widthIn: number, heightIn: number): PxTransform {
  return {
    originPx: cornerA,
    pxPerInchX: (cornerB.x - cornerA.x) / widthIn,
    pxPerInchY: (cornerB.y - cornerA.y) / heightIn,
  }
}
