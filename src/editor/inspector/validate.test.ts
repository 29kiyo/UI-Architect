import { describe, expect, it } from 'vitest'
import type { PropDef } from './registry'
import { validateInput, validationMessage } from './validate'

const def = (o: Partial<PropDef>): PropDef => ({
  key: 'width',
  group: 'size',
  label: { ja: '', en: '' },
  type: 'length',
  units: ['px', '%', 'rem', 'auto'],
  deviceOverridable: true,
  ...o,
})

describe('validateInput', () => {
  it('gives a reason for rejected input', () => {
    expect(validateInput(def({}), '')).toEqual({ ok: false, reason: 'empty' })
    expect(validateInput(def({}), '1px;x')).toEqual({ ok: false, reason: 'forbidden' })
    expect(validateInput(def({ type: 'number' }), 'abc')).toEqual({ ok: false, reason: 'nan' })
    expect(validateInput(def({ type: 'color' }), 'red}')).toEqual({
      ok: false,
      reason: 'forbidden',
    })
  })
  it('flags clamped values for number and length', () => {
    expect(validateInput(def({ type: 'number', min: 0, max: 1 }), '2')).toEqual({
      ok: true,
      value: 1,
      clamped: true,
    })
    expect(validateInput(def({ min: 0 }), '-5')).toEqual({ ok: true, value: '0px', clamped: true })
    expect(validateInput(def({ min: 0 }), '5')).toEqual({ ok: true, value: '5px', clamped: false })
    expect(validateInput(def({ min: 0 }), 'auto')).toEqual({
      ok: true,
      value: 'auto',
      clamped: false,
    })
  })
  it('keeps content/custom free-form and allows clearing css text', () => {
    expect(validateInput(def({ type: 'text', group: 'content' }), ' a<b>;')).toEqual({
      ok: true,
      value: ' a<b>;',
      clamped: false,
    })
    expect(
      validateInput(def({ type: 'text', group: 'layout', key: 'gridTemplateRows' }), ''),
    ).toEqual({
      ok: true,
      value: '',
      clamped: false,
    })
  })
  it('builds messages in both languages', () => {
    const d = def({ min: 0, max: 10 })
    expect(validationMessage(validateInput(d, ''), d, 'ja')).toBe('値を入力してください')
    expect(validationMessage(validateInput(d, '-1'), d, 'en')).toBe('Clamped to range (0 to 10)')
    expect(validationMessage(validateInput(d, '3'), d, 'ja')).toBeUndefined()
  })
})
