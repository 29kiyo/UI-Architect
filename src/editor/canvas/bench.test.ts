import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  getAncestorIds,
  getParentId,
  resolveNode,
} from '@/core'
import { createPropsCommand } from './commands'
import { buildLargePage, timeIt } from './bench'
import { resolveTarget } from './target'

describe('1000 ノードの純粋ロジック計測', () => {
  it('計測値を表示する(閾値は緩め)', () => {
    const page = buildLargePage(1000)
    const ids = Object.keys(page.nodes)
    expect(ids.length).toBeGreaterThanOrEqual(1000)
    const leaf = ids[ids.length - 1]!
    const rows = [
      timeIt('getParentId(末尾ノード)', () => getParentId(page, leaf)),
      timeIt('getAncestorIds', () => getAncestorIds(page, leaf)),
      timeIt('resolveTarget(click)', () => resolveTarget(page, leaf, [], 'click')),
      timeIt('resolveNode ×1000', () => ids.forEach((id) => resolveNode(page, 'pc', id))),
    ]

    const doc = createEmptyDocument('b')
    const p = buildLargePage(1000)
    doc.pages = [p]
    const store = createDocumentStore(doc)
    const history = createHistory(store)
    const target = Object.keys(p.nodes)[500]!
    let i = 0
    rows.push(
      timeIt('move 1 回(coalesce)', () =>
        history.execute(
          createPropsCommand({
            name: 'move',
            pageId: p.id,
            deviceId: doc.devices[0]!.id,
            base: true,
            writes: [{ nodeId: target, group: 'position', key: 'left', value: `${i++}px` }],
            coalesceKey: 'bench',
          }),
        ),
      ),
    )
    rows.push(timeIt('undo', () => history.undo(), 1))
    console.log('\n' + rows.map((r) => `${r.label}: ${r.ms} ms`).join('\n'))
    expect(rows.every((r) => r.ms < 200)).toBe(true)
  })
})
