import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  PROP_GROUP_KEYS,
  PageSchema,
  UIDocumentSchema,
  createEmptyDocument,
  createNode,
  createPage,
  newId,
} from './index'

describe('UIDocument schema', () => {
  it('空ドキュメントが検証を通り、JSON往復で等価', () => {
    const doc = createEmptyDocument('t')
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    const parsed = UIDocumentSchema.parse(JSON.parse(JSON.stringify(doc)))
    expect(parsed).toEqual(doc)
  })

  it('最小入力から既定値が補完される', () => {
    const doc = UIDocumentSchema.parse({ schemaVersion: 1, project: { name: 'x' } })
    expect(doc.pages).toEqual([])
    expect(doc.tokens).toEqual({ colors: {}, spacing: {}, fonts: {} })
  })

  it('props は全グループを持つ', () => {
    const n = createNode({ type: 'element' })
    expect(Object.keys(n.props).sort()).toEqual([...PROP_GROUP_KEYS].sort())
    expect(n.locked).toBe(false)
    expect(n.children).toEqual([])
  })

  it('ID は衝突しない', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
  })

  it('子ノード参照切れを拒否する', () => {
    const page = createPage()
    const root = page.nodes[page.rootNodeId]
    const broken = { ...page, nodes: { [root.id]: { ...root, children: ['missing'] } } }
    expect(PageSchema.safeParse(broken).success).toBe(false)
  })

  it('rootNodeId 不在・key/id 不一致を拒否する', () => {
    const page = createPage()
    expect(PageSchema.safeParse({ ...page, rootNodeId: 'nope' }).success).toBe(false)
    const root = page.nodes[page.rootNodeId]
    expect(PageSchema.safeParse({ ...page, nodes: { wrong: root } }).success).toBe(false)
  })

  it('不正な device.kind / action.type を拒否する', () => {
    const doc = createEmptyDocument()
    const bad = { ...doc, devices: [{ ...doc.devices[0], kind: 'tv' }] }
    expect(UIDocumentSchema.safeParse(bad).success).toBe(false)
    const n = createNode({ type: 'element' })
    const badEv = { ...n, events: [{ id: 'e', trigger: 'click', actions: [{ type: 'eval' }] }] }
    expect(
      UIDocumentSchema.safeParse({
        ...doc,
        pages: [{ ...doc.pages[0], nodes: { [n.id]: badEv }, rootNodeId: n.id }],
      }).success,
    ).toBe(false)
  })
})
