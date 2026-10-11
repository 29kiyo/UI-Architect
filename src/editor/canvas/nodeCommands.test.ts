import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, createNode } from '@/core'
import { createAddNodeCommand, createMoveToCommand, createNodeMetaCommand } from './nodeCommands'

function setup() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const root = page.nodes[page.rootNodeId]!
  const [a, a1, b, c] = ['a', 'a1', 'b', 'c'].map((name) => createNode({ type: 'element', name }))
  for (const n of [a!, a1!, b!, c!]) page.nodes[n.id] = n
  a!.children = [a1!.id]
  root.children = [a!.id, b!.id, c!.id]
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const cur = () => store.getState().doc.pages[0]!
  return {
    history,
    cur,
    pageId: page.id,
    rootId: root.id,
    a: a!.id,
    a1: a1!.id,
    b: b!.id,
    c: c!.id,
    pc: doc.devices[0]!.id,
    mobile: doc.devices[1]!.id,
  }
}

describe('createMoveToCommand', () => {
  it('別の親へ付け替え(index 指定)、Undo で戻る', () => {
    const t = setup()
    t.history.execute(
      createMoveToCommand({
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        nodeId: t.a1,
        parentId: t.rootId,
        beforeId: t.c,
      }),
    )
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.a1, t.c])
    expect(t.cur().nodes[t.a]!.children).toEqual([])
    t.history.undo()
    expect(t.cur().nodes[t.a]!.children).toEqual([t.a1])
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.c])
  })

  it('子として入れる(末尾)', () => {
    const t = setup()
    t.history.execute(
      createMoveToCommand({
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        nodeId: t.b,
        parentId: t.a,
        beforeId: undefined,
      }),
    )
    expect(t.cur().nodes[t.a]!.children).toEqual([t.a1, t.b])
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.c])
  })

  it('同じ親なら並び替え(基準は共有、他デバイスは order override)', () => {
    const t = setup()
    t.history.execute(
      createMoveToCommand({
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        nodeId: t.a,
        parentId: t.rootId,
        beforeId: undefined,
      }),
    )
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.b, t.c, t.a])
    t.history.execute(
      createMoveToCommand({
        pageId: t.pageId,
        deviceId: t.mobile,
        base: false,
        nodeId: t.c,
        parentId: t.rootId,
        beforeId: t.b,
      }),
    )
    expect(t.cur().overrides[t.mobile]?.[t.rootId]?.order).toEqual([t.c, t.b, t.a])
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.b, t.c, t.a])
  })

  it('自分の子孫へは付け替えられない(throw)', () => {
    const t = setup()
    expect(() =>
      t.history.execute(
        createMoveToCommand({
          pageId: t.pageId,
          deviceId: t.pc,
          base: true,
          nodeId: t.a,
          parentId: t.a1,
          beforeId: undefined,
        }),
      ),
    ).toThrow()
  })
})

describe('createNodeMetaCommand / createAddNodeCommand', () => {
  it('名前・非表示・ロックを変更し、Undo で戻る', () => {
    const t = setup()
    t.history.execute(createNodeMetaCommand(t.pageId, t.b, { name: 'B2' }, 'rename'))
    t.history.execute(createNodeMetaCommand(t.pageId, t.b, { hidden: true, locked: true }))
    expect(t.cur().nodes[t.b]).toMatchObject({ name: 'B2', hidden: true, locked: true })
    t.history.undo()
    t.history.undo()
    expect(t.cur().nodes[t.b]).toMatchObject({ name: 'b', hidden: false, locked: false })
  })

  it('ノード追加', () => {
    const t = setup()
    const n = createNode({ type: 'element', name: 'new' })
    t.history.execute(createAddNodeCommand(t.pageId, n, t.b))
    expect(t.cur().nodes[t.b]!.children).toEqual([n.id])
    t.history.undo()
    expect(t.cur().nodes[n.id]).toBeUndefined()
  })
})
