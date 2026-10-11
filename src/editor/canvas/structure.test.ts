import { describe, expect, it } from 'vitest'
import {
  copySubtrees,
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createNode,
} from '@/core'
import {
  createDeleteCommand,
  createDuplicateCommand,
  createGroupCommand,
  createPasteCommand,
  createUngroupCommand,
  createZOrderCommand,
} from './structure'

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
  return {
    history,
    cur,
    pageId: page.id,
    rootId: root.id,
    a: a!.id,
    b: b!.id,
    c: c!.id,
    pc: doc.devices[0]!.id,
    mobile: doc.devices[1]!.id,
  }
}

describe('structure commands', () => {
  it('duplicate: 生成 ID が返り、Undo で戻る', () => {
    const t = setup()
    const cmd = createDuplicateCommand(t.pageId, [t.a])
    t.history.execute(cmd.command)
    expect(cmd.created).toHaveLength(1)
    expect(t.cur().nodes[t.rootId]!.children[1]).toBe(cmd.created[0])
    t.history.undo()
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.c])
  })

  it('delete → Undo で復元される', () => {
    const t = setup()
    t.history.execute(createDeleteCommand(t.pageId, [t.b]))
    expect(t.cur().nodes[t.b]).toBeUndefined()
    t.history.undo()
    expect(t.cur().nodes[t.b]?.name).toBe('b')
  })

  it('group / ungroup は 1 回の Undo で戻る', () => {
    const t = setup()
    const g = createGroupCommand(t.pageId, [t.a, t.b])
    t.history.execute(g.command)
    expect(t.cur().nodes[t.rootId]!.children).toEqual([g.created[0], t.c])
    t.history.execute(createUngroupCommand(t.pageId, g.created[0]!))
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.c])
    t.history.undo()
    t.history.undo()
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.c])
  })

  it('paste: コピーしたサブツリーを別の親に貼れる', () => {
    const t = setup()
    const clip = copySubtrees(t.cur(), [t.a])
    const cmd = createPasteCommand(t.pageId, clip, t.b, 0)
    t.history.execute(cmd.command)
    expect(t.cur().nodes[t.b]!.children).toEqual(cmd.created)
    expect(t.cur().nodes[t.a]).toBeDefined()
  })

  it('z-order: 基準は共有 children、他デバイスは order override', () => {
    const t = setup()
    t.history.execute(
      createZOrderCommand({
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        parentId: t.rootId,
        ids: [t.a],
        dir: 'front',
      }),
    )
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.b, t.c, t.a])
    t.history.execute(
      createZOrderCommand({
        pageId: t.pageId,
        deviceId: t.mobile,
        base: false,
        parentId: t.rootId,
        ids: [t.b],
        dir: 'front',
      }),
    )
    expect(t.cur().overrides[t.mobile]?.[t.rootId]?.order).toEqual([t.c, t.a, t.b])
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.b, t.c, t.a])
  })
})
