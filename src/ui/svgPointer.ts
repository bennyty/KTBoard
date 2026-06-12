import type { Vec } from '@/model/types'

/** Convert a pointer event to SVG viewBox (image pixel) coordinates. */
export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Vec {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}
