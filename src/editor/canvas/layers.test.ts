import { describe, expect, it } from 'vitest'
import { createNode, createPage, type Node } from '@/core'
import { buildRows, dropPosition, resolveDrop } from './layers'

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

function tree() {
  const t = mkPage()
  const a = t.mk('a')
  const a1 = t.mk('a1', a)
  const a2 = t.mk('a2', a)
  const b = t.mk('b')
  const c = t.mk('c')
  return { ...t, a, a1, a2, b, c, dev: 'pc' }
}

describe('buildRows', () => {
  it('ルート直下から深さ付きで並べる', () => {
    const t = tree()
    const rows = buildRows(t.page, t.dev, new Set(), '')
    expect(rows.map((r) => r.id)).toEqual([t.a.id, t.a1.id, t.a2.id, t.b.id, t.c.id])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0, 0])
  })

  it('折りたたむと子を出さない', () => {
    const t = tree()
    const rows = buildRows(t.page, t.dev, new Set([t.a.id]), '')
    expect(rows.map((r) => r.id)).toEqual([t.a.id, t.b.id, t.c.id])
    expect(rows[0]?.collapsed).toBe(true)
  })

  it('検索は一致と祖先だけを開いて出す', () => {
    const t = tree()
    expect(buildRows(t.page, t.dev, new Set([t.a.id]), 'a1').map((r) => r.id)).toEqual([
      t.a.id,
      t.a1.id,
    ])
    expect(buildRows(t.page, t.dev, new Set(), 'zzz')).toEqual([])
  })

  it('デバイス別の並び順(order override)に従う', () => {
    const t = tree()
    t.page.overrides.m = {
      [t.root.id]: { propsDiff: {}, detached: false, order: [t.c.id, t.b.id, t.a.id] },
    }
    expect(
      buildRows(t.page, 'm', new Set(), '')
        .map((r) => r.id)
        .slice(0, 2),
    ).toEqual([t.c.id, t.b.id])
  })
})

describe('dropPosition', () => {
  it('入れられる行は 上/中央/下、入れられない行は上下半分', () => {
    expect(dropPosition(2, 40, true)).toBe('before')
    expect(dropPosition(20, 40, true)).toBe('inside')
    expect(dropPosition(38, 40, true)).toBe('after')
    expect(dropPosition(10, 40, false)).toBe('before')
    expect(dropPosition(30, 40, false)).toBe('after')
  })
})

describe('resolveDrop', () => {
  it('inside / before / after の (親, 前の兄弟)', () => {
    const t = tree()
    expect(resolveDrop(t.page, t.dev, t.b.id, t.a.id, 'inside')).toEqual({
      parentId: t.a.id,
      beforeId: undefined,
    })
    expect(resolveDrop(t.page, t.dev, t.b.id, t.a.id, 'before')).toEqual({
      parentId: t.root.id,
      beforeId: t.a.id,
    })
    expect(resolveDrop(t.page, t.dev, t.b.id, t.a.id, 'after')).toEqual({
      parentId: t.root.id,
      beforeId: t.c.id, // b を除くと [a, c]。a の次は c
    })
  })

  it('after は自分を除いた次の兄弟の前になる', () => {
    const t = tree()
    // root: [a, b, c]。c を a の後ろへ → 自分を除くと [a, b] なので b の前
    expect(resolveDrop(t.page, t.dev, t.c.id, t.a.id, 'after')?.beforeId).toBe(t.b.id)
  })

  it('自分・子孫の中・ルートは不可', () => {
    const t = tree()
    expect(resolveDrop(t.page, t.dev, t.a.id, t.a.id, 'inside')).toBeUndefined()
    expect(resolveDrop(t.page, t.dev, t.a.id, t.a1.id, 'inside')).toBeUndefined()
    expect(resolveDrop(t.page, t.dev, t.root.id, t.a.id, 'before')).toBeUndefined()
  })

  it('子を入れられない親(list に list-item 以外)は不可', () => {
    const t = mkPage()
    const list = t.mk('list', t.root, { category: 'list' })
    const b = t.mk('b')
    expect(resolveDrop(t.page, 'pc', b.id, list.id, 'inside')).toBeUndefined()
    const item = t.mk('item', t.root, { category: 'list-item' })
    expect(resolveDrop(t.page, 'pc', item.id, list.id, 'inside')).toEqual({
      parentId: list.id,
      beforeId: undefined,
    })
  })
})
