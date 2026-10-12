import { beforeEach, describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, createNode } from '@/core'
import { clearClipboard, dropCategory, runEditAction } from './actions'
import { selectionStore } from './selection'

// 主要操作を続けて実行 → 全部 Undo で初期状態、全部 Redo で最終状態に戻ること
describe('主要操作の統合(Undo/Redo)', () => {
  beforeEach(() => {
    selectionStore.setState({ selectedIds: [], activeDeviceId: undefined, hover: null })
    clearClipboard()
  })

  it('複製 → グループ化 → 最前面 → 追加 → 削除 → コピペ', () => {
    const doc = createEmptyDocument('t')
    const page = doc.pages[0]!
    const root = page.nodes[page.rootNodeId]!
    const [a, b, c] = ['a', 'b', 'c'].map((name) => createNode({ type: 'element', name }))
    for (const n of [a!, b!, c!]) page.nodes[n.id] = n
    root.children = [a!.id, b!.id, c!.id]
    const store = createDocumentStore(doc)
    const history = createHistory(store)
    const pc = doc.devices[0]!.id
    const env = () => ({ doc: store.getState().doc, page: store.getState().doc.pages[0]!, history })
    const sel = () => selectionStore.getState()
    const initial = store.getState().doc

    sel().pick(a!.id, pc, false)
    runEditAction('duplicate', env())
    sel().pickMany([a!.id, b!.id], pc, false)
    runEditAction('group', env())
    runEditAction('front', env())
    dropCategory(env(), {
      deviceId: pc,
      hitId: undefined,
      category: 'button',
      world: { x: 0, y: 0 },
      rectOf: () => undefined,
    })
    sel().pick(c!.id, pc, false)
    runEditAction('delete', env())
    sel().pick(b!.id, pc, false)
    runEditAction('copy', env())
    runEditAction('paste', env())

    const count = history.getState().undoCount
    expect(count).toBe(6) // コピーは履歴に積まれない
    const final = store.getState().doc
    expect(final).not.toEqual(initial)

    for (let i = 0; i < count; i++) expect(history.undo()).toBe(true)
    expect(store.getState().doc).toEqual(initial)
    expect(history.undo()).toBe(false)

    for (let i = 0; i < count; i++) expect(history.redo()).toBe(true)
    expect(store.getState().doc).toEqual(final)
  })
})
