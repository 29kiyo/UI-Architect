import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createImageNode,
  type Asset,
} from '@/core'
import { createAddImagesCommand } from './imageActions'

const asset: Asset = {
  id: 'a1',
  kind: 'image',
  name: 'p.png',
  mime: 'image/png',
  hash: 'h',
  size: 1,
  width: 640,
  height: 480,
}

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  const page = store.getState().doc.pages[0]
  return { store, history, page }
}

describe('createAddImagesCommand', () => {
  it('Asset と画像ノードを 1 Command で追加し、Undo で両方戻る', () => {
    const { store, history, page } = setup()
    const node = createImageNode(asset)
    expect(
      history.execute(
        createAddImagesCommand(page.id, [{ asset, node, parentId: page.rootNodeId }]),
      ),
    ).toBe(true)
    const d = store.getState().doc
    expect(d.assets.map((a) => a.id)).toEqual(['a1'])
    expect(d.pages[0].nodes[node.id].props.content.src).toBe('asset:a1')
    expect(d.pages[0].nodes[page.rootNodeId].children).toContain(node.id)
    history.undo()
    const u = store.getState().doc
    expect(u.assets).toEqual([])
    expect(node.id in u.pages[0].nodes).toBe(false)
  })
  it('同じ asset を 2 ノードで使っても Asset は 1 件', () => {
    const { store, history, page } = setup()
    const items = [createImageNode(asset), createImageNode(asset)].map((node) => ({
      asset,
      node,
      parentId: page.rootNodeId,
    }))
    history.execute(createAddImagesCommand(page.id, items))
    const d = store.getState().doc
    expect(d.assets).toHaveLength(1)
    expect(d.pages[0].nodes[page.rootNodeId].children).toHaveLength(2)
  })
})
