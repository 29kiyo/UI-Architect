import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, createNode } from '@/core'
import { createPropsCommand } from '../canvas/commands'

// ピッカーのドラッグ(同じ coalesceKey の連続)が 1 履歴になり、離した後は別履歴になること
describe('inspector live edits', () => {
  it('coalesces a drag and splits at breakCoalescing', () => {
    const doc = createEmptyDocument('t')
    const page = doc.pages[0]!
    const a = createNode({ type: 'element', name: 'a' })
    page.nodes[a.id] = a
    page.nodes[page.rootNodeId]!.children = [a.id]
    const store = createDocumentStore(doc)
    const h = createHistory(store)
    const live = (v: string) =>
      h.execute(
        createPropsCommand({
          name: 'c',
          pageId: page.id,
          deviceId: doc.devices[0]!.id,
          base: true,
          writes: [{ nodeId: a.id, group: 'appearance', key: 'backgroundColor', value: v }],
          coalesceKey: 'k',
        }),
      )
    const color = () => store.getState().doc.pages[0]!.nodes[a.id]!.props.appearance.backgroundColor
    live('#111111')
    live('#222222')
    expect(h.getState().undoCount).toBe(1)
    h.breakCoalescing()
    live('#333333')
    expect(h.getState().undoCount).toBe(2)
    h.undo()
    expect(color()).toBe('#222222')
    h.undo()
    expect(color()).toBeUndefined()
  })
})
