import { describe, expect, it } from 'vitest'
import { createNode, createPage, PageSchema, type Id, type Node } from '../model'
import {
  copySubtrees,
  deleteNodes,
  duplicateNodes,
  groupNodes,
  pasteClipboard,
  topLevelIds,
  ungroupNode,
  zMove,
} from './structure'

function setup() {
  const page = createPage()
  const root = page.nodes[page.rootNodeId]!
  const mk = (name: string, parent: Node = root): Node => {
    const n = createNode({ type: 'element', name })
    page.nodes[n.id] = n
    parent.children.push(n.id)
    return n
  }
  let seq = 0
  const gen = () => `new-${++seq}`
  const valid = () => PageSchema.safeParse(page).success
  return { page, root, mk, gen, valid }
}

describe('duplicate / copy / paste', () => {
  it('duplicateNodes: 直後に子孫ごと複製し、ID は全部新しい', () => {
    const t = setup()
    const a = t.mk('a')
    const a1 = t.mk('a1', a)
    const b = t.mk('b')
    const [copy] = duplicateNodes(t.page, [a.id], t.gen)
    expect(t.root.children).toEqual([a.id, copy, b.id])
    const c = t.page.nodes[copy!]!
    expect(c.name).toBe('a')
    expect(c.children).toHaveLength(1)
    expect(c.children[0]).not.toBe(a1.id)
    expect(a.children).toEqual([a1.id])
    expect(t.valid()).toBe(true)
  })

  it('入れ子の選択は 1 回だけ複製する', () => {
    const t = setup()
    const a = t.mk('a')
    const a1 = t.mk('a1', a)
    expect(topLevelIds(t.page, [a1.id, a.id])).toEqual([a.id])
    expect(duplicateNodes(t.page, [a.id, a1.id], t.gen)).toHaveLength(1)
  })

  it('paste: override・showHide 参照・親の order を振り直す', () => {
    const t = setup()
    const a = t.mk('a')
    const a1 = t.mk('a1', a)
    const b = t.mk('b')
    a1.events = [{ id: 'e1', trigger: 'click', actions: [{ type: 'showHide', nodeId: a.id }] }]
    t.page.overrides.m = { [a.id]: { propsDiff: { size: { width: '10px' } }, detached: false } }
    const clip = copySubtrees(t.page, [a.id])
    const [root2] = pasteClipboard(t.page, clip, b.id, 0, t.gen)
    expect(b.children[0]).toBe(root2)
    expect(t.page.overrides.m?.[root2!]?.propsDiff.size?.width).toBe('10px')
    const kid = t.page.nodes[t.page.nodes[root2!]!.children[0]!]!
    const act = kid.events[0]!.actions[0]!
    expect(act.type === 'showHide' && act.nodeId).toBe(root2)
    expect(t.valid()).toBe(true)
  })

  it('duplicate は order override の元の直後に入れる', () => {
    const t = setup()
    const a = t.mk('a')
    const b = t.mk('b')
    t.page.overrides.m = {
      [t.root.id]: { propsDiff: {}, detached: false, order: [b.id, a.id] },
    }
    const [c] = duplicateNodes(t.page, [a.id], t.gen)
    expect(t.page.overrides.m?.[t.root.id]?.order).toEqual([b.id, a.id, c])
  })
})

describe('delete', () => {
  it('子孫ごと消し、ルートと入れ子の重複は無視する', () => {
    const t = setup()
    const a = t.mk('a')
    const a1 = t.mk('a1', a)
    const removed = deleteNodes(t.page, [a.id, a1.id, t.root.id])
    expect(removed.sort()).toEqual([a.id, a1.id].sort())
    expect(t.root.children).toEqual([])
    expect(t.valid()).toBe(true)
  })
})

describe('group / ungroup', () => {
  it('グループ化: 先頭の位置に置き、子は兄弟順、order override も追従', () => {
    const t = setup()
    const a = t.mk('a')
    const b = t.mk('b')
    const c = t.mk('c')
    t.page.overrides.m = {
      [t.root.id]: { propsDiff: {}, detached: false, order: [c.id, b.id, a.id] },
    }
    const g = groupNodes(t.page, [c.id, a.id], t.gen)
    expect(t.root.children).toEqual([g, b.id])
    expect(t.page.nodes[g]!.children).toEqual([a.id, c.id])
    expect(t.page.overrides.m?.[t.root.id]?.order).toEqual([g, b.id])
    expect(t.valid()).toBe(true)
  })

  it('親が違うノードはグループ化できない', () => {
    const t = setup()
    const a = t.mk('a')
    const a1 = t.mk('a1', a)
    const b = t.mk('b')
    expect(() => groupNodes(t.page, [a1.id, b.id])).toThrow()
  })

  it('解除: 子が元の位置に戻り、グループは消える', () => {
    const t = setup()
    const a = t.mk('a')
    const b = t.mk('b')
    const g = groupNodes(t.page, [a.id, b.id], t.gen)
    ungroupNode(t.page, g)
    expect(t.root.children).toEqual([a.id, b.id])
    expect(t.page.nodes[g]).toBeUndefined()
    expect(t.valid()).toBe(true)
    expect(() => ungroupNode(t.page, t.root.id)).toThrow()
  })
})

describe('zMove', () => {
  const o: Id[] = ['a', 'b', 'c', 'd']
  it('最前面 / 最背面', () => {
    expect(zMove(o, ['b'], 'front')).toEqual(['a', 'c', 'd', 'b'])
    expect(zMove(o, ['c'], 'back')).toEqual(['c', 'a', 'b', 'd'])
  })
  it('1 つ前面 / 背面(複数選択はブロックで動く)', () => {
    expect(zMove(o, ['b'], 'forward')).toEqual(['a', 'c', 'b', 'd'])
    expect(zMove(o, ['b', 'c'], 'forward')).toEqual(['a', 'd', 'b', 'c'])
    expect(zMove(o, ['c'], 'backward')).toEqual(['a', 'c', 'b', 'd'])
  })
  it('端では変わらず、未知の ID は無視', () => {
    expect(zMove(o, ['d'], 'forward')).toEqual(o)
    expect(zMove(o, ['a'], 'backward')).toEqual(o)
    expect(zMove(o, ['zzz'], 'front')).toEqual(o)
  })
})
