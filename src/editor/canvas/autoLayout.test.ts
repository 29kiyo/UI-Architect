import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createNode,
  PropsSchema,
} from '@/core'
import { createAutoLayoutCommand, planAutoLayout, visualOrder } from './autoLayout'
import type { WorldRect } from './viewport'

function setup() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const root = page.nodes[page.rootNodeId]!
  root.props = PropsSchema.parse({ position: { position: 'relative' } })
  const mk = (name: string, left: string) => {
    const n = createNode({
      type: 'element',
      name,
      props: PropsSchema.parse({
        position: { position: 'absolute', left, top: '0px' },
        layout: { marginLeft: '8px' },
      }),
    })
    page.nodes[n.id] = n
    root.children.push(n.id)
    return n
  }
  const a = mk('a', '0px')
  const b = mk('b', '60px')
  const c = mk('c', '120px')
  const rects: Record<string, WorldRect> = {
    [a.id]: { x: 0, y: 0, width: 50, height: 20 },
    [b.id]: { x: 60, y: 0, width: 50, height: 20 },
    [c.id]: { x: 120, y: 0, width: 50, height: 20 },
    [root.id]: { x: 0, y: 0, width: 400, height: 300 },
  }
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const cur = () => store.getState().doc.pages[0]!
  return { page, root, a, b, c, rects, history, cur }
}

describe('visualOrder', () => {
  it('row は左から、column は上から', () => {
    const items = [
      { id: 'r', rect: { x: 100, y: 0, width: 10, height: 10 } },
      { id: 'l', rect: { x: 0, y: 50, width: 10, height: 10 } },
    ]
    expect(visualOrder(items, 'row')).toEqual(['l', 'r'])
    expect(visualOrder(items, 'column')).toEqual(['r', 'l'])
  })
})

describe('planAutoLayout / createAutoLayoutCommand', () => {
  it('横一列は flex row と推定し、視覚順に並べる', () => {
    const t = setup()
    const plan = planAutoLayout(t.page, 'pc', [t.c.id, t.a.id, t.b.id], (id) => t.rects[id])
    if (typeof plan === 'string') throw new Error('plan failed: ' + plan)
    expect(plan.est.mode).toBe('flex')
    expect(plan.est.direction).toBe('row')
    expect(plan.ids).toEqual([t.a.id, t.b.id, t.c.id])
    expect(plan.abs).toEqual({ left: 0, top: 0 })
  })

  it('1 Command で適用され、Undo 1 回で元に戻る', () => {
    const t = setup()
    const plan = planAutoLayout(t.page, 'pc', [t.a.id, t.b.id, t.c.id], (id) => t.rects[id])
    if (typeof plan === 'string') throw new Error('plan failed: ' + plan)
    const cmd = createAutoLayoutCommand(t.page.id, plan)
    t.history.execute(cmd.command)
    const gid = cmd.created[0]!
    const page = t.cur()
    expect(page.nodes[t.root.id]!.children).toEqual([gid])
    const g = page.nodes[gid]!
    expect(g.children).toEqual([t.a.id, t.b.id, t.c.id])
    expect(g.props.layout.display).toBe('flex')
    expect(g.props.position.position).toBe('absolute')
    expect(page.nodes[t.a.id]!.props.position.position).toBeUndefined()
    expect(page.nodes[t.a.id]!.props.layout.marginLeft).toBe('0px')
    t.history.undo()
    const back = t.cur()
    expect(back.nodes[t.root.id]!.children).toEqual([t.a.id, t.b.id, t.c.id])
    expect(back.nodes[t.a.id]!.props.position.position).toBe('absolute')
    expect(back.nodes[gid]).toBeUndefined()
  })

  it('親が違う / 1 つだけ / 矩形なしは ineligible', () => {
    const t = setup()
    expect(planAutoLayout(t.page, 'pc', [t.a.id], (id) => t.rects[id])).toBe('ineligible')
    expect(planAutoLayout(t.page, 'pc', [t.a.id, t.b.id], () => undefined)).toBe('ineligible')
  })
})
