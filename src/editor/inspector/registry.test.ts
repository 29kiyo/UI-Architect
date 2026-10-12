import { describe, expect, it } from 'vitest'
import { createPropRegistry, type PropDef } from './registry'

const def = (over: Partial<PropDef> = {}): PropDef => ({
  key: 'width',
  group: 'size',
  label: { ja: '幅', en: 'Width' },
  type: 'length',
  deviceOverridable: true,
  ...over,
})

describe('propRegistry', () => {
  it('registers and gets by group.key', () => {
    const r = createPropRegistry()
    r.register(def())
    expect(r.get('size', 'width')?.label.en).toBe('Width')
    expect(r.get('size', 'height')).toBeUndefined()
    expect(r.get('layout', 'width')).toBeUndefined()
  })

  it('overwrites the same group.key', () => {
    const r = createPropRegistry()
    r.register(def())
    r.register(def({ label: { ja: '横幅', en: 'W' } }))
    expect(r.all()).toHaveLength(1)
    expect(r.get('size', 'width')?.label.ja).toBe('横幅')
  })

  it('lists by group', () => {
    const r = createPropRegistry()
    r.register(def())
    r.register(def({ key: 'height' }))
    r.register(def({ key: 'gap', group: 'layout' }))
    expect(r.forGroup('size').map((d) => d.key)).toEqual(['width', 'height'])
    expect(r.forGroup('layout').map((d) => d.key)).toEqual(['gap'])
  })

  it('filters by category via appliesTo', () => {
    const r = createPropRegistry()
    r.register(def({ key: 'width' }))
    r.register(def({ key: 'placeholder', group: 'content', appliesTo: ['input-text'] }))
    expect(r.forCategory('button').map((d) => d.key)).toEqual(['width'])
    expect(r.forCategory('input-text').map((d) => d.key)).toEqual(['width', 'placeholder'])
    expect(r.forCategory('input-text', 'content').map((d) => d.key)).toEqual(['placeholder'])
  })

  it('keeps registries independent', () => {
    const a = createPropRegistry()
    const b = createPropRegistry()
    a.register(def())
    expect(b.all()).toHaveLength(0)
  })
})
