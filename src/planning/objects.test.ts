import { describe, expect, it } from 'vitest'
import { ELLIPSE_PRESETS } from '@/model/constants'
import { ellipsePresetLabel, snapEllipsePreset } from './objects'

describe('snapEllipsePreset', () => {
  it('snaps an exact size to its own preset', () => {
    expect(snapEllipsePreset(60, 35)).toMatchObject({ name: 'Fenrisian Wolf' })
    expect(snapEllipsePreset(75, 42)).toMatchObject({ name: 'Exodite' })
  })

  it('snaps a near size to the closest preset', () => {
    expect(snapEllipsePreset(62, 33)).toMatchObject({ name: 'Fenrisian Wolf' })
    expect(snapEllipsePreset(78, 40)).toMatchObject({ name: 'Exodite' })
  })

  it('is orientation-agnostic (portrait drag picks the same preset as landscape)', () => {
    expect(snapEllipsePreset(35, 60)).toMatchObject({ name: 'Fenrisian Wolf' })
    expect(snapEllipsePreset(42, 75)).toMatchObject({ name: 'Exodite' })
  })

  it('snaps a bare click (zero size) to the smallest preset', () => {
    expect(snapEllipsePreset(0, 0)).toBe(ELLIPSE_PRESETS[0])
  })
})

describe('ellipsePresetLabel', () => {
  it('uses the name when present', () => {
    expect(ellipsePresetLabel({ name: 'Exodite', widthMm: 75, heightMm: 42 })).toBe('Exodite\n(75×42mm)')
  })

  it('falls back to dimensions when unnamed', () => {
    expect(ellipsePresetLabel({ name: '', widthMm: 90, heightMm: 52 })).toBe('90×52mm')
  })
})
