import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, createNode } from '@/core'
import { createPropsCommand } from '../canvas/commands'
import { applicableNodes, resolveSelected, shownValue, writesFor } from './multi'
import { createResetPropCommand } from './overrideCommands'
import type { PropDef } from './registry'

const def = (o: Partial<PropDef> = {}): PropDef => ({
  key: 'width',
  group: 'size',
  label: { ja: '', en: '' },
  type: 'length',
  deviceOverridable: true,
  ...o,
})

function setup() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const root = page.nodes[page.rootNodeId]!
  const a = createNode({ type: 'element', name: 'a' })
  const b = createNode({ type: 'image', name: 'b', category: 'image' })
  for (const n of [a, b]) page.nodes[n.id] = n
  root.children = [a.id, b.id]
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const cur = () => store.getState().doc.pages[0]!
  return { history, cur, pageId: page.id, a, b, pc: doc.devices[0]!.id, mobile: doc.devices[1]!.id }
}

describe('shownValue', () => {
  it('returns the value when all nodes agree', () => {
    const t = setup()
    t.a.props.size.width = '10px'
    t.b.props.size.width = '10px'
    expect(shownValue([t.a, t.b], def())).toEqual({ mixed: false, value: '10px' })
  })
  it('is mixed when values differ (including missing vs set)', () => {
    const t = setup()
    t.a.props.size.width = '10px'
    expect(shownValue([t.a, t.b], def())).toEqual({ mixed: true, value: undefined })
  })
  it('is not mixed when all are missing', () => {
    const t = setup()
    expect(shownValue([t.a, t.b], def()).mixed).toBe(false)
  })
  it('ignores nodes the def does not apply to', () => {
    const t = setup()
    t.b.props.content.src = 'x'
    const d = def({ key: 'src', group: 'content', appliesTo: ['image'] })
    expect(shownValue([t.a, t.b], d)).toEqual({ mixed: false, value: 'x' })
  })
})

describe('writesFor / resolveSelected', () => {
  it('skips nodes the def does not apply to', () => {
    const t = setup()
    const d = def({ key: 'src', group: 'content', appliesTo: ['image'] })
    expect(applicableNodes([t.a, t.b], d)).toEqual([t.b])
    expect(writesFor([t.a, t.b], d, 'u').map((w) => w.nodeId)).toEqual([t.b.id])
  })
  it('skips ids that no longer exist', () => {
    const t = setup()
    const page = t.cur()
    expect(resolveSelected(page, t.pc, [t.a.id, 'nope', t.b.id]).map((n) => n.id)).toEqual([
      t.a.id,
      t.b.id,
    ])
  })
})

describe('history grouping', () => {
  it('one command writes every selected node and undoes at once', () => {
    const t = setup()
    t.history.execute(
      createPropsCommand({
        name: 'multi',
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        writes: writesFor([t.a, t.b], def(), '5px'),
      }),
    )
    expect(t.history.getState().undoCount).toBe(1)
    expect(t.cur().nodes[t.a.id]!.props.size.width).toBe('5px')
    expect(t.cur().nodes[t.b.id]!.props.size.width).toBe('5px')
    t.history.undo()
    expect(t.cur().nodes[t.a.id]!.props.size.width).toBeUndefined()
    expect(t.cur().nodes[t.b.id]!.props.size.width).toBeUndefined()
  })

  it('resets several nodes inside one transaction', () => {
    const t = setup()
    t.history.execute(
      createPropsCommand({
        name: 'w',
        pageId: t.pageId,
        deviceId: t.mobile,
        base: false,
        writes: writesFor([t.a, t.b], def(), '100%'),
      }),
    )
    const before = t.history.getState().undoCount
    t.history.transaction('reset override', () => {
      for (const id of [t.a.id, t.b.id]) {
        t.history.execute(
          createResetPropCommand(
            { pageId: t.pageId, deviceId: t.mobile, nodeId: id },
            'size',
            'width',
          ),
        )
      }
    })
    expect(t.history.getState().undoCount).toBe(before + 1)
    expect(t.cur().overrides).toEqual({})
    t.history.undo()
    expect(t.cur().overrides[t.mobile]?.[t.a.id]?.propsDiff.size?.width).toBe('100%')
    expect(t.cur().overrides[t.mobile]?.[t.b.id]?.propsDiff.size?.width).toBe('100%')
  })
})
