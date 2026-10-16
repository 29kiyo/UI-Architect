import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, type Asset } from '@/core'
import { createAddAssetCommand } from './imageActions'

const asset: Asset = {
  id: 'a1',
  kind: 'image',
  name: 'p.png',
  mime: 'image/png',
  hash: 'h',
  size: 1,
}

describe('createAddAssetCommand', () => {
  it('追加は冪等で、Undo で戻る', () => {
    const store = createDocumentStore(createEmptyDocument('t'))
    const history = createHistory(store)
    history.execute(createAddAssetCommand(asset))
    history.execute(createAddAssetCommand(asset))
    expect(store.getState().doc.assets).toHaveLength(1)
    history.undo()
    history.undo()
    expect(store.getState().doc.assets).toHaveLength(0)
  })
})
