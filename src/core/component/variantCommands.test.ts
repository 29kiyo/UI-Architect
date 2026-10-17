import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { createEmptyDocument, createNode, newId } from '../model'
import { createDocumentStore } from '../store'
import { createComponentFromNodeCommand } from './commands'
import {
  createAddSlotChildCommand,
  createAddSlotCommand,
  createAddVariantCommand,
  createRemoveSlotChildCommand,
  createRemoveSlotCommand,
  createRemoveVariantCommand,
  createResetVariantPropCommand,
  createSetInstanceVariantCommand,
  createSetVariantPropCommand,
  slotInUse,
} from './variantCommands'
import { resolveInstance } from './resolve'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  const doc = () => store.getState().doc
  const label = createNode({ type: 'text', name: 'label' })
  label.props.content = { text: 'OK' }
  const body = createNode({ type: 'element', name: 'body' })
  const btn = createNode({ type: 'element', name: 'btn', children: [label.id, body.id] })
  store.getState().update((d) => {
    const p = d.pages[0]!
    p.nodes[label.id] = label
    p.nodes[body.id] = body
    p.nodes[btn.id] = btn
    p.nodes[p.rootNodeId]!.children.push(btn.id)
  })
  const pageId = doc().pages[0]!.id
  const componentId = newId()
  history.execute(
    createComponentFromNodeCommand({
      pageId,
      nodeId: btn.id,
      componentId,
      name: 'B',
      scope: 'project',
    }),
  )
  const inst = () => doc().pages[0]!.nodes[btn.id]!
  const res = () => resolveInstance(doc(), inst())!
  return { history, doc, label, body, btn, pageId, componentId, inst, res }
}

describe('バリアント', () => {
  it('編集 → 選択 → 反映 → リセット。削除でインスタンスの選択が外れ、Undo で戻る', () => {
    const s = setup()
    const vid = newId()
    s.history.execute(
      createAddVariantCommand(s.componentId, { id: vid, name: 'Primary', overrides: {} }),
    )
    const target = { componentId: s.componentId, variantId: vid, nodeId: s.label.id }
    s.history.execute(
      createSetVariantPropCommand({ ...target, group: 'content', key: 'text', value: 'Go' }),
    )
    s.history.execute(createSetInstanceVariantCommand(s.pageId, s.btn.id, vid))
    expect(s.res().nodes[s.label.id]!.props.content.text).toBe('Go')

    s.history.execute(createResetVariantPropCommand({ ...target, group: 'content', key: 'text' }))
    expect(s.res().nodes[s.label.id]!.props.content.text).toBe('OK')
    expect(s.doc().components[0]!.variants[0]!.overrides).toEqual({})

    s.history.execute(
      createSetVariantPropCommand({ ...target, group: 'content', key: 'text', value: 'Go' }),
    )
    s.history.execute(createRemoveVariantCommand(s.componentId, vid))
    expect(s.doc().components[0]!.variants).toHaveLength(0)
    expect(s.inst().componentRef!.variantId).toBeUndefined()
    expect(s.res().nodes[s.label.id]!.props.content.text).toBe('OK')
    s.history.undo()
    expect(s.inst().componentRef!.variantId).toBe(vid)
    expect(s.doc().components[0]!.variants).toHaveLength(1)
  })
})

describe('スロット', () => {
  it('指定 → 内容を追加 → 解除は内容があると不可', () => {
    const s = setup()
    const slotId = newId()
    const addSlot = (nodeId: string) =>
      createAddSlotCommand({ componentId: s.componentId, slotId, name: '', nodeId })
    expect(() => addSlot(s.label.id).apply(structuredClone(s.doc()))).toThrow() // text は不可
    s.history.execute(addSlot(s.body.id))
    expect(s.doc().components[0]!.slots[0]).toMatchObject({ id: slotId, name: 'body' })
    expect(() => addSlot(s.body.id).apply(structuredClone(s.doc()))).toThrow() // 二重指定

    const child = createNode({ type: 'element', name: 'c' })
    s.history.execute(
      createAddSlotChildCommand({ pageId: s.pageId, instanceId: s.btn.id, slotId, node: child }),
    )
    expect(s.inst().children).toEqual([child.id])
    expect(s.res().nodes[s.body.id]!.children).toEqual([child.id])
    expect(slotInUse(s.doc(), s.componentId, slotId)).toBe(true)
    expect(() =>
      createRemoveSlotCommand(s.componentId, slotId).apply(structuredClone(s.doc())),
    ).toThrow()

    s.history.execute(
      createRemoveSlotChildCommand({
        pageId: s.pageId,
        instanceId: s.btn.id,
        slotId,
        childId: child.id,
      }),
    )
    expect(s.inst().children).toEqual([])
    expect(s.inst().componentRef!.slotContent[slotId]).toBeUndefined()
    expect(slotInUse(s.doc(), s.componentId, slotId)).toBe(false)
    s.history.execute(createRemoveSlotCommand(s.componentId, slotId))
    expect(s.doc().components[0]!.slots).toHaveLength(0)
    s.history.undo()
    expect(s.doc().components[0]!.slots).toHaveLength(1)
  })
})
