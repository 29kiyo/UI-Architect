import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { createEmptyDocument, createNode, newId, UIDocumentSchema } from '../model'
import { resolveNode } from '../device'
import { createDocumentStore } from '../store'
import { createMobileMenuCommand, navMenuBlocker } from './navMenu'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  const doc = () => store.getState().doc
  const nav = createNode({ type: 'element', category: 'nav', name: 'nav' })
  store.getState().update((d) => {
    const p = d.pages[0]!
    p.nodes[nav.id] = nav
    p.nodes[p.rootNodeId]!.children.push(nav.id)
  })
  const [pc, mobile] = doc().devices
  const ids = { buttonId: newId(), variableId: newId(), eventId: newId() }
  return { history, doc, nav, pageId: doc().pages[0]!.id, pc: pc!.id, mobile: mobile!.id, ids }
}

describe('スマホ用メニュー生成', () => {
  it('ボタン・変数・デバイス別表示を 1 履歴で作り、Undo で戻る', () => {
    const s = setup()
    const before = s.doc()
    s.history.execute(
      createMobileMenuCommand({
        pageId: s.pageId,
        navId: s.nav.id,
        mobileDeviceId: s.mobile,
        ids: s.ids,
      }),
    )
    const page = () => s.doc().pages[0]!
    const root = page().nodes[page().rootNodeId]!
    expect(root.children).toEqual([s.ids.buttonId, s.nav.id])
    expect(resolveNode(page(), s.mobile, s.ids.buttonId)!.hidden).toBe(false)
    expect(resolveNode(page(), s.pc, s.ids.buttonId)!.hidden).toBe(true)
    expect(resolveNode(page(), s.mobile, s.nav.id)!.hidden).toBe(true)
    expect(resolveNode(page(), s.pc, s.nav.id)!.hidden).toBe(false)
    expect(s.doc().variables[0]).toMatchObject({ name: 'menuOpen', scope: 'page', type: 'boolean' })
    expect(page().nodes[s.ids.buttonId]!.events[0]!.actions[0]).toEqual({
      type: 'toggle',
      variable: 'menuOpen',
    })
    expect(UIDocumentSchema.safeParse(structuredClone(s.doc())).success).toBe(true)
    s.history.undo()
    expect(s.doc()).toEqual(before)
  })

  it('不可: 基準デバイス / 生成済み / nav 以外', () => {
    const s = setup()
    expect(navMenuBlocker(s.doc(), s.pageId, s.nav.id, s.pc)).toBe('base-device')
    expect(navMenuBlocker(s.doc(), s.pageId, s.pageId, s.mobile)).toBe('missing')
    expect(navMenuBlocker(s.doc(), s.pageId, s.doc().pages[0]!.rootNodeId, s.mobile)).toBe(
      'not-nav',
    )
    s.history.execute(
      createMobileMenuCommand({
        pageId: s.pageId,
        navId: s.nav.id,
        mobileDeviceId: s.mobile,
        ids: s.ids,
      }),
    )
    expect(navMenuBlocker(s.doc(), s.pageId, s.nav.id, s.mobile)).toBe('exists')
  })
})
