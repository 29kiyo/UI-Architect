import { describe, expect, it } from 'vitest'
import { createNode } from '@/core'
import { nodeStyle } from './style'

describe('nodeStyle', () => {
  it('値を style に変換し、外部 url・不正値は除外する', () => {
    const base = createNode({ type: 'element' })
    const n = {
      ...base,
      props: {
        ...base.props,
        appearance: {
          backgroundColor: 'red',
          backgroundImage: 'url(http://example.com/a.png)',
          'border-color': 'blue',
          opacity: 0.5,
          color: 'red; x:y',
        },
      },
    }
    const s = nodeStyle(n) as Record<string, unknown>
    expect(s.backgroundColor).toBe('red')
    expect(s.borderColor).toBe('blue')
    expect(s.opacity).toBe(0.5)
    expect(s.backgroundImage).toBeUndefined()
    expect(s.color).toBeUndefined()
  })

  it('hidden は display:none', () => {
    const n = createNode({ type: 'element', hidden: true })
    expect((nodeStyle(n) as Record<string, unknown>).display).toBe('none')
  })
})
