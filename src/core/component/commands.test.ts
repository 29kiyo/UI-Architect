import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { createAddMasterCommand, createMasterFor } from '../master'
import { createEmptyDocument, createNode, createPage, newId } from '../model'
import { createRemovePageCommand } from '../page'
import { createDocumentStore } from '../store'
import {
  createAddInstanceCommand,
  createComponentFromNodeCommand,
  createDetachInstanceCommand,
  createInstanceFor,
  createRemoveComponentCommand,
  findComponentUsages,
} from './commands'
import { setInstanceOverride } from './ops'
import { mergeInstanceProps, resolveInstance } from './resolve'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  const doc = () => store.getState().doc
  const label = createNode({ type: 'text', name: 'label' })
  label.props.content = { text: 'OK' }
  const btn = createNode({ type: 'element', category: 'button', name: 'btn', children: [label.id] })
  btn.props.position = { position: 'absolute', left: '10px' }
  btn.props.size = { width: 100 }
  store.getState().update((d) => {
    const p = d.pages[0]!
    p.nodes[label.id] = label
    p.nodes[btn.id] = btn
    p.nodes[p.rootNodeId]!.children.push(btn.id)
  })
  const pageId = doc().pages[0]!.id
  const make = (scope: 'project' | 'page' = 'project') => {
    const componentId = newId()
    history.execute(
      createComponentFromNodeCommand({
        pageId,
        nodeId: btn.id,
        componentId,
        name: 'Button',
        scope,
      }),
    )
    return componentId
  }
  return { store, history, doc, label, btn, pageId, make }
}

describe('コンポーネント化', () => {
  it('同じ ID のインスタンスに置き換わり、position はインスタンス側へ。Undo/Redo できる', () => {
    const s = setup()
    const before = s.doc()
    const cid = s.make()
    const page = s.doc().pages[0]!
    const def = s.doc().components[0]!
    expect(Object.keys(def.nodes).sort()).toEqual([s.btn.id, s.label.id].sort())
    expect(def.nodes[s.btn.id]!.props.position).toEqual({})
    expect(page.nodes[s.btn.id]).toMatchObject({
      type: 'instance',
      category: 'button',
      children: [],
    })
    expect(page.nodes[s.label.id]).toBeUndefined()
    const inst = page.nodes[s.btn.id]!
    expect(inst.props.position).toEqual({ position: 'absolute', left: '10px' })
    const root = resolveInstance(s.doc(), inst)!.nodes[s.btn.id]!
    const merged = mergeInstanceProps(root.props, inst.props)
    expect(merged.position.left).toBe('10px')
    expect(merged.size.width).toBe(100)
    expect(findComponentUsages(s.doc(), cid)).toHaveLength(1)
    s.history.undo()
    expect(s.doc()).toEqual(before)
    s.history.redo()
    expect(s.doc().pages[0]!.nodes[s.btn.id]!.type).toBe('instance')
  })

  it('ルートとインスタンスを含むノードは不可', () => {
    const s = setup()
    const rootId = s.doc().pages[0]!.rootNodeId
    const run = (nodeId: string) => () =>
      createComponentFromNodeCommand({
        pageId: s.pageId,
        nodeId,
        componentId: newId(),
        name: 'X',
        scope: 'project',
      }).apply(structuredClone(s.doc()))
    expect(run(rootId)).toThrow()
    s.make()
    expect(run(rootId)).toThrow()
    expect(run(s.btn.id)).toThrow() // すでにインスタンス
  })
})

describe('解除(detach)', () => {
  it('展開結果で置き換わる。ID は振り直され、Undo でインスタンスに戻る', () => {
    const s = setup()
    s.make()
    const withInstance = s.doc()
    s.history.execute(createDetachInstanceCommand(s.pageId, s.btn.id))
    const page = s.doc().pages[0]!
    const n = page.nodes[s.btn.id]!
    expect(n.type).toBe('element')
    expect(n.componentRef).toBeUndefined()
    expect(n.props.position).toMatchObject({ position: 'absolute', left: '10px' })
    expect(n.props.size.width).toBe(100)
    expect(n.children).toHaveLength(1)
    const child = page.nodes[n.children[0]!]!
    expect(child.id).not.toBe(s.label.id)
    expect(child.props.content).toEqual({ text: 'OK' })
    s.history.undo()
    expect(s.doc()).toEqual(withInstance)
  })

  it('インスタンスの上書きを反映して固定される', () => {
    const s = setup()
    s.make()
    s.history.execute({
      name: 'o',
      apply: (d) => setInstanceOverride(d, s.pageId, s.btn.id, s.label.id, 'content', 'text', 'Z'),
    })
    s.history.execute(createDetachInstanceCommand(s.pageId, s.btn.id))
    const page = s.doc().pages[0]!
    const child = page.nodes[page.nodes[s.btn.id]!.children[0]!]!
    expect(child.props.content).toEqual({ text: 'Z' })
  })
})

describe('スコープ・削除・マスター', () => {
  it('ページ専用は他ページに置けず、ページ削除で定義も消える', () => {
    const s = setup()
    const p2 = createPage('P2', '/p2')
    s.store.getState().update((d) => {
      d.pages.push(p2)
    })
    const cid = s.make('page')
    expect(s.doc().components[0]).toMatchObject({ scope: 'page', ownerId: s.pageId })
    const inst = createInstanceFor(s.doc(), cid)
    expect(() =>
      createAddInstanceCommand(p2.id, inst, p2.rootNodeId).apply(structuredClone(s.doc())),
    ).toThrow()
    const own = s.doc().pages[0]!
    s.history.execute(createAddInstanceCommand(s.pageId, inst, own.rootNodeId))
    expect(findComponentUsages(s.doc(), cid)).toHaveLength(2)
    s.history.execute(createRemovePageCommand(s.pageId))
    expect(s.doc().components).toHaveLength(0)
    s.history.undo()
    expect(s.doc().components).toHaveLength(1)
  })

  it('使用中は削除できず、使われなくなれば削除できる', () => {
    const s = setup()
    const cid = s.make()
    expect(() => createRemoveComponentCommand(cid).apply(structuredClone(s.doc()))).toThrow()
    s.history.execute(createDetachInstanceCommand(s.pageId, s.btn.id))
    s.history.execute(createRemoveComponentCommand(cid))
    expect(s.doc().components).toHaveLength(0)
  })

  it('マスター内のインスタンスにも上書きを書ける', () => {
    const s = setup()
    const cid = s.make()
    const m = createMasterFor(s.doc())
    s.history.execute(createAddMasterCommand(m))
    const inst = createInstanceFor(s.doc(), cid)
    s.history.execute(createAddInstanceCommand(m.id, inst, m.rootNodeId))
    s.history.execute({
      name: 'o',
      apply: (d) => setInstanceOverride(d, m.id, inst.id, s.label.id, 'content', 'text', 'M'),
    })
    const ov = s.doc().masters[0]!.nodes[inst.id]!.componentRef!.overrides
    expect(ov[s.label.id]!.propsDiff.content).toEqual({ text: 'M' })
  })
})
