import { describe, expect, it } from 'vitest'
import { getRotation } from '../canvas/transform'
import {
  composeTransform,
  formatLength,
  formatLinearGradient,
  formatShadows,
  parseLength,
  parseLinearGradient,
  parseShadows,
  parseTransform,
  splitTop,
} from './values'

describe('splitTop', () => {
  it('splits only outside parentheses', () => {
    expect(splitTop('0 0 4px rgba(0, 0, 0, .5), 1px 1px red', ',')).toEqual([
      '0 0 4px rgba(0, 0, 0, .5)',
      '1px 1px red',
    ])
    expect(splitTop('1px  rgb(0, 0, 0)', ' ')).toEqual(['1px', 'rgb(0, 0, 0)'])
  })
})

describe('length', () => {
  it('parses values, units and keywords', () => {
    expect(parseLength('10px')).toEqual({ value: 10, unit: 'px' })
    expect(parseLength('50%')).toEqual({ value: 50, unit: '%' })
    expect(parseLength('-1.5rem')).toEqual({ value: -1.5, unit: 'rem' })
    expect(parseLength('1.5')).toEqual({ value: 1.5, unit: '' })
    expect(parseLength(12)).toEqual({ value: 12, unit: 'px' })
    expect(parseLength('auto')).toEqual({ keyword: 'auto' })
    expect(parseLength('calc(100% - 4px)')).toBeUndefined()
    expect(parseLength('var(--x)')).toBeUndefined()
    expect(parseLength(undefined)).toBeUndefined()
  })
  it('formats back', () => {
    expect(formatLength({ value: 10, unit: 'px' })).toBe('10px')
    expect(formatLength({ value: 0.3333333, unit: 'rem' })).toBe('0.3333rem')
    expect(formatLength({ keyword: 'auto' })).toBe('auto')
  })
})

describe('shadow', () => {
  it('parses multiple box shadows', () => {
    const r = parseShadows('0px 2px 4px rgba(0, 0, 0, 0.5), inset 1px 1px 0px 2px #fff')
    expect(r).toEqual([
      { inset: false, x: 0, y: 2, blur: 4, spread: 0, color: 'rgba(0, 0, 0, 0.5)' },
      { inset: true, x: 1, y: 1, blur: 0, spread: 2, color: '#fff' },
    ])
  })
  it('handles none / empty / color-first order', () => {
    expect(parseShadows('none')).toEqual([])
    expect(parseShadows(undefined)).toEqual([])
    expect(parseShadows('red 1px 2px')).toEqual([
      { inset: false, x: 1, y: 2, blur: 0, spread: 0, color: 'red' },
    ])
  })
  it('rejects unsupported input', () => {
    expect(parseShadows('1px')).toBeUndefined()
    expect(parseShadows('1em 1em red')).toBeUndefined()
    expect(parseShadows('inset 1px 1px red', 'text')).toBeUndefined()
    expect(parseShadows('1px 1px 1px 1px red', 'text')).toBeUndefined()
  })
  it('round-trips', () => {
    const s = '0px 2px 4px rgba(0, 0, 0, 0.5), inset 1px 1px 0px 2px #fff'
    expect(formatShadows(parseShadows(s)!)).toBe(s)
    expect(formatShadows([])).toBe('none')
    expect(formatShadows(parseShadows('1px 2px 3px red', 'text')!, 'text')).toBe('1px 2px 3px red')
  })
})

describe('linear-gradient', () => {
  it('parses angle and stops', () => {
    expect(parseLinearGradient('linear-gradient(90deg, #fff 0%, rgba(0, 0, 0, 0.5) 100%)')).toEqual(
      {
        angle: 90,
        stops: [
          { color: '#fff', pos: 0 },
          { color: 'rgba(0, 0, 0, 0.5)', pos: 100 },
        ],
      },
    )
  })
  it('parses direction keywords and default direction', () => {
    expect(parseLinearGradient('linear-gradient(to right, red, blue)')).toEqual({
      angle: 90,
      stops: [{ color: 'red' }, { color: 'blue' }],
    })
    expect(parseLinearGradient('linear-gradient(red, blue)')?.angle).toBe(180)
  })
  it('rejects unsupported input', () => {
    expect(parseLinearGradient('radial-gradient(red, blue)')).toBeUndefined()
    expect(parseLinearGradient('linear-gradient(red)')).toBeUndefined()
    expect(parseLinearGradient('linear-gradient(red 10% 20%, blue)')).toBeUndefined()
    expect(parseLinearGradient('linear-gradient(to top right, red, blue)')).toBeUndefined()
    expect(parseLinearGradient(1)).toBeUndefined()
  })
  it('round-trips', () => {
    const s = 'linear-gradient(45deg, #ff0000 0%, #0000ff 100%)'
    expect(formatLinearGradient(parseLinearGradient(s)!)).toBe(s)
  })
})

describe('transform', () => {
  it('decomposes and composes in canonical order', () => {
    const s = 'translate(10px, 5px) rotate(30deg) scale(1.2, 1.2) skew(5deg, 0deg)'
    const p = parseTransform(s)!
    expect(p).toMatchObject({ translateX: 10, translateY: 5, rotate: 30, scaleX: 1.2, skewX: 5 })
    expect(composeTransform(p)).toBe(s)
  })
  it('treats none / empty / undefined as identity', () => {
    expect(composeTransform(parseTransform('none')!)).toBe('none')
    expect(composeTransform(parseTransform('')!)).toBe('none')
    expect(composeTransform(parseTransform(undefined)!)).toBe('none')
  })
  it('accepts single-axis and one-arg forms', () => {
    expect(parseTransform('translateX(10px)')).toMatchObject({ translateX: 10, translateY: 0 })
    expect(parseTransform('scale(2)')).toMatchObject({ scaleX: 2, scaleY: 2 })
    expect(parseTransform('rotate(0)')).toMatchObject({ rotate: 0 })
  })
  it('rejects what it cannot represent faithfully', () => {
    expect(parseTransform('rotate(30deg) translate(10px, 0px)')).toBeUndefined() // 順序違い
    expect(parseTransform('rotate(10deg) rotate(20deg)')).toBeUndefined() // 重複
    expect(parseTransform('matrix(1, 0, 0, 1, 0, 0)')).toBeUndefined()
    expect(parseTransform('rotate(30)')).toBeUndefined() // 単位なし
    expect(parseTransform('translate(10%, 0px)')).toBeUndefined()
    expect(parseTransform('rotate(1deg) foo')).toBeUndefined()
  })
  it('stays compatible with the canvas rotation reader', () => {
    expect(getRotation(composeTransform({ ...parseTransform('none')!, rotate: 30 }))).toBe(30)
  })
})
