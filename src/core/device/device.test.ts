import { describe, expect, it } from 'vitest'
import { createLogger } from '@/shared'
import {
  PageSchema,
  UIDocumentSchema,
  createEmptyDocument,
  createNode,
  createPage,
  type Page,
} from '../model'
import { createHistory } from '../history'
import { addNode, createDocumentStore, removeNode } from '../store'
import {
  attachNode,
  detachNode,
  isDetached,
  resetOverrideProp,
  resolveNode,
  setOverrideHidden,
  setOverrideOrder,
  setOverrideProp,
} from './index'

// root ─ a(layout{display:flex,gap:8}, size{width:100}) / b / c
function setup() {
  const doc = createEmptyDocument('t')
  const [pc, mobile] = doc.devices
  const store = createDocumentStore(doc)
  const a = createNode({ type: 'element', name: 'a' })
  a.props.layout = { display: 'flex', gap: 8 }
  a.props.size = { width: 100 }
  const b = createNode({ type: 'element', name: 'b' })
  const c = createNode({ type: 'element', name: 'c' })
  store.getState().update((d) => {
    const p = d.pages[0]
    addNode(p, a, p.rootNodeId)
    addNode(p, b, p.rootNodeId)
    addNode(p, c, p.rootNodeId)
  })
  const edit = (fn: (p: Page) => void) =>
    store.getState().update((d) => {
      fn(d.pages[0])
    })
  const page = () => store.getState().doc.pages[0]
  return { store, doc, pc, mobile, a, b, c, edit, page }
}

describe('resolveNode', () => {
  it('override なしは共有ノードをそのまま返す', () => {
    const s = setup()
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)).toBe(s.page().nodes[s.a.id])
  })

  it('propsDiff はキー単位でマージされ、共有側の変更に追従する', () => {
    const s = setup()
    s.edit((p) => setOverrideProp(p, s.mobile.id, s.a.id, 'layout', 'gap', 4))
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)!.props.layout).toEqual({
      display: 'flex',
      gap: 4,
    })
    expect(resolveNode(s.page(), s.pc.id, s.a.id)!.props.layout).toEqual({
      display: 'flex',
      gap: 8,
    })
    s.edit((p) => {
      p.nodes[s.a.id].props.layout.display = 'block'
    })
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)!.props.layout).toEqual({
      display: 'block',
      gap: 4,
    })
    expect(s.page().nodes[s.a.id].props.layout.gap).toBe(8) // 共有ノードは不変
  })

  it('resetOverrideProp で共有値に戻り、空の override は消える', () => {
    const s = setup()
    s.edit((p) => setOverrideProp(p, s.mobile.id, s.a.id, 'layout', 'gap', 4))
    s.edit((p) => resetOverrideProp(p, s.mobile.id, s.a.id, 'layout', 'gap'))
    expect(s.page().overrides).toEqual({})
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)!.props.layout.gap).toBe(8)
  })

  it('hidden の上書きと解除', () => {
    const s = setup()
    s.edit((p) => setOverrideHidden(p, s.mobile.id, s.a.id, true))
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)!.hidden).toBe(true)
    expect(resolveNode(s.page(), s.pc.id, s.a.id)!.hidden).toBe(false)
    s.edit((p) => setOverrideHidden(p, s.mobile.id, s.a.id, undefined))
    expect(s.page().overrides).toEqual({})
  })

  it('order: 載っている子が先頭、存在しない ID は無視、残りは共有順', () => {
    const s = setup()
    const rootId = s.page().rootNodeId
    s.edit((p) => setOverrideOrder(p, s.mobile.id, rootId, [s.c.id, 'stale', s.a.id]))
    expect(resolveNode(s.page(), s.mobile.id, rootId)!.children).toEqual([s.c.id, s.a.id, s.b.id])
    expect(resolveNode(s.page(), s.pc.id, rootId)!.children).toEqual([s.a.id, s.b.id, s.c.id])
  })
})

describe('detach / attach', () => {
  it('detach 後は共有の変更に追従せず、attach で追従に戻る', () => {
    const s = setup()
    s.edit((p) => setOverrideProp(p, s.mobile.id, s.a.id, 'layout', 'gap', 4))
    s.edit((p) => detachNode(p, s.mobile.id, s.a.id))
    expect(isDetached(s.page(), s.mobile.id, s.a.id)).toBe(true)
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)!.props.layout).toEqual({
      display: 'flex',
      gap: 4,
    })

    s.edit((p) => {
      p.nodes[s.a.id].props.size.width = 200
    })
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)!.props.size).toEqual({ width: 100 })
    expect(resolveNode(s.page(), s.pc.id, s.a.id)!.props.size).toEqual({ width: 200 })

    s.edit((p) => attachNode(p, s.mobile.id, s.a.id))
    expect(resolveNode(s.page(), s.mobile.id, s.a.id)!.props.size).toEqual({ width: 200 })
    expect(s.page().overrides).toEqual({})
  })

  it('detached ノードの reset は拒否される', () => {
    const s = setup()
    s.edit((p) => detachNode(p, s.mobile.id, s.a.id))
    expect(() => s.edit((p) => resetOverrideProp(p, s.mobile.id, s.a.id, 'layout'))).toThrow()
  })
})

describe('整合性・永続化・履歴', () => {
  it('ノード削除で override も消える', () => {
    const s = setup()
    s.edit((p) => setOverrideProp(p, s.mobile.id, s.a.id, 'layout', 'gap', 4))
    s.edit((p) => {
      removeNode(p, s.a.id)
    })
    expect(s.page().overrides).toEqual({})
    expect(PageSchema.safeParse(s.page()).success).toBe(true)
  })

  it('存在しないノードへの override を拒否し、overrides 無しの旧データは {} で補完', () => {
    const page = createPage()
    const bad = {
      ...page,
      overrides: { dev: { missing: { propsDiff: {}, detached: false } } },
    }
    expect(PageSchema.safeParse(bad).success).toBe(false)
    const legacy = JSON.parse(JSON.stringify(page))
    delete legacy.overrides
    expect(PageSchema.parse(legacy).overrides).toEqual({})
  })

  it('JSON 往復で等価', () => {
    const s = setup()
    s.edit((p) => {
      setOverrideProp(p, s.mobile.id, s.a.id, 'layout', 'gap', 4)
      setOverrideHidden(p, s.mobile.id, s.b.id, true)
      detachNode(p, s.mobile.id, s.c.id)
    })
    const doc = s.store.getState().doc
    expect(UIDocumentSchema.parse(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })

  it('Command 経由で Undo / Redo できる', () => {
    const s = setup()
    const history = createHistory(s.store, { logger: createLogger() })
    const before = s.store.getState().doc
    history.execute({
      name: 'override gap',
      apply: (d) => setOverrideProp(d.pages[0], s.mobile.id, s.a.id, 'layout', 'gap', 4),
    })
    const after = s.store.getState().doc
    history.undo()
    expect(s.store.getState().doc).toEqual(before)
    history.redo()
    expect(s.store.getState().doc).toEqual(after)
  })
})
