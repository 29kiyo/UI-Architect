import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import {
  createAddInstanceCommand,
  createAddVariantCommand,
  createComponentFromNodeCommand,
  createInstanceFor,
  createSetInstanceVariantCommand,
  createSetVariantPropCommand,
  resolveInstance,
} from '../component'
import {
  createAddMasterCommand,
  createMasterFor,
  createSetMasterHiddenCommand,
  splitMasters,
} from '../master'
import { createEmptyDocument, createNode, newId } from '../model'
import { createMemoryBlobStore, exportProjectZip, loadProjectBytes } from '../persist'
import { createDocumentStore } from '../store'
import {
  createAddPageCommand,
  createPageFor,
  createRemovePageCommand,
  createSetHomePageCommand,
} from './ops'
import { createRemovePageCleanCommand, findIntegrityIssues, findOrphanPages } from './integrity'

function build() {
  const store = createDocumentStore(createEmptyDocument('phase8'))
  const history = createHistory(store)
  const doc = () => store.getState().doc

  // 3 ページ
  const p1 = doc().pages[0]!
  const p2 = createPageFor(doc())
  history.execute(createAddPageCommand(p2))
  const p3 = createPageFor(doc())
  history.execute(createAddPageCommand(p3))
  history.execute(createSetHomePageCommand(p1.id))

  // 共通ヘッダー(マスター)。p3 では隠す
  const header = createMasterFor(doc(), 'top')
  history.execute(createAddMasterCommand(header))
  history.execute(createSetMasterHiddenCommand(p3.id, header.id, true))

  // ボタン → コンポーネント化(バリアント付き)
  const label = createNode({ type: 'text', name: 'label' })
  label.props.content = { text: 'OK' }
  const btn = createNode({ type: 'element', category: 'button', name: 'btn', children: [label.id] })
  store.getState().update((d) => {
    const p = d.pages[0]!
    p.nodes[label.id] = label
    p.nodes[btn.id] = btn
    p.nodes[p.rootNodeId]!.children.push(btn.id)
  })
  const componentId = newId()
  history.execute(
    createComponentFromNodeCommand({
      pageId: p1.id,
      nodeId: btn.id,
      componentId,
      name: 'Button',
      scope: 'project',
    }),
  )
  const variantId = newId()
  history.execute(
    createAddVariantCommand(componentId, { id: variantId, name: 'Primary', overrides: {} }),
  )
  history.execute(
    createSetVariantPropCommand({
      componentId,
      variantId,
      nodeId: label.id,
      group: 'content',
      key: 'text',
      value: 'Go',
    }),
  )
  const inst = createInstanceFor(doc(), componentId)
  history.execute(createAddInstanceCommand(p2.id, inst, p2.rootNodeId))
  history.execute(createSetInstanceVariantCommand(p2.id, inst.id, variantId))
  return { store, history, doc, p1, p2, p3, header, btn, label, componentId, variantId, inst }
}

describe('Phase 8 完了条件', () => {
  it('3ページ+共通ヘッダー+バリアント付きコンポーネントを 保存→復元できる', async () => {
    const s = build()
    const out = await exportProjectZip(s.doc(), createMemoryBlobStore(), { now: 1 })
    const loaded = (await loadProjectBytes(out.data)).doc
    expect(loaded).toEqual(s.doc())

    expect(loaded.pages).toHaveLength(3)
    expect(loaded.project.homePageId).toBe(s.p1.id)
    expect(loaded.masters).toHaveLength(1)
    expect(splitMasters(loaded, loaded.pages[0]!).top).toHaveLength(1)
    expect(splitMasters(loaded, loaded.pages[2]!).top).toHaveLength(0)

    const p2 = loaded.pages[1]!
    const res = resolveInstance(loaded, p2.nodes[s.inst.id]!)!
    expect(res.nodes[s.label.id]!.props.content.text).toBe('Go')
    expect(findIntegrityIssues(loaded)).toEqual([])
  })

  it('リンク切れ・孤立ページを検出し、ページ削除で参照が解除される', () => {
    const s = build()
    expect(
      findOrphanPages(s.doc())
        .map((p) => p.id)
        .sort(),
    ).toEqual([s.p2.id, s.p3.id].sort())

    // p2 へのリンクを置く → p2 は孤立でなくなる
    const link = createNode({ type: 'element', category: 'link', name: 'a' })
    link.props.content = { href: `page:${s.p3.id}` }
    s.store.getState().update((d) => {
      const p = d.pages[0]!
      p.nodes[link.id] = link
      p.nodes[p.rootNodeId]!.children.push(link.id)
    })
    expect(findOrphanPages(s.doc()).map((p) => p.id)).toEqual([s.p2.id])

    // 参照先を単純削除するとリンク切れ
    s.history.execute(createRemovePageCommand(s.p3.id))
    expect(findIntegrityIssues(s.doc()).map((i) => i.kind)).toEqual(['link-page-missing'])
    s.history.undo()
    expect(findIntegrityIssues(s.doc())).toEqual([])

    // 参照解除つき削除ならリンク切れにならない
    s.history.execute(createRemovePageCleanCommand(s.p3.id, createRemovePageCommand(s.p3.id)))
    expect(findIntegrityIssues(s.doc())).toEqual([])
    expect(s.doc().pages[0]!.nodes[link.id]!.props.content.href).toBe('')
  })
})
