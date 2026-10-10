import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createEmptyDocument, createNode, PropsSchema, type Node } from '../model'
import { registerCategory, listCategories } from './categories'
import { classifyNode, classifyNodes, createSetCategoryCommand } from './engine'
import { registerRule } from './rules'

const mk = (
  type: string,
  custom: Record<string, unknown> = {},
  groups: Record<string, Record<string, unknown>> = {},
  kids: Node[] = [],
  extra: Partial<Node> = {},
) =>
  createNode({
    type,
    props: PropsSchema.parse({ ...groups, custom }),
    children: kids.map((k) => k.id),
    ...extra,
  })
const cls = (n: Node, kids: Node[] = []) => classifyNode(n, (id) => kids.find((k) => k.id === id))

describe('classifyNode', () => {
  it('tag: button', () => {
    const c = cls(mk('element', { tag: 'button' }, { content: { text: 'OK' } }))
    expect(c.category).toBe('button')
    expect(c.needsReview).toBe(false)
  })
  it('role=switch は toggle', () => {
    expect(cls(mk('element', { tag: 'div', role: 'switch' })).category).toBe('toggle')
  })
  it('見出しと input type', () => {
    expect(cls(mk('element', { tag: 'h2' }, { content: { text: 'A' } })).category).toBe(
      'text-heading',
    )
    expect(
      cls(mk('element', { tag: 'input' }, { content: { inputType: 'checkbox' } })).category,
    ).toBe('input-checkbox')
    expect(cls(mk('element', { tag: 'input' }, { content: { inputType: 'email' } })).category).toBe(
      'input-text',
    )
  })
  it('子を持つ div は container(要確認なし)、空の leaf は要確認', () => {
    const kid = mk('text', {}, { content: { text: 'x' } })
    const parent = cls(mk('element', { tag: 'div' }, {}, [kid]), [kid])
    expect(parent.category).toBe('container')
    expect(parent.needsReview).toBe(false)
    expect(cls(mk('element', { tag: 'div' })).needsReview).toBe(true)
  })
  it('スタイルから card を推定', () => {
    const kid = mk('text', {}, { content: { text: 'x' } })
    const n = mk(
      'element',
      { tag: 'div' },
      { radius: { borderTopLeftRadius: '8px' }, shadow: { boxShadow: '0 1px 2px #000' } },
      [kid],
    )
    expect(cls(n, [kid]).category).toBe('card')
  })
})

describe('classifyNodes', () => {
  it('ルートと固定ノードは変更せず、入力も変更しない', () => {
    const a = mk('element', { tag: 'button' }, { content: { text: 'A' } })
    const b = mk('element', { tag: 'button', categoryPinned: true }, {}, [], { category: 'link' })
    const root = mk('element', {}, {}, [a, b])
    const out = classifyNodes([root, a, b])
    expect(out[0]).toBe(root)
    expect(out[1].category).toBe('button')
    expect(out[1].props.custom.categoryConfidence).toBeGreaterThan(0.9)
    expect(out[2].category).toBe('link')
    expect(a.category).toBe('container')
  })
})

describe('拡張とレジストリ', () => {
  it('カテゴリとルールを追加するだけで分類できる', () => {
    registerCategory({
      id: 'test-widget',
      label: 'テスト',
      defaultProps: {},
      allowedChildren: 'any',
      eventCandidates: [],
    })
    registerRule({
      id: 'test:widget',
      category: 'test-widget',
      score: (f) => (f.tag === 'x-widget' ? 0.99 : 0),
    })
    expect(cls(mk('element', { tag: 'x-widget' })).category).toBe('test-widget')
    expect(listCategories().length).toBeGreaterThanOrEqual(28)
  })
})

describe('createSetCategoryCommand', () => {
  it('手動変更で固定フラグが立ち、未知カテゴリは拒否', () => {
    const doc = createEmptyDocument()
    const page = doc.pages[0]
    const n = mk('element', { tag: 'div' })
    page.nodes[n.id] = n
    page.nodes[page.rootNodeId].children.push(n.id)
    const next = produce(doc, (d) => createSetCategoryCommand(page.id, n.id, 'card').apply(d))
    const got = next.pages[0].nodes[n.id]
    expect(got.category).toBe('card')
    expect(got.props.custom.categoryPinned).toBe(true)
    expect(() =>
      produce(doc, (d) => createSetCategoryCommand(page.id, n.id, 'nope').apply(d)),
    ).toThrow()
  })
})
