import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, createNode } from '@/core'
import { createPropsCommand, createReorderCommand, isBaseDevice } from './commands'

function setup() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const root = page.nodes[page.rootNodeId]!
  const [a, b, c] = ['a', 'b', 'c'].map((name) => createNode({ type: 'element', name }))
  for (const n of [a!, b!, c!]) page.nodes[n.id] = n
  root.children = [a!.id, b!.id, c!.id]
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const pc = doc.devices[0]!.id
  const mobile = doc.devices[1]!.id
  const cur = () => store.getState().doc.pages[0]!
  return {
    store,
    history,
    pageId: page.id,
    rootId: root.id,
    a: a!.id,
    b: b!.id,
    c: c!.id,
    pc,
    mobile,
    cur,
    doc,
  }
}

const left = (v: string, nodeId: string) => ({
  nodeId,
  group: 'position' as const,
  key: 'left',
  value: v,
})

describe('createPropsCommand', () => {
  it('基準デバイスは共有 props に書き、Undo で戻る', () => {
    const t = setup()
    t.history.execute(
      createPropsCommand({
        name: 'move',
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        writes: [left('10px', t.a)],
      }),
    )
    expect(t.cur().nodes[t.a]!.props.position.left).toBe('10px')
    expect(t.cur().overrides).toEqual({})
    t.history.undo()
    expect(t.cur().nodes[t.a]!.props.position.left).toBeUndefined()
  })

  it('他デバイスは override に書き、共有は変わらない', () => {
    const t = setup()
    t.history.execute(
      createPropsCommand({
        name: 'move',
        pageId: t.pageId,
        deviceId: t.mobile,
        base: false,
        writes: [left('7px', t.a)],
      }),
    )
    expect(t.cur().nodes[t.a]!.props.position.left).toBeUndefined()
    expect(t.cur().overrides[t.mobile]?.[t.a]?.propsDiff.position?.left).toBe('7px')
  })

  it('基準デバイスでも、既に override 済みのキーは override に書く', () => {
    const t = setup()
    t.history.execute(
      createPropsCommand({
        name: 'x',
        pageId: t.pageId,
        deviceId: t.pc,
        base: false,
        writes: [left('1px', t.a)],
      }),
    )
    t.history.execute(
      createPropsCommand({
        name: 'move',
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        writes: [left('2px', t.a)],
      }),
    )
    expect(t.cur().overrides[t.pc]?.[t.a]?.propsDiff.position?.left).toBe('2px')
    expect(t.cur().nodes[t.a]!.props.position.left).toBeUndefined()
  })

  it('同じ coalesceKey は Undo 1 回で全部戻る', () => {
    const t = setup()
    for (const v of ['1px', '2px', '3px']) {
      t.history.execute(
        createPropsCommand({
          name: 'move',
          pageId: t.pageId,
          deviceId: t.pc,
          base: true,
          writes: [left(v, t.a)],
          coalesceKey: 'g1',
        }),
      )
    }
    expect(t.cur().nodes[t.a]!.props.position.left).toBe('3px')
    expect(t.history.getState().undoCount).toBe(1)
    t.history.undo()
    expect(t.cur().nodes[t.a]!.props.position.left).toBeUndefined()
    expect(t.history.getState().canUndo).toBe(false)
  })

  it('isBaseDevice は devices[0] だけ true', () => {
    const t = setup()
    expect(isBaseDevice(t.doc.devices, t.pc)).toBe(true)
    expect(isBaseDevice(t.doc.devices, t.mobile)).toBe(false)
  })
})

describe('createReorderCommand', () => {
  it('基準デバイスは共有の children を並び替える(Undo 可)', () => {
    const t = setup()
    t.history.execute(
      createReorderCommand({
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        parentId: t.rootId,
        nodeId: t.a,
        beforeId: undefined,
      }),
    )
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.b, t.c, t.a])
    t.history.undo()
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.c])
  })

  it('他デバイスは override の order に書き、共有は不変', () => {
    const t = setup()
    t.history.execute(
      createReorderCommand({
        pageId: t.pageId,
        deviceId: t.mobile,
        base: false,
        parentId: t.rootId,
        nodeId: t.c,
        beforeId: t.a,
      }),
    )
    expect(t.cur().overrides[t.mobile]?.[t.rootId]?.order).toEqual([t.c, t.a, t.b])
    expect(t.cur().nodes[t.rootId]!.children).toEqual([t.a, t.b, t.c])
  })

  it('順序が変わらなければ履歴に積まない', () => {
    const t = setup()
    const changed = t.history.execute(
      createReorderCommand({
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        parentId: t.rootId,
        nodeId: t.a,
        beforeId: t.b,
      }),
    )
    expect(changed).toBe(false)
    expect(t.history.getState().canUndo).toBe(false)
  })
})
