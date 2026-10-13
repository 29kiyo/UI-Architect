import { describe, expect, it } from 'vitest'
import {
  addShadow,
  addStop,
  clampShadow,
  DEFAULT_GRADIENT,
  removeAt,
  removeStop,
  setTransformPart,
  updateAt,
  updateStop,
} from './editing'
import { IDENTITY_TRANSFORM } from './values'

describe('shadow editing', () => {
  it('adds, updates and removes without mutating', () => {
    const a = addShadow([])
    const b = addShadow(a)
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(2)
    const c = updateAt(b, 1, { x: 5 })
    expect(c[1]!.x).toBe(5)
    expect(b[1]!.x).toBe(0)
    expect(removeAt(c, 0)).toHaveLength(1)
  })
  it('clamps negative blur', () => {
    expect(clampShadow({ ...addShadow([])[0]!, blur: -3 }).blur).toBe(0)
  })
})

describe('gradient editing', () => {
  it('adds a stop at 100% with the last color', () => {
    const g = addStop(DEFAULT_GRADIENT)
    expect(g.stops).toHaveLength(3)
    expect(g.stops[2]).toEqual({ color: '#000000', pos: 100 })
  })
  it('keeps at least 2 stops', () => {
    expect(removeStop(DEFAULT_GRADIENT, 0)).toBe(DEFAULT_GRADIENT)
    expect(removeStop(addStop(DEFAULT_GRADIENT), 1).stops).toHaveLength(2)
  })
  it('updates a stop immutably', () => {
    const g = updateStop(DEFAULT_GRADIENT, 0, { color: 'red' })
    expect(g.stops[0]!.color).toBe('red')
    expect(DEFAULT_GRADIENT.stops[0]!.color).toBe('#ffffff')
  })
})

describe('transform editing', () => {
  it('sets a part and ignores non-finite values', () => {
    const t = setTransformPart(IDENTITY_TRANSFORM, 'rotate', 45)
    expect(t.rotate).toBe(45)
    expect(setTransformPart(t, 'rotate', NaN)).toBe(t)
  })
})
