import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createNode,
  PropsSchema,
  type ImportResult,
} from '@/core'
import { createImportCommand } from './commit'

const mk = (groups: Record<string, Record<string, unknown>>, kids: string[] = []) =>
  createNode({ type: 'element', props: PropsSchema.parse(groups), children: kids })

describe('取り込み時のスマホ overrides 同時生成', () => {
  it('取り込んだノードだけに生成し、共有ノードは不変、Undo 1 回で全て戻る', () => {
    const doc = createEmptyDocument()
    const page = doc.pages[0]
    const mobile = doc.devices.find((d) => d.kind === 'mobile')!
    const pc = doc.devices.find((d) => d.kind === 'pc')!

    // 既存の横並びノード(スマホ化の対象外であること)
    const ek = [mk({}), mk({})]
    const existing = mk(
      { layout: { display: 'flex' } },
      ek.map((k) => k.id),
    )
    for (const n of [existing, ...ek]) page.nodes[n.id] = n
    page.nodes[page.rootNodeId].children.push(existing.id)

    const k = [mk({ size: { width: '300px' } }), mk({ size: { width: '300px' } })]
    const row = mk(
      { layout: { display: 'flex' } },
      k.map((x) => x.id),
    )
    const wrap = mk({}, [row.id])
    const result: ImportResult = { nodes: [wrap, row, ...k], assets: [], tokens: {}, warnings: [] }

    const store = createDocumentStore(doc)
    const history = createHistory(store)
    history.execute(createImportCommand(result, { deviceId: pc.id, mobileDeviceId: mobile.id }))

    const p = store.getState().doc.pages[0]
    const byNode = p.overrides[mobile.id]
    expect(byNode[row.id].propsDiff.layout?.flexDirection).toBe('column')
    expect(byNode[k[0].id].propsDiff.size?.width).toBe('100%')
    expect(byNode[existing.id]).toBeUndefined()
    expect(p.overrides[pc.id]).toBeUndefined()
    expect(p.nodes[row.id].props.layout.flexDirection).toBeUndefined()

    history.undo()
    const after = store.getState().doc.pages[0]
    expect(after.overrides).toEqual({})
    expect(after.nodes[row.id]).toBeUndefined()
  })

  it('未知のデバイスは拒否する', () => {
    const doc = createEmptyDocument()
    const n = mk({})
    const store = createDocumentStore(doc)
    const history = createHistory(store)
    const cmd = createImportCommand(
      { nodes: [n], assets: [], tokens: {}, warnings: [] },
      { mobileDeviceId: 'nope' },
    )
    expect(() => history.execute(cmd)).toThrow()
  })
})
