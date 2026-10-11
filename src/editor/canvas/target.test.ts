import { describe, expect, it } from 'vitest'
import { createNode } from '@/core'
import type { Page } from '@/core'
import type { Artboard } from './artboard'
import {
  artboardForMarquee,
  marqueeTargets,
  normalizeRect,
  pathBelowRoot,
  resolveTarget,
} from './target'

function build() {
  const a1 = createNode({ type: 'element', name: 'a1' })
  const a = createNode({ type: 'element', name: 'a', children: [a1.id] })
  const b = createNode({ type: 'element', name: 'b' })
  const c = createNode({ type: 'element', name: 'c', locked: true })
  const root = createNode({ type: 'element', name: 'root', children: [a.id, b.id, c.id] })
  const page: Page = {
    id: 'p',
    name: 'p',
    route: '/',
    rootNodeId: root.id,
    nodes: Object.fromEntries([root, a, a1, b, c].map((n) => [n.id, n])),
    overrides: {},
  }
  return { page, root, a, a1, b, c }
}

describe('resolveTarget', () => {
  it('pathBelowRoot はルートを含まない', () => {
    const { page, root, a, a1 } = build()
    expect(pathBelowRoot(page, a1.id)).toEqual([a.id, a1.id])
    expect(pathBelowRoot(page, root.id)).toEqual([])
    expect(pathBelowRoot(page, 'missing')).toEqual([])
  })

  it('click: 選択が無ければ最上位の祖先を選ぶ', () => {
    const { page, a, a1 } = build()
    expect(resolveTarget(page, a1.id, [], 'click')).toBe(a.id)
  })

  it('click: ルート(空白)は undefined', () => {
    const { page, root } = build()
    expect(resolveTarget(page, root.id, [], 'click')).toBeUndefined()
  })

  it('click: 選択中ノードの内側では選択を維持する', () => {
    const { page, a, a1 } = build()
    expect(resolveTarget(page, a1.id, [a.id], 'click')).toBe(a.id)
    expect(resolveTarget(page, a1.id, [a1.id], 'click')).toBe(a1.id)
  })

  it('click: 別の枝の選択は影響しない', () => {
    const { page, a, a1, b } = build()
    expect(resolveTarget(page, a1.id, [b.id], 'click')).toBe(a.id)
  })

  it('dive: 選択中の 1 つ下へ潜る。最深ならそのまま', () => {
    const { page, a, a1 } = build()
    expect(resolveTarget(page, a1.id, [], 'dive')).toBe(a.id)
    expect(resolveTarget(page, a1.id, [a.id], 'dive')).toBe(a1.id)
    expect(resolveTarget(page, a1.id, [a1.id], 'dive')).toBe(a1.id)
  })

  it('ロックされたノードは選べない', () => {
    const { page, c } = build()
    expect(resolveTarget(page, c.id, [], 'click')).toBeUndefined()
  })
})

describe('marquee', () => {
  it('normalizeRect は向きに依存しない', () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 0, y: 30 })).toEqual({
      x: 0,
      y: 10,
      width: 10,
      height: 20,
    })
  })

  it('ルート直下のうち交差するものだけ(locked 除外)', () => {
    const { page, a, b, c } = build()
    const rects = new Map([
      [a.id, { x: 0, y: 0, width: 100, height: 100 }],
      [b.id, { x: 200, y: 0, width: 100, height: 100 }],
      [c.id, { x: 0, y: 200, width: 100, height: 100 }],
    ])
    expect(marqueeTargets(page, rects, { x: 50, y: 50, width: 100, height: 100 })).toEqual([a.id])
    expect(marqueeTargets(page, rects, { x: -10, y: -10, width: 400, height: 400 })).toEqual([
      a.id,
      b.id,
    ])
  })

  it('開始点を含むアートボードを選び、無ければ交差するものを選ぶ', () => {
    const abs: Artboard[] = [
      { deviceId: 'd1', name: 'A', rect: { x: 0, y: 0, width: 100, height: 100 } },
      { deviceId: 'd2', name: 'B', rect: { x: 200, y: 0, width: 100, height: 100 } },
    ]
    const m = { x: 150, y: 10, width: 100, height: 50 }
    expect(artboardForMarquee(abs, { x: 250, y: 10 }, m)?.deviceId).toBe('d2')
    expect(artboardForMarquee(abs, { x: 150, y: 10 }, m)?.deviceId).toBe('d2')
    expect(
      artboardForMarquee(abs, { x: 500, y: 500 }, { x: 500, y: 500, width: 5, height: 5 }),
    ).toBeUndefined()
  })
})
