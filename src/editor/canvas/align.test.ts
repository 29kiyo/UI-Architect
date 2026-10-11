import { describe, expect, it } from 'vitest'
import { createNode, createPage, PropsSchema, type Node } from '@/core'
import { alignDeltas, alignEligible, distributeDeltas, type Delta, type Item } from './align'

const items: Item[] = [
  { id: 'a', rect: { x: 0, y: 0, width: 50, height: 20 } },
  { id: 'b', rect: { x: 100, y: 30, width: 20, height: 40 } },
  { id: 'c', rect: { x: 60, y: 10, width: 30, height: 10 } },
]
const by = (d: Delta[], id: string) => d.find((x) => x.id === id)!

describe('alignDeltas(外接矩形 x 0..120, y 0..70)', () => {
  it('左 / 右 / 左右中央', () => {
    expect(by(alignDeltas(items, 'left'), 'b').dx).toBe(-100)
    expect(by(alignDeltas(items, 'right'), 'a').dx).toBe(70)
    expect(by(alignDeltas(items, 'hcenter'), 'a').dx).toBe(35) // 中心 60 に対し a の中心 25
    expect(by(alignDeltas(items, 'left'), 'a').dy).toBe(0)
  })
  it('上 / 下 / 上下中央', () => {
    expect(by(alignDeltas(items, 'top'), 'b').dy).toBe(-30)
    expect(by(alignDeltas(items, 'bottom'), 'a').dy).toBe(50)
    expect(by(alignDeltas(items, 'vcenter'), 'b').dy).toBe(-15) // 中心 35 に対し b の中心 50
  })
  it('空なら何も返さない', () => {
    expect(alignDeltas([], 'left')).toEqual([])
  })
})

describe('distributeDeltas', () => {
  it('両端を固定し、間隔を等しくする', () => {
    const d = distributeDeltas(items, 'x')
    // 幅合計 100、全体 0..120 → 間隔 10。a:0-50, c:60-90, b:100-120
    expect(by(d, 'a').dx).toBe(0)
    expect(by(d, 'c').dx).toBe(0)
    expect(by(d, 'b').dx).toBe(0)
    const loose: Item[] = [
      { id: 'a', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'b', rect: { x: 20, y: 0, width: 10, height: 10 } },
      { id: 'c', rect: { x: 100, y: 0, width: 10, height: 10 } },
    ]
    const d2 = distributeDeltas(loose, 'x')
    expect(by(d2, 'b').dx).toBe(30) // 間隔 (110-30)/2=40 → b は x=50
    expect(by(d2, 'a').dx).toBe(0)
    expect(by(d2, 'c').dx).toBe(0)
  })
  it('縦方向 / 3 未満は何もしない', () => {
    const col: Item[] = [
      { id: 'a', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'b', rect: { x: 0, y: 12, width: 10, height: 10 } },
      { id: 'c', rect: { x: 0, y: 50, width: 10, height: 10 } },
    ]
    expect(by(distributeDeltas(col, 'y'), 'b').dy).toBe(13) // 間隔 (60-30)/2=15 → y=25
    expect(distributeDeltas(col.slice(0, 2), 'y')).toEqual([])
  })
})

describe('alignEligible', () => {
  function mk() {
    const page = createPage()
    const root = page.nodes[page.rootNodeId]!
    const add = (position?: string, locked = false): Node => {
      const n = createNode({
        type: 'element',
        locked,
        props: PropsSchema.parse(position ? { position: { position } } : {}),
      })
      page.nodes[n.id] = n
      root.children.push(n.id)
      return n
    }
    return { page, root, add }
  }
  it('absolute / relative のみ可。static・ロック・1 つだけは不可', () => {
    const t = mk()
    const a = t.add('absolute')
    const b = t.add('relative')
    const s = t.add()
    const l = t.add('absolute', true)
    expect(alignEligible(t.page, 'pc', [a.id, b.id])).toBe(true)
    expect(alignEligible(t.page, 'pc', [a.id, s.id])).toBe(false)
    expect(alignEligible(t.page, 'pc', [a.id, l.id])).toBe(false)
    expect(alignEligible(t.page, 'pc', [a.id])).toBe(false)
  })
  it('flex 親の子は static でも不可(並び替え扱い)', () => {
    const t = mk()
    t.root.props.layout = { display: 'flex' }
    const a = t.add()
    const b = t.add()
    expect(alignEligible(t.page, 'pc', [a.id, b.id])).toBe(false)
  })
})
