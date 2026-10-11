import { describe, expect, it } from 'vitest'
import { createNode } from '@/core'
import { previewPage } from './preview'

describe('previewPage', () => {
  it('nodes[0] をルートにした Page を作る', () => {
    const child = createNode({ type: 'text' })
    const root = createNode({ type: 'element', children: [child.id] })
    const page = previewPage([root, child])
    expect(page?.rootNodeId).toBe(root.id)
    expect(Object.keys(page?.nodes ?? {})).toHaveLength(2)
    expect(page?.overrides).toEqual({})
  })

  it('空配列なら undefined', () => {
    expect(previewPage([])).toBeUndefined()
  })
})
