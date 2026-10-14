import { beforeEach, describe, expect, it } from 'vitest'
import { createNode } from '@/core'
import { previewStateFor, setStatePreview } from './statePreview'
import { nodeStyle } from './style'

const node = () => {
  const n = createNode({ type: 'element' })
  n.props.appearance.backgroundColor = 'red'
  n.props.states.hover = {
    backgroundColor: 'blue',
    background: 'green', // ショートハンドは重ねない
    opacity: 0.5,
    color: 'red; x:y', // 不正値は重ねない
    backgroundImage: 'url(http://example.com/a.png)',
  }
  return n
}

describe('nodeStyle with a state preview', () => {
  it('overlays only safe single keys', () => {
    const s = nodeStyle(node(), 'hover') as Record<string, unknown>
    expect(s.backgroundColor).toBe('blue')
    expect(s.opacity).toBe(0.5)
    expect(s.background).toBeUndefined()
    expect(s.color).toBeUndefined()
    expect(s.backgroundImage).toBeUndefined()
  })
  it('is unchanged without a state or with an unknown one', () => {
    expect((nodeStyle(node()) as Record<string, unknown>).backgroundColor).toBe('red')
    expect((nodeStyle(node(), 'active') as Record<string, unknown>).backgroundColor).toBe('red')
  })
})

describe('previewStateFor', () => {
  beforeEach(() => setStatePreview(undefined, []))
  it('returns the state only for target ids', () => {
    setStatePreview('hover', ['a'])
    expect(previewStateFor('a')).toBe('hover')
    expect(previewStateFor('b')).toBeUndefined()
    setStatePreview(undefined, ['a'])
    expect(previewStateFor('a')).toBeUndefined()
  })
})
