import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { resolveNode, setOverrideProp } from '../device'
import { createHistory } from '../history'
import { createEmptyDocument, createNode, PropsSchema, type Node, type UIDocument } from '../model'
import { createDocumentStore } from '../store'
import { createMobileCommandFor, planMobile, planMobileAsync } from './mobile'

const mk = (
  groups: Record<string, Record<string, unknown>>,
  kids: Node[] = [],
  extra: Partial<Node> = {},
) =>
  createNode({
    type: 'element',
    props: PropsSchema.parse(groups),
    children: kids.map((k) => k.id),
    ...extra,
  })

function setup(top: Node, all: Node[]) {
  const doc = createEmptyDocument()
  const page = doc.pages[0]
  for (const n of all) page.nodes[n.id] = n
  page.nodes[page.rootNodeId].children = [top.id]
  const mobile = doc.devices.find((d) => d.kind === 'mobile')!
  return { doc, page, mobile }
}
const apply = (doc: UIDocument, pageId: string, deviceId: string) => {
  const { command, ops } = createMobileCommandFor(doc, pageId, deviceId)
  return { next: produce(doc, (d) => command.apply(d)), ops, command }
}

describe('planMobile', () => {
  it('横並び → 縦積み、子は 100% 幅、共有ノードは不変で override は対象デバイスだけ', () => {
    const kids = [1, 2, 3].map(() => mk({ size: { width: '200px' } }))
    const row = mk(
      { layout: { display: 'flex', columnGap: '24px', alignItems: 'flex-start' } },
      kids,
    )
    const { doc, page, mobile } = setup(row, [row, ...kids])
    const { next } = apply(doc, page.id, mobile.id)
    const eff = resolveNode(next.pages[0], mobile.id, row.id)!
    expect(eff.props.layout).toMatchObject({
      flexDirection: 'column',
      rowGap: '18px',
      columnGap: '0px',
      alignItems: 'stretch',
    })
    expect(resolveNode(next.pages[0], mobile.id, kids[0].id)!.props.size).toMatchObject({
      width: '100%',
      maxWidth: '100%',
    })
    expect(next.pages[0].nodes).toEqual(doc.pages[0].nodes)
    expect(Object.keys(next.pages[0].overrides)).toEqual([mobile.id])
  })

  it('大きい文字・余白の縮小と固定幅の 100% 化', () => {
    const h = mk({
      typography: { fontSize: '32px' },
      layout: { paddingTop: '24px' },
      size: { width: '600px' },
    })
    const { doc, page, mobile } = setup(h, [h])
    const { next } = apply(doc, page.id, mobile.id)
    const eff = resolveNode(next.pages[0], mobile.id, h.id)!
    expect(eff.props.typography.fontSize).toBe('24px')
    expect(eff.props.layout.paddingTop).toBe('18px')
    expect(eff.props.size.width).toBe('100%')
  })

  it('sidebar は非表示候補、横並び nav(3項目以上)はハンバーガー候補(隠さない)', () => {
    const links = [1, 2, 3].map(() => mk({}))
    const nav = mk({ layout: { display: 'flex' } }, links, { category: 'nav' })
    const side = mk({}, [], { category: 'sidebar' })
    const wrap = mk({}, [nav, side])
    const { doc, page, mobile } = setup(wrap, [wrap, nav, side, ...links])
    const { next } = apply(doc, page.id, mobile.id)
    const p = next.pages[0]
    expect(resolveNode(p, mobile.id, nav.id)!.props.custom.mobileNav).toBe('hamburger')
    const s = resolveNode(p, mobile.id, side.id)!
    expect(s.props.custom.mobileCandidate).toBe('hide')
    expect(s.hidden).toBe(false)
  })

  it('再実行しても変わらない / そのデバイスで設定済みの値は尊重する', () => {
    const kids = [1, 2].map(() => mk({}))
    const row = mk({ layout: { display: 'flex' } }, kids)
    const { doc, page, mobile } = setup(row, [row, ...kids])
    const withUser = produce(doc, (d) =>
      setOverrideProp(d.pages[0], mobile.id, row.id, 'layout', 'flexDirection', 'row'),
    )
    const ops = planMobile(withUser.pages[0], mobile.id, { deviceWidth: 390 })
    expect(ops.find((o) => o.key === 'flexDirection')).toBeUndefined()

    const { next } = apply(doc, page.id, mobile.id)
    expect(planMobile(next.pages[0], mobile.id, { deviceWidth: 390 })).toEqual([])
  })

  it('1 Command で実行でき Undo 1回で全て戻る', () => {
    const kids = [1, 2].map(() => mk({ size: { width: '300px' } }))
    const row = mk({ layout: { display: 'flex' } }, kids)
    const { doc, page, mobile } = setup(row, [row, ...kids])
    const store = createDocumentStore(doc)
    const history = createHistory(store)
    const { command, ops } = createMobileCommandFor(store.getState().doc, page.id, mobile.id)
    expect(ops.length).toBeGreaterThan(0)
    history.execute(command)
    expect(Object.keys(store.getState().doc.pages[0].overrides)).toEqual([mobile.id])
    history.undo()
    expect(store.getState().doc.pages[0].overrides).toEqual({})
  })
})

describe('planMobileAsync(AI 補助フック)', () => {
  it('不正な提案は除外し、失敗時はルール結果を使う', async () => {
    const kids = [1, 2].map(() => mk({}))
    const row = mk({ layout: { display: 'flex' } }, kids)
    const { page, mobile } = setup(row, [row, ...kids])
    const good = {
      nodeId: row.id,
      group: 'layout' as const,
      key: 'gap',
      value: '8px',
      reason: 'ai',
    }
    const bad = { nodeId: 'nope', group: 'layout' as const, key: 'gap', value: '8px', reason: 'ai' }
    const r = await planMobileAsync(page, mobile.id, {
      deviceWidth: 390,
      hook: { id: 't', refine: async () => [good, bad] },
    })
    expect(r.ops).toEqual([good])
    expect(r.warnings.length).toBe(1)
    const f = await planMobileAsync(page, mobile.id, {
      deviceWidth: 390,
      hook: {
        id: 'x',
        refine: async () => {
          throw new Error('x')
        },
      },
    })
    expect(f.ops.length).toBeGreaterThan(0)
    expect(f.warnings.length).toBe(1)
  })
})
