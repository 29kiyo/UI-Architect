import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { editablePages, findEditablePage, splitMasters } from '../master'
import { createEmptyDocument, createNode, newId, UIDocumentSchema } from '../model'
import { createDocumentStore } from '../store'
import { createComponentFromNodeCommand } from './commands'
import {
  createResetInstanceOverrideCommand,
  createSetInstanceHiddenCommand,
  createSetInstanceOverrideCommand,
  defNodeOrder,
} from './instanceCommands'
import { resolveInstance } from './resolve'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  const doc = () => store.getState().doc
  const label = createNode({ type: 'text', name: 'label' })
  label.props.content = { text: 'OK' }
  const btn = createNode({ type: 'element', name: 'btn', children: [label.id] })
  store.getState().update((d) => {
    const p = d.pages[0]!
    p.nodes[label.id] = label
    p.nodes[btn.id] = btn
    p.nodes[p.rootNodeId]!.children.push(btn.id)
  })
  const pageId = doc().pages[0]!.id
  history.execute(
    createComponentFromNodeCommand({
      pageId,
      nodeId: btn.id,
      componentId: newId(),
      name: 'B',
      scope: 'project',
    }),
  )
  const res = () => resolveInstance(doc(), doc().pages[0]!.nodes[btn.id]!)!.nodes[label.id]!
  return { history, doc, label, btn, pageId, res }
}

describe('インスタンスの上書きコマンド', () => {
  it('設定 → Undo、リセット(項目 / 全部)', () => {
    const s = setup()
    const base = { pageId: s.pageId, instanceId: s.btn.id }
    s.history.execute(
      createSetInstanceOverrideCommand({
        ...base,
        targetId: s.label.id,
        group: 'content',
        key: 'text',
        value: 'Z',
      }),
    )
    expect(s.res().props.content.text).toBe('Z')
    s.history.undo()
    expect(s.res().props.content.text).toBe('OK')
    s.history.redo()
    s.history.execute(
      createResetInstanceOverrideCommand({
        ...base,
        targetId: s.label.id,
        group: 'content',
        key: 'text',
      }),
    )
    expect(s.res().props.content.text).toBe('OK')
    s.history.execute(
      createSetInstanceOverrideCommand({
        ...base,
        targetId: s.label.id,
        group: 'content',
        key: 'text',
        value: 'Q',
      }),
    )
    s.history.execute(createResetInstanceOverrideCommand(base))
    expect(s.res().props.content.text).toBe('OK')
  })

  it('非表示の上書きと解除', () => {
    const s = setup()
    const o = { pageId: s.pageId, instanceId: s.btn.id, targetId: s.label.id }
    s.history.execute(createSetInstanceHiddenCommand({ ...o, hidden: true }))
    expect(s.res().hidden).toBe(true)
    s.history.execute(createSetInstanceHiddenCommand({ ...o, hidden: undefined }))
    expect(s.res().hidden).toBe(false)
  })

  it('defNodeOrder は木の順と深さを返す', () => {
    const s = setup()
    expect(defNodeOrder(s.doc().components[0]!)).toEqual([
      { id: s.btn.id, depth: 0 },
      { id: s.label.id, depth: 1 },
    ])
  })
})

describe('定義を編集対象にする', () => {
  it('findEditablePage / editablePages が定義を含み、マスターは合成されない', () => {
    const s = setup()
    const def = s.doc().components[0]!
    const page = findEditablePage(s.doc(), def.id)
    expect(page?.rootNodeId).toBe(s.btn.id)
    expect(editablePages(s.doc())).toHaveLength(2) // ページ 1 + 定義 1
    expect(splitMasters(s.doc(), page!)).toEqual({ top: [], bottom: [], overlay: [] })
  })

  it('overrides の無い旧データも読め、空で補われる', () => {
    const s = setup()
    const old = structuredClone(s.doc())
    delete (old.components[0] as { overrides?: unknown }).overrides
    expect(UIDocumentSchema.parse(old).components[0]!.overrides).toEqual({})
  })
})
