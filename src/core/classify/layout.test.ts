import { describe, expect, it } from 'vitest'
import { createNode, PropsSchema, type Node } from '../model'
import { arrangeNodes } from './arrange'
import { mergeClassification, type ClassifyHook } from './hook'
import { arrangeLayout, estimateLayout, fixOverflow, revertLayout } from './layout'

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
const mk = (
  custom: Record<string, unknown>,
  groups: Record<string, Record<string, unknown>> = {},
  kids: Node[] = [],
) =>
  createNode({
    type: 'element',
    props: PropsSchema.parse({ ...groups, custom }),
    children: kids.map((k) => k.id),
  })

describe('estimateLayout', () => {
  it('横並び → flex row(gap・padding・align)', () => {
    const e = estimateLayout(rect(0, 0, 300, 50), [rect(10, 10, 100, 30), rect(126, 10, 100, 30)])
    expect(e).toMatchObject({ mode: 'flex', direction: 'row', gap: 16, alignItems: 'stretch' })
    expect(e.padding).toEqual({ top: 10, right: 74, bottom: 10, left: 10 })
  })
  it('縦積みで幅いっぱい → flex column stretch', () => {
    const e = estimateLayout(rect(0, 0, 200, 100), [rect(0, 0, 200, 40), rect(0, 50, 200, 50)])
    expect(e).toMatchObject({ mode: 'flex', direction: 'column', gap: 10, alignItems: 'stretch' })
  })
  it('両端揃えの2要素 → space-between', () => {
    const e = estimateLayout(rect(0, 0, 280, 48), [rect(12, 12, 30, 24), rect(224, 12, 44, 24)])
    expect(e).toMatchObject({
      mode: 'flex',
      direction: 'row',
      justifyContent: 'space-between',
      gap: 0,
    })
  })
  it('2×2 → grid', () => {
    const e = estimateLayout(rect(0, 0, 220, 120), [
      rect(0, 0, 100, 50),
      rect(120, 0, 100, 50),
      rect(0, 70, 100, 50),
      rect(120, 70, 100, 50),
    ])
    expect(e).toMatchObject({ mode: 'grid', columns: 2, columnGap: 20, rowGap: 20 })
  })
  it('重なり → absolute', () => {
    const e = estimateLayout(rect(0, 0, 100, 100), [rect(0, 0, 60, 60), rect(30, 30, 60, 60)])
    expect(e).toMatchObject({ mode: 'absolute', reason: 'overlap' })
  })
  it('子が1つ以下は none', () => {
    expect(estimateLayout(rect(0, 0, 10, 10), [rect(0, 0, 5, 5)]).mode).toBe('none')
  })
})

describe('arrangeLayout / revertLayout', () => {
  const build = (parentLayout: Record<string, unknown>, childPos: Record<string, unknown> = {}) => {
    const a = mk(
      { tag: 'span', sourceRect: rect(10, 10, 100, 30) },
      { layout: { display: 'inline', marginRight: '6px' } },
    )
    const b = mk(
      { tag: 'span', sourceRect: rect(116, 10, 100, 30) },
      { layout: { display: 'inline' }, position: childPos },
    )
    const p = mk({ tag: 'div', sourceRect: rect(0, 0, 300, 50) }, { layout: parentLayout }, [a, b])
    const root = mk({}, {}, [p])
    return [root, p, a, b]
  }
  it('block の親を flex に変換し、margin を 0 にし、元に戻せる', () => {
    const nodes = build({ display: 'block' })
    const r = arrangeLayout(nodes)
    expect(r.nodes[1].props.layout).toMatchObject({
      display: 'flex',
      flexDirection: 'row',
      columnGap: '6px',
    })
    expect(r.nodes[2].props.layout.marginRight).toBe('0px')
    expect(nodes[1].props.layout.display).toBe('block')
    const back = revertLayout(r.nodes)
    expect(back[1].props.layout).toEqual(nodes[1].props.layout)
    expect(back[2].props.layout).toEqual(nodes[2].props.layout)
    expect(back[1].props.custom.layoutOriginal).toBeUndefined()
  })
  it('既に flex の親は推定だけ記録して変更しない', () => {
    const r = arrangeLayout(build({ display: 'flex' }))
    expect(r.nodes[1].props.layout.display).toBe('flex')
    expect(r.nodes[1].props.custom.layoutEstimate).toBeDefined()
    expect(r.nodes[1].props.custom.layoutOriginal).toBeUndefined()
  })
  it('絶対配置の子がいる親は対象外', () => {
    const r = arrangeLayout(build({ display: 'block' }, { position: 'absolute' }))
    expect(r.estimated).toBe(0)
  })
  it('重なりは absolute 化し警告を出す', () => {
    const a = mk({ sourceRect: rect(0, 0, 60, 60) })
    const b = mk({ sourceRect: rect(30, 30, 60, 60) })
    const p = mk({ sourceRect: rect(0, 0, 100, 100) }, { layout: { display: 'block' } }, [a, b])
    const r = arrangeLayout([mk({}, {}, [p]), p, a, b])
    expect(r.nodes[1].props.position.position).toBe('relative')
    expect(r.nodes[3].props.position).toMatchObject({
      position: 'absolute',
      left: '30px',
      top: '30px',
    })
    expect(r.warnings.length).toBe(1)
  })
})

describe('fixOverflow', () => {
  it('デバイス幅を超えるルート直下に maxWidth を足す', () => {
    const wide = mk({ sourceRect: rect(0, 0, 500, 40) })
    const r = fixOverflow([mk({}, {}, [wide]), wide], 390)
    expect(r.nodes[1].props.size.maxWidth).toBe('100%')
    expect(r.warnings.length).toBe(1)
  })
})

describe('AI フック', () => {
  const rule = {
    category: 'container',
    confidence: 0.4,
    needsReview: true,
    ruleId: 'fallback:container',
  }
  it('統合方針', () => {
    expect(mergeClassification(rule, { category: 'card', confidence: 0.9 })).toMatchObject({
      category: 'card',
      source: 'ai',
    })
    expect(mergeClassification(rule, { category: 'nope', confidence: 0.9 }).source).toBe('rule')
    expect(
      mergeClassification(
        { ...rule, category: 'button', confidence: 0.95, needsReview: false },
        { category: 'link', confidence: 0.99 },
      ).category,
    ).toBe('button')
    expect(mergeClassification(rule, { category: 'container', confidence: 0.8 })).toMatchObject({
      needsReview: false,
      source: 'both',
    })
  })
  it('要確認のノードにだけ呼ばれ、失敗はルール結果のまま', async () => {
    const leaf = mk({ tag: 'div' })
    const btn = mk({ tag: 'button' }, { content: { text: 'OK' } })
    const nodes = [mk({}, {}, [leaf, btn]), leaf, btn]
    const called: string[] = []
    const hook: ClassifyHook = {
      id: 't',
      classify: async (n) => {
        called.push(n.id)
        return { category: 'card', confidence: 0.9 }
      },
    }
    const r = await arrangeNodes(nodes, { hook, layout: false })
    expect(called).toEqual([leaf.id])
    expect(r.nodes[1].category).toBe('card')
    expect(r.nodes[2].category).toBe('button')
    const bad: ClassifyHook = {
      id: 'b',
      classify: async () => {
        throw new Error('x')
      },
    }
    const r2 = await arrangeNodes(nodes, { hook: bad, layout: false })
    expect(r2.nodes[1].category).toBe('container')
    expect(r2.warnings.some((w) => w.includes('失敗'))).toBe(true)
  })
})
