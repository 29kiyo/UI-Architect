import { describe, expect, it } from 'vitest'
import { createLogger } from '@/shared'
import {
  ComponentDefSchema,
  UIDocumentSchema,
  createEmptyDocument,
  createNode,
  newId,
  type ComponentDef,
  type Node,
  type UIDocument,
} from '../model'
import { createHistory } from '../history'
import { addNode, createDocumentStore, removeNode } from '../store'
import {
  addComponent,
  addVariant,
  createComponentDef,
  createInstanceNode,
  resetInstanceOverride,
  resolveInstance,
  setComponentProp,
  setInstanceHidden,
  setInstanceOverride,
  setInstanceSlot,
  setInstanceVariant,
  setVariantProp,
} from './index'

// Button = root(size{width:100}) ─ label(content{text:OK}) / slotNode(スロット "body")
function setup() {
  const doc = createEmptyDocument('t')
  const pid = doc.pages[0].id
  const rootId = doc.pages[0].rootNodeId
  const store = createDocumentStore(doc)
  const label = createNode({ type: 'text', name: 'label' })
  label.props.content = { text: 'OK' }
  const slotNode = createNode({ type: 'element', name: 'slot' })
  const root = createNode({ type: 'element', name: 'root', children: [label.id, slotNode.id] })
  root.props.size = { width: 100 }
  const def: ComponentDef = {
    id: newId(),
    name: 'Button',
    rootNodeId: root.id,
    nodes: { [root.id]: root, [label.id]: label, [slotNode.id]: slotNode },
    variants: [],
    slots: [{ id: 'body', name: 'body', nodeId: slotNode.id }],
  }
  const i1 = createInstanceNode(def.id)
  const i2 = createInstanceNode(def.id)
  store.getState().update((d) => {
    addComponent(d, def)
    addNode(d.pages[0], i1, rootId)
    addNode(d.pages[0], i2, rootId)
  })
  const edit = (fn: (d: UIDocument) => void) => store.getState().update(fn)
  const doc_ = () => store.getState().doc
  const res = (n: Node) => resolveInstance(doc_(), doc_().pages[0].nodes[n.id])!
  return { store, pid, rootId, def, root, label, slotNode, i1, i2, edit, doc: doc_, res }
}

describe('resolveInstance', () => {
  it('上書きなしは定義と同じ内容に展開される', () => {
    const s = setup()
    const r = s.res(s.i1)
    expect(r.rootNodeId).toBe(s.root.id)
    expect(r.nodes[s.root.id].props.size).toEqual({ width: 100 })
    expect(r.nodes[s.label.id].props.content).toEqual({ text: 'OK' })
  })

  it('インスタンスでない / 定義が無い場合は undefined', () => {
    const s = setup()
    expect(resolveInstance(s.doc(), s.doc().pages[0].nodes[s.rootId])).toBeUndefined()
    const orphan = createInstanceNode('missing')
    expect(resolveInstance(s.doc(), orphan)).toBeUndefined()
  })

  it('createComponentDef の結果はスキーマを通る', () => {
    expect(ComponentDefSchema.safeParse(createComponentDef('X')).success).toBe(true)
  })
})

describe('親変更の追従と個別上書き', () => {
  it('親を変更すると全インスタンスに反映され、上書き済みのキーは維持される', () => {
    const s = setup()
    s.edit((d) => setInstanceOverride(d, s.pid, s.i1.id, s.root.id, 'size', 'width', 80))
    s.edit((d) => {
      setComponentProp(d, s.def.id, s.root.id, 'size', 'height', 50)
      setComponentProp(d, s.def.id, s.root.id, 'size', 'width', 120)
    })
    expect(s.res(s.i1).nodes[s.root.id].props.size).toEqual({ width: 80, height: 50 })
    expect(s.res(s.i2).nodes[s.root.id].props.size).toEqual({ width: 120, height: 50 })
  })

  it('上書きの reset: key / group / ノード / 全部', () => {
    const s = setup()
    const set = (t: string, g: 'content' | 'size', k: string, v: string | number) =>
      s.edit((d) => setInstanceOverride(d, s.pid, s.i1.id, t, g, k, v))
    const ov = () => s.doc().pages[0].nodes[s.i1.id].componentRef!.overrides
    set(s.label.id, 'content', 'text', 'Cancel')
    set(s.label.id, 'content', 'color', 'red')
    set(s.root.id, 'size', 'width', 80)

    s.edit((d) => resetInstanceOverride(d, s.pid, s.i1.id, s.label.id, 'content', 'text'))
    expect(ov()[s.label.id].propsDiff.content).toEqual({ color: 'red' })
    s.edit((d) => resetInstanceOverride(d, s.pid, s.i1.id, s.label.id, 'content'))
    expect(ov()[s.label.id]).toBeUndefined() // 空になったら消える
    s.edit((d) => resetInstanceOverride(d, s.pid, s.i1.id, s.root.id))
    expect(ov()).toEqual({})
    set(s.root.id, 'size', 'width', 80)
    s.edit((d) => resetInstanceOverride(d, s.pid, s.i1.id))
    expect(ov()).toEqual({})
    expect(s.res(s.i1).nodes[s.root.id].props.size).toEqual({ width: 100 })
  })

  it('hidden の上書きと解除', () => {
    const s = setup()
    s.edit((d) => setInstanceHidden(d, s.pid, s.i1.id, s.label.id, true))
    expect(s.res(s.i1).nodes[s.label.id].hidden).toBe(true)
    expect(s.res(s.i2).nodes[s.label.id].hidden).toBe(false)
    s.edit((d) => setInstanceHidden(d, s.pid, s.i1.id, s.label.id, undefined))
    expect(s.doc().pages[0].nodes[s.i1.id].componentRef!.overrides).toEqual({})
  })
})

