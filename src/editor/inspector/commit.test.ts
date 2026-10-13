import { describe, expect, it } from 'vitest'
import { normalizeInput } from './commit'
import type { PropDef } from './registry'

const def = (o: Partial<PropDef>): PropDef => ({
  key: 'width',
  group: 'size',
  label: { ja: '', en: '' },
  type: 'length',
  deviceOverridable: true,
  ...o,
})

describe('normalizeInput', () => {
  it('number: parses and clamps', () => {
    const d = def({ type: 'number', min: 0, max: 1 })
    expect(normalizeInput(d, '0.5')).toBe(0.5)
    expect(normalizeInput(d, '2')).toBe(1)
    expect(normalizeInput(d, '-1')).toBe(0)
    expect(normalizeInput(d, 'abc')).toBeUndefined()
    expect(normalizeInput(d, '')).toBeUndefined()
  })

  it('length: bare number becomes px, unit and keyword are kept', () => {
    const d = def({ min: 0 })
    expect(normalizeInput(d, '10')).toBe('10px')
    expect(normalizeInput(d, '50%')).toBe('50%')
    expect(normalizeInput(d, ' 2rem ')).toBe('2rem')
    expect(normalizeInput(d, 'AUTO')).toBe('auto')
    expect(normalizeInput(d, '-5')).toBe('0px')
    expect(normalizeInput(d, '-5%')).toBe('0%')
    expect(normalizeInput(d, 'calc(100% - 4px)')).toBe('calc(100% - 4px)')
    expect(normalizeInput(d, '')).toBeUndefined()
  })

  it('length: lineHeight keeps unitless numbers', () => {
    const d = def({ key: 'lineHeight', group: 'typography', min: 0 })
    expect(normalizeInput(d, '1.5')).toBe('1.5')
    expect(normalizeInput(d, '24')).toBe('24')
    expect(normalizeInput(d, '24px')).toBe('24px')
  })

  it('rejects characters that break the style string in css groups', () => {
    expect(normalizeInput(def({ type: 'text', group: 'layout', key: 'x' }), 'a; b')).toBeUndefined()
    expect(normalizeInput(def({ type: 'length' }), '1px;color:red')).toBeUndefined()
    expect(normalizeInput(def({ type: 'color' }), 'red}')).toBeUndefined()
  })

  it('text: content and custom accept anything and keep whitespace', () => {
    const d = def({ type: 'text', group: 'content', key: 'text' })
    expect(normalizeInput(d, ' a<b> {x}; ')).toBe(' a<b> {x}; ')
    expect(normalizeInput(d, '')).toBe('')
    expect(normalizeInput(def({ type: 'text', group: 'custom', key: 'customCss' }), 'a{b:c}')).toBe(
      'a{b:c}',
    )
  })

  it('text in css groups is trimmed; select/color reject empty', () => {
    expect(
      normalizeInput(def({ type: 'text', group: 'transform', key: 'transform' }), ' none '),
    ).toBe('none')
    expect(normalizeInput(def({ type: 'select' }), '')).toBeUndefined()
    expect(normalizeInput(def({ type: 'color' }), '#fff')).toBe('#fff')
  })
})
