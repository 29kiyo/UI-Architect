import { applyPatches } from 'immer'
import { describe, expect, it } from 'vitest'
import { PageSchema, createEmptyDocument, createNode, type Page } from '../model'
import {
  addNode,
  buildParentMap,
  createDocumentStore,
  getAncestorIds,
  getDescendantIds,
  getParentId,
  moveNode,
  removeNode,
  selectNode,
  selectPage,
  walk,
} from './index'

// root ─ a ─ a1
//      └ b
function makeTree() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]
  const store = createDocumentStore(doc)
  const a = createNode({ type: 'element', name: 'a' })
  const a1 = createNode({ type: 'element', name: 'a1' })
  const b = createNode({ type: 'element', name: 'b' })
  store.getState().update((d) => {
    const p = d.pages[0]
    addNode(p, a, p.rootNodeId)
    addNode(p, a1, a.id)
    addNode(p, b, p.rootNodeId)
  })
  return { store, pageId: page.id, rootId: page.rootNodeId, a, a1, b }
}

const pageOf = (s: ReturnType<typeof makeTree>): Page =>
  selectPage(s.store.getState().doc, s.pageId)!

describe('tree utilities', () => {
  it('追加後の木走査・親子取得', () => {
    const s = makeTree()
    const page = pageOf(s)
    const names: string[] = []
    walk(page, (n) => void names.push(n.name))
    expect(names).toEqual(['Root', 'a', 'a1', 'b'])
    expect(getParentId(page, s.a1.id)).toBe(s.a.id)
    expect(buildParentMap(page).get(s.b.id)).toBe(s.rootId)
    expect(getDescendantIds(page, s.a.id)).toEqual([s.a1.id])
    expect(getAncestorIds(page, s.a1.id)).toEqual([s.a.id, s.rootId])
    expect(PageSchema.safeParse(page).success).toBe(true)
  })

  it('removeNode は子孫ごと削除し、親の children も更新する', () => {
    const s = makeTree()
    let removed: string[] = []
    s.store.getState().update((d) => {
      removed = removeNode(d.pages[0], s.a.id)
    })
    const page = pageOf(s)
    expect(removed).toEqual([s.a.id, s.a1.id])
    expect(page.nodes[s.a.id]).toBeUndefined()
    expect(page.nodes[s.a1.id]).toBeUndefined()
    expect(page.nodes[s.rootId].children).toEqual([s.b.id])
    expect(PageSchema.safeParse(page).success).toBe(true)
  })

  it('moveNode: 親変更と並べ替え', () => {
    const s = makeTree()
    s.store.getState().update((d) => moveNode(d.pages[0], s.b.id, s.a.id, 0))
    let page = pageOf(s)
    expect(page.nodes[s.a.id].children).toEqual([s.b.id, s.a1.id])
    expect(page.nodes[s.rootId].children).toEqual([s.a.id])
    // 同じ親内で並べ替え
    s.store.getState().update((d) => moveNode(d.pages[0], s.b.id, s.a.id, 1))
    page = pageOf(s)
    expect(page.nodes[s.a.id].children).toEqual([s.a1.id, s.b.id])
    expect(PageSchema.safeParse(page).success).toBe(true)
  })

  it('不正操作は throw し、ドキュメントは変化しない', () => {
    const s = makeTree()
    const before = s.store.getState().doc
    const run = (fn: (p: Page) => void) => () => s.store.getState().update((d) => fn(d.pages[0]))
    expect(run((p) => removeNode(p, s.rootId))).toThrow()
    expect(run((p) => moveNode(p, s.rootId, s.a.id))).toThrow()
    expect(run((p) => moveNode(p, s.a.id, s.a1.id))).toThrow() // 子孫へ移動
    expect(run((p) => moveNode(p, s.a.id, s.a.id))).toThrow() // 自分自身
    expect(run((p) => addNode(p, s.a, s.rootId))).toThrow() // ID 重複
    expect(run((p) => addNode(p, createNode({ type: 'x' }), 'missing'))).toThrow()
    expect(s.store.getState().doc).toBe(before)
  })
})

describe('document store', () => {
  it('不変更新: 元のオブジェクトは変わらず、変更部分だけ新しくなる', () => {
    const doc = createEmptyDocument('t')
    const store = createDocumentStore(doc)
    const n = createNode({ type: 'element' })
    store.getState().update((d) => addNode(d.pages[0], n, d.pages[0].rootNodeId))
    const next = store.getState().doc
    expect(next).not.toBe(doc)
    expect(doc.pages[0].nodes[n.id]).toBeUndefined()
    expect(next.devices).toBe(doc.devices) // 触っていない部分は構造共有
  })

  it('patches / inversePatches で Undo / Redo 相当が再現できる', () => {
    const doc = createEmptyDocument('t')
    const store = createDocumentStore(doc)
    const n = createNode({ type: 'element' })
    const { patches, inversePatches } = store
      .getState()
      .update((d) => addNode(d.pages[0], n, d.pages[0].rootNodeId))
    const after = store.getState().doc
    expect(applyPatches(after, inversePatches)).toEqual(doc)
    expect(applyPatches(doc, patches)).toEqual(after)
  })

  it('変更なしの update は state を差し替えず patches も空', () => {
    const store = createDocumentStore(createEmptyDocument('t'))
    const before = store.getState().doc
    const r = store.getState().update(() => {})
    expect(r.patches).toEqual([])
    expect(store.getState().doc).toBe(before)
  })

  it('selectors', () => {
    const s = makeTree()
    const doc = s.store.getState().doc
    expect(selectNode(doc, s.pageId, s.a.id)?.name).toBe('a')
    expect(selectNode(doc, s.pageId, 'nope')).toBeUndefined()
    expect(selectPage(doc, 'nope')).toBeUndefined()
  })
})