describe('バリアント', () => {
  it('バリアントが適用され、インスタンス上書きが優先される', () => {
    const s = setup()
    s.edit((d) => {
      addVariant(d, s.def.id, { id: 'primary', name: 'Primary', overrides: {} })
      setVariantProp(d, s.def.id, 'primary', s.label.id, 'content', 'text', 'Go')
      setInstanceVariant(d, s.pid, s.i1.id, 'primary')
    })
    expect(s.res(s.i1).nodes[s.label.id].props.content).toEqual({ text: 'Go' })
    expect(s.res(s.i2).nodes[s.label.id].props.content).toEqual({ text: 'OK' })

    s.edit((d) => setInstanceOverride(d, s.pid, s.i1.id, s.label.id, 'content', 'text', 'X'))
    expect(s.res(s.i1).nodes[s.label.id].props.content).toEqual({ text: 'X' })
    s.edit((d) => setInstanceVariant(d, s.pid, s.i1.id, undefined))
    expect(s.res(s.i1).nodes[s.label.id].props.content).toEqual({ text: 'X' })
  })
})

describe('スロット', () => {
  it('インスタンスの子がスロットに入り、削除された子は除外される', () => {
    const s = setup()
    const child = createNode({ type: 'element', name: 'child' })
    s.edit((d) => {
      addNode(d.pages[0], child, s.i1.id)
      setInstanceSlot(d, s.pid, s.i1.id, 'body', [child.id])
    })
    expect(s.res(s.i1).nodes[s.slotNode.id].children).toEqual([child.id])
    expect(s.res(s.i2).nodes[s.slotNode.id].children).toEqual([])
    s.edit((d) => {
      removeNode(d.pages[0], child.id)
    })
    expect(s.res(s.i1).nodes[s.slotNode.id].children).toEqual([])
  })
})

describe('不正操作・永続化・履歴', () => {
  it('不正な指定は throw し、ドキュメントは変化しない', () => {
    const s = setup()
    const before = s.doc()
    const run = (fn: (d: UIDocument) => void) => () => s.edit(fn)
    expect(run((d) => setInstanceOverride(d, s.pid, s.i1.id, 'nope', 'size', 'width', 1))).toThrow()
    expect(run((d) => setInstanceVariant(d, s.pid, s.i1.id, 'nope'))).toThrow()
    expect(run((d) => setInstanceSlot(d, s.pid, s.i1.id, 'nope', []))).toThrow()
    expect(run((d) => setInstanceSlot(d, s.pid, s.i1.id, 'body', ['x']))).toThrow()
    expect(
      run((d) => setInstanceOverride(d, s.pid, s.rootId, s.root.id, 'size', 'width', 1)),
    ).toThrow()
    expect(run((d) => setComponentProp(d, 'nope', s.root.id, 'size', 'width', 1))).toThrow()
    expect(s.doc()).toBe(before)
  })

  it('スキーマは slot / variant の参照切れを拒否する', () => {
    const s = setup()
    expect(
      ComponentDefSchema.safeParse({ ...s.def, slots: [{ id: 's', name: 's', nodeId: 'missing' }] })
        .success,
    ).toBe(false)
    expect(
      ComponentDefSchema.safeParse({
        ...s.def,
        variants: [{ id: 'v', name: 'v', overrides: { missing: { propsDiff: {} } } }],
      }).success,
    ).toBe(false)
  })

  it('JSON 往復で等価、Command 経由で Undo / Redo できる', () => {
    const s = setup()
    const history = createHistory(s.store, { logger: createLogger() })
    const before = s.doc()
    history.execute({
      name: 'override',
      apply: (d) => setInstanceOverride(d, s.pid, s.i1.id, s.label.id, 'content', 'text', 'Z'),
    })
    const after = s.doc()
    expect(UIDocumentSchema.parse(JSON.parse(JSON.stringify(after)))).toEqual(after)
    history.undo()
    expect(s.doc()).toEqual(before)
    history.redo()
    expect(s.doc()).toEqual(after)
  })
})
