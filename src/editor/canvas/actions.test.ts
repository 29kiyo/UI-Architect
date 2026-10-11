import { beforeEach, describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, createNode } from '@/core'
import { clearClipboard, dropCategory, runEditAction } from './actions'
import { createNodeMetaCommand } from './nodeCommands'
import { selectionStore } from './selection'

function setup() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const root = page.nodes[page.rootNodeId]!
  const [a, b, c] = ['a', 'b', 'c'].map((name) => createNode({ type: 'element', name }))
  for (const n of [a!, b!, c!]) page.nodes[n.id] = n
  root.children = [a!.id, b!.id, c!.id]
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const cur = () => store.getState().doc.pages[0]!
  const env = () => ({ doc: store.getState().doc, page: cur(), history })
  const sel = () => selectionStore.getState()
  return {
    doc,
    history,
    cur,
    env,
    sel,
    rootId: root.id,
    a: a!.id,
    b: b!.id,
    c: c!.id,
    pc: doc.devices[0]!.id,
  }
}

beforeEach(() => {
  selectionStore.setState({ selectedIds: [], activeDeviceId: undefined, hover: null })
  clearClipboard()
})

describe('runEditAction', () => {
  it('duplicate: 直後に複製し、複製を選択する', () => {
    const t = setup()
    t.sel().pick(t.a, t.pc, false)
    runEditAction('duplicate', t.env())
    const kids = t.cur().nodes[t.rootId]!.children
    expect(kids).toHaveLength(4)
    expect(t.sel().selectedIds).toEqual([kids[1]])
  })

  it('delete → Undo で復元、ロック中は消さない', () => {
    const t = setup()
    t.sel().pick(t.b, t.pc, false)
    runEditAction('delete', t.env())
    expect(t.cur().nodes[t.b]).toBeUndefined()
    runEditAction('undo', t.env())
    expect(t.cur().nodes[t.b]).toBeDefined()
    t.history.execute(createNodeMetaCommand(t.cur().id, t.b, { locked: true }, 'toggle-lock'))
    runEditAction('delete', t.env())
    expect(t.cur().nodes[t.b]).toBeDefined()
  })

  it('copy / paste: 選択の直後に貼り、貼ったものを選択する。空なら何もしない', () => {
    const t = setup()
    runEditAction('paste', t.env())
    expect(t.history.getState().canUndo).toBe(false)
    t.sel().pick(t.a, t.pc, false)
    runEditAction('copy', t.env())
    t.sel().pick(t.c, t.pc, false)
    runEditAction('paste', t.env())
    const kids = t.cur().nodes[t.rootId]!.children
    expect(kids).toHaveLength(4)
    expect(kids.slice(0, 3)).toEqual([t.a, t.b, t.c])
    expect(t.sel().selectedIds).toEqual([kids[3]])
    expect(t.cur().nodes[kids[3]!]!.name).toBe('a')
  })

  it('group → ungroup', () => {
    const t = setup()
    t.sel().pickMany([t.a, t.b], t.pc, false)
    runEditAction('group', t.env())
    const g = t.sel().selectedIds[0]!
    expect(t.cur().nodes[t.rootId]!.children).toEqual([g, t.c])
    runEditAction('ungroup', t.env())
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.c])
    expect(t.sel().selectedIds).toEqual([t.a, t.b])
  })

  it('z 順: 最前面 → 1 つ背面', () => {
    const t = setup()
    t.sel().pick(t.a, t.pc, false)
    runEditAction('front', t.env())
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.b, t.c, t.a])
    runEditAction('backward', t.env())
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.b, t.a, t.c])
  })

  it('選択が無ければ構造操作は何もしない', () => {
    const t = setup()
    for (const act of ['duplicate', 'delete', 'group', 'ungroup', 'front'] as const) {
      runEditAction(act, t.env())
    }
    expect(t.history.getState().canUndo).toBe(false)
  })
})

describe('dropCategory', () => {
  it('ルートに追加して選択し、Undo で消える', () => {
    const t = setup()
    const id = dropCategory(t.env(), {
      deviceId: t.pc,
      hitId: undefined,
      category: 'button',
      world: { x: 0, y: 0 },
      rectOf: () => undefined,
    })!
    const kids = t.cur().nodes[t.rootId]!.children
    expect(kids[kids.length - 1]).toBe(id)
    expect(t.sel().selectedIds).toEqual([id])
    runEditAction('undo', t.env())
    expect(t.cur().nodes[t.rootId]!.children).toHaveLength(3)
  })
})
