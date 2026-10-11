import { describe, expect, it } from 'vitest'
import { createNode, createPage, type Node } from '@/core'
import { canContain, createNodeForCategory, dropParent, planPaletteDrop } from './palette'

function mkPage() {
  const page = createPage()
  const root = page.nodes[page.rootNodeId]!
  const mk = (name: string, parent: Node = root, extra: Partial<Node> = {}) => {
    const n = createNode({ type: 'element', name, ...extra })
    page.nodes[n.id] = n
    parent.children.push(n.id)
    return n
  }
  return { page, root, mk }
}

describe('createNodeForCategory', () => {
  it('カテゴリに応じた種別・初期サイズ・文言を持つ', () => {
    const btn = createNodeForCategory('button')!
    expect(btn.type).toBe('element')
    expect(btn.category).toBe('button')
    expect(btn.props.size.width).toBe('120px')
    expect(btn.props.layout.display).toBe('inline-flex') // カテゴリ既定 props が反映される
    expect(typeof btn.props.content.text).toBe('string')
    expect(createNodeForCategory('text-heading')?.type).toBe('text')
    expect(createNodeForCategory('image')?.type).toBe('image')
    expect(createNodeForCategory('nope')).toBeUndefined()
  })

  it('生成のたびに別の ID', () => {
    expect(createNodeForCategory('card')!.id).not.toBe(createNodeForCategory('card')!.id)
  })
})

describe('canContain / dropParent', () => {
  it('テキスト・画像・リーフカテゴリは子を持てない', () => {
    const t = mkPage()
    expect(canContain(createNode({ type: 'text' }), 'card')).toBe(false)
    expect(canContain(createNode({ type: 'element', category: 'input-text' }), 'card')).toBe(false)
    expect(canContain(t.root, 'card')).toBe(true)
    const list = createNode({ type: 'element', category: 'list' })
    expect(canContain(list, 'button')).toBe(false)
    expect(canContain(list, 'list-item')).toBe(true)
  })

  it('ヒット先が入れ物でなければ親方向に探し、無ければルート', () => {
    const t = mkPage()
    const box = t.mk('box')
    const txt = t.mk('txt', box, { type: 'text', category: 'text-body' })
    const btn = t.mk('btn', t.root, { category: 'button' })
    expect(dropParent(t.page, txt.id, 'card')).toBe(box.id)
    expect(dropParent(t.page, box.id, 'card')).toBe(box.id)
    expect(dropParent(t.page, btn.id, 'card')).toBe(t.root.id) // ボタンの中には入れない
    expect(dropParent(t.page, undefined, 'card')).toBe(t.root.id)
  })
})

describe('planPaletteDrop', () => {
  it('配置基準の親(relative)では、ドロップ位置に absolute で置く', () => {
    const t = mkPage()
    t.root.props.position = { position: 'relative' }
    const plan = planPaletteDrop(t.page, undefined, 'card', { x: 130, y: 70 }, () => ({
      x: 100,
      y: 50,
      width: 500,
      height: 300,
    }))!
    expect(plan.parentId).toBe(t.root.id)
    expect(plan.node.props.position).toMatchObject({
      position: 'absolute',
      left: '30px',
      top: '20px',
    })
  })

  it('通常の流れの親や flex の親では座標を付けない', () => {
    const t = mkPage()
    const rect = () => ({ x: 0, y: 0, width: 10, height: 10 })
    const a = planPaletteDrop(t.page, undefined, 'card', { x: 5, y: 5 }, rect)!
    expect(a.node.props.position.position).toBeUndefined()
    t.root.props.position = { position: 'relative' }
    t.root.props.layout = { display: 'flex' }
    const b = planPaletteDrop(t.page, undefined, 'card', { x: 5, y: 5 }, rect)!
    expect(b.node.props.position.position).toBeUndefined()
  })

  it('未知のカテゴリは undefined', () => {
    const t = mkPage()
    expect(
      planPaletteDrop(t.page, undefined, 'nope', { x: 0, y: 0 }, () => undefined),
    ).toBeUndefined()
  })
})
