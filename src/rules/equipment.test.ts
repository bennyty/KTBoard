import { describe, expect, it } from 'vitest'
import type { CircleObject, Objective, Polygon, RectObject, SlideObject } from '@/model/types'
import { RECT_PRESETS } from '@/model/constants'
import { equipmentViolations, isEquipment, rectCorners } from './equipment'

const preset = (name: string) => RECT_PRESETS.find((p) => p.name === name)!
const light = preset('Light Barricade')
const mines = preset('Mines')
const ladder = preset('Ladder')

function makeEquip(id: string, x: number, y: number, p = light, rotationDeg = 0): RectObject {
  return { id, kind: 'rect', x, y, rotationDeg, lengthMm: p.lengthMm, widthMm: p.widthMm, color: 'red', label: p.name }
}

function box(minX: number, maxX: number, minY = -1, maxY = 1): Polygon {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}

const obj = (x: number, y = 0): Objective => ({ id: `o-${x}`, role: 'other', center: { x, y } })

describe('isEquipment', () => {
  it('is true for a rect matching a preset footprint', () => {
    expect(isEquipment(makeEquip('a', 0, 0))).toBe(true)
  })

  it('is false for a rect that does not match any preset', () => {
    expect(isEquipment({ ...makeEquip('a', 0, 0), lengthMm: 33, widthMm: 33 })).toBe(false)
  })

  it('is false for non-rectangle objects', () => {
    const circle: CircleObject = { id: 'c', kind: 'circle', x: 0, y: 0, sizeMm: 32, color: 'red', label: '' }
    expect(isEquipment(circle)).toBe(false)
  })
})

describe('rectCorners', () => {
  it('places corners at the half-extents for an unrotated rect', () => {
    // Mines: 32mm × 10mm → 1.2598" × 0.3937"; half-extents ≈ 0.63", 0.197".
    const [c0] = rectCorners(makeEquip('a', 5, 5, mines))
    expect(c0.x).toBeCloseTo(5 - 0.6299, 3)
    expect(c0.y).toBeCloseTo(5 - 0.1969, 3)
  })
})

describe('equipmentViolations — equipment ↔ equipment', () => {
  it('flags two equipment pieces placed within 2"', () => {
    const objs: SlideObject[] = [makeEquip('a', 0, 0), makeEquip('b', 3, 0)]
    expect(equipmentViolations(objs)).toEqual(new Set(['a', 'b']))
  })

  it('does not flag equipment placed more than 2" apart', () => {
    const objs: SlideObject[] = [makeEquip('a', 0, 0), makeEquip('b', 8, 0)]
    expect(equipmentViolations(objs).size).toBe(0)
  })

  it('ignores plain (non-preset) rectangles', () => {
    const custom: RectObject = { ...makeEquip('b', 3, 0), lengthMm: 33, widthMm: 33 }
    const objs: SlideObject[] = [makeEquip('a', 0, 0), custom]
    expect(equipmentViolations(objs).size).toBe(0)
  })

  it('exempts Mines from equipment ↔ equipment spacing', () => {
    // A barricade and mines 1.5" apart: neither is flagged by the equipment rule.
    const objs: SlideObject[] = [makeEquip('a', 0, 0), makeEquip('b', 1.5, 0, mines)]
    expect(equipmentViolations(objs).size).toBe(0)
  })

  it('still spaces ladders from other equipment at 2"', () => {
    const objs: SlideObject[] = [makeEquip('a', 0, 0), makeEquip('b', 2, 0, ladder)]
    expect(equipmentViolations(objs)).toEqual(new Set(['a', 'b']))
  })
})

describe('equipmentViolations — accessible terrain', () => {
  it('flags a barricade within 2" of accessible terrain', () => {
    const objs: SlideObject[] = [makeEquip('a', 0, 0)]
    expect(equipmentViolations(objs, [box(2, 4)])).toEqual(new Set(['a']))
  })

  it('does not flag a barricade beyond 2" of accessible terrain', () => {
    const objs: SlideObject[] = [makeEquip('a', 0, 0)]
    expect(equipmentViolations(objs, [box(10, 12)]).size).toBe(0)
  })

  it('flags a ladder only within 1" of accessible terrain', () => {
    // Ladder half-extent ≈ 0.295". Region edge at x=1 → gap ≈ 0.70" (< 1"): flagged.
    expect(equipmentViolations([makeEquip('a', 0, 0, ladder)], [box(1, 3)])).toEqual(new Set(['a']))
    // Region edge at x=2 → gap ≈ 1.70" (> 1" but < 2"): a ladder is NOT flagged.
    expect(equipmentViolations([makeEquip('a', 0, 0, ladder)], [box(2, 4)]).size).toBe(0)
  })
})

describe('equipmentViolations — mines vs objectives', () => {
  it('flags mines within 2" of an objective edge', () => {
    // Mines half-extent ≈ 0.63", objective radius ≈ 0.787". Objective at x=2 →
    // edge gap ≈ 2 - 0.63 - 0.787 ≈ 0.58" (< 2"): flagged.
    expect(equipmentViolations([makeEquip('a', 0, 0, mines)], [], [obj(2)])).toEqual(new Set(['a']))
  })

  it('does not flag mines clear of the objective edge by more than 2"', () => {
    // Objective at x=5 → edge gap ≈ 5 - 0.63 - 0.787 ≈ 3.58" (> 2").
    expect(equipmentViolations([makeEquip('a', 0, 0, mines)], [], [obj(5)]).size).toBe(0)
  })

  it('does not apply the objective rule to non-mines equipment', () => {
    expect(equipmentViolations([makeEquip('a', 0, 0, light)], [], [obj(2)]).size).toBe(0)
  })
})
