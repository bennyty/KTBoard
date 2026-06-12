import { forwardRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { AnnotatedMap, Vec } from '@/model/types'
import type { PxTransform } from '@/geometry/transform'
import { pxToInches } from '@/geometry/transform'
import { useImageSize } from './useImageSize'
import { clientToSvg } from './svgPointer'

export function mapTransform(map: AnnotatedMap): PxTransform {
  return { originPx: map.originPx, pxPerInchX: map.pxPerInchX, pxPerInchY: map.pxPerInchY }
}

export interface BoardProps {
  map: AnnotatedMap
  /** Crop the view to the killzone (planning) or show the whole image (annotation). */
  fullImage?: boolean
  /** Children render in killzone-inch coordinates. */
  children: ReactNode
  onPointerDown?: (inches: Vec, e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove?: (inches: Vec, e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp?: (inches: Vec, e: React.PointerEvent<SVGSVGElement>) => void
}

/**
 * The board SVG uses image-pixel viewBox coordinates; all geometry children
 * render in inches inside a single scaling <g>. The image is decoration —
 * after calibration, inches are the source of truth.
 */
export const Board = forwardRef<SVGSVGElement, BoardProps>(function Board(
  { map, fullImage, children, onPointerDown, onPointerMove, onPointerUp },
  ref,
) {
  const imgSize = useImageSize(map.image)
  const t = useMemo(() => mapTransform(map), [map])

  const kzPx = {
    x: map.originPx.x,
    y: map.originPx.y,
    w: map.widthIn * map.pxPerInchX,
    h: map.heightIn * map.pxPerInchY,
  }
  const viewBox = fullImage && imgSize
    ? `0 0 ${imgSize.width} ${imgSize.height}`
    : `${kzPx.x} ${kzPx.y} ${kzPx.w} ${kzPx.h}`

  const toInches = (e: React.PointerEvent<SVGSVGElement>) =>
    pxToInches(t, clientToSvg(e.currentTarget, e.clientX, e.clientY))

  return (
    <svg
      ref={ref}
      className="board"
      viewBox={viewBox}
      onPointerDown={onPointerDown ? (e) => onPointerDown(toInches(e), e) : undefined}
      onPointerMove={onPointerMove ? (e) => onPointerMove(toInches(e), e) : undefined}
      onPointerUp={onPointerUp ? (e) => onPointerUp(toInches(e), e) : undefined}
    >
      {map.image && imgSize && (
        <image href={map.image} x={0} y={0} width={imgSize.width} height={imgSize.height} />
      )}
      <g transform={`translate(${t.originPx.x} ${t.originPx.y}) scale(${t.pxPerInchX} ${t.pxPerInchY})`}>
        <rect
          x={0}
          y={0}
          width={map.widthIn}
          height={map.heightIn}
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={0.05}
        />
        {children}
      </g>
    </svg>
  )
})
