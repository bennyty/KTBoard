import { describe, expect, it } from 'vitest'
import { calibrate, inchesToPx, pxToInches } from './transform'

describe('pixel↔inch transform', () => {
  // Volkus-1-like calibration: image ~599×443px for a 30×22in killzone.
  const t = calibrate({ x: 0, y: 0 }, { x: 599, y: 443 }, 30, 22)

  it('maps calibration corners exactly', () => {
    expect(inchesToPx(t, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    const br = inchesToPx(t, { x: 30, y: 22 })
    expect(br.x).toBeCloseTo(599, 9)
    expect(br.y).toBeCloseTo(443, 9)
  })

  it('round-trips arbitrary points: inches → px → inches', () => {
    const pts = [
      { x: 15, y: 11 },
      { x: 0.3937, y: 21.5 },
      { x: 29.99, y: 0.01 },
    ]
    for (const p of pts) {
      const back = pxToInches(t, inchesToPx(t, p))
      expect(back.x).toBeCloseTo(p.x, 9)
      expect(back.y).toBeCloseTo(p.y, 9)
    }
  })

  it('handles a calibration with a nonzero origin (image border)', () => {
    const t2 = calibrate({ x: 12, y: 8 }, { x: 612, y: 448 }, 30, 22)
    expect(pxToInches(t2, { x: 12, y: 8 })).toEqual({ x: 0, y: 0 })
    expect(inchesToPx(t2, { x: 15, y: 11 })).toEqual({ x: 312, y: 228 })
    const back = pxToInches(t2, inchesToPx(t2, { x: 7.25, y: 13.5 }))
    expect(back.x).toBeCloseTo(7.25, 9)
    expect(back.y).toBeCloseTo(13.5, 9)
  })
})
