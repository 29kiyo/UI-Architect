import { describe, expect, it } from 'vitest'
import {
  createEmptyDocument,
  createHistory,
  createDocumentStore,
  createNode,
  resolveNode,
} from '@/core'
import {
  createResetHiddenAtDeviceCommand,
  createSetHiddenAtDeviceCommand,
  hiddenState,
} from './hiddenCommands'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  const doc = () => store.getState().doc
  const n = createNode({ type: 'element', name: 'nav' })
  store.getState().update((d) => {
    const p = d.pages[0]!
    p.nodes[n.id] = n
    p.nodes[p.rootNodeId]!.children.push(n.id)
  })
  const pageId = doc().pages[0]!.id
  const [pc, mobile] = doc().devices
  return { history, doc, n, pageId, pc: pc!.id, mobile: mobile!.id }
}

describe('デバイス別の非表示', () => {
  it('モバイルだけ非表示にでき、PC は表示のまま。Undo/リセットできる', () => {
    const s = setup()
    s.history.execute(
      createSetHiddenAtDeviceCommand({
        pageId: s.pageId,
        deviceId: s.mobile,
        base: false,
        nodeIds: [s.n.id],
        hidden: true,
      }),
    )
    const page = () => s.doc().pages[0]!
    expect(resolveNode(page(), s.mobile, s.n.id)!.hidden).toBe(true)
    expect(resolveNode(page(), s.pc, s.n.id)!.hidden).toBe(false)
    expect(hiddenState(page(), s.mobile, s.n.id)).toEqual({ hidden: true, overridden: true })
    s.history.undo()
    expect(resolveNode(page(), s.mobile, s.n.id)!.hidden).toBe(false)
    s.history.redo()
    s.history.execute(
      createResetHiddenAtDeviceCommand({ pageId: s.pageId, deviceId: s.mobile, nodeIds: [s.n.id] }),
    )
    expect(hiddenState(page(), s.mobile, s.n.id)).toEqual({ hidden: false, overridden: false })
    expect(page().overrides[s.mobile]).toBeUndefined()
  })

  it('基準デバイスでは共有の hidden を書く', () => {
    const s = setup()
    s.history.execute(
      createSetHiddenAtDeviceCommand({
        pageId: s.pageId,
        deviceId: s.pc,
        base: true,
        nodeIds: [s.n.id],
        hidden: true,
      }),
    )
    expect(s.doc().pages[0]!.nodes[s.n.id]!.hidden).toBe(true)
    expect(s.doc().pages[0]!.overrides[s.pc]).toBeUndefined()
  })
})
