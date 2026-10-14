import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createNode,
  resolveNode,
} from '@/core'
import { createPropsCommand } from '../canvas/commands'
import { createStateStyleCommand, stateStyleOf } from './stateStyle'

function setup() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const root = page.nodes[page.rootNodeId]!
  const a = createNode({ type: 'element', name: 'a' })
  const b = createNode({ type: 'element', name: 'b' })
  a.props.states.hover = { color: 'red' }
  for (const n of [a, b]) page.nodes[n.id] = n
  root.children = [a.id, b.id]
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const cur = () => store.getState().doc.pages[0]!
  const run = (
    deviceId: string,
    base: boolean,
    writes: { nodeId: string; key: string; value: string | undefined }[],
  ) =>
    history.execute(
      createStateStyleCommand({ pageId: page.id, deviceId, base, state: 'hover', writes }),
    )
  return {
    history,
    cur,
    run,
    a: a.id,
    b: b.id,
    pc: doc.devices[0]!.id,
    mobile: doc.devices[1]!.id,
    pageId: page.id,
  }
}

describe('createStateStyleCommand', () => {
  it('base device writes the shared state object, keeps other keys, and undoes', () => {
    const t = setup()
    t.run(t.pc, true, [{ nodeId: t.a, key: 'backgroundColor', value: '#00f' }])
    expect(t.cur().nodes[t.a]!.props.states.hover).toEqual({
      color: 'red',
      backgroundColor: '#00f',
    })
    expect(t.cur().overrides).toEqual({})
    t.history.undo()
    expect(t.cur().nodes[t.a]!.props.states.hover).toEqual({ color: 'red' })
  })

  it('other devices write an override and keep the shared keys they do not touch', () => {
    const t = setup()
    t.run(t.mobile, false, [{ nodeId: t.a, key: 'backgroundColor', value: '#0f0' }])
    expect(t.cur().nodes[t.a]!.props.states.hover).toEqual({ color: 'red' })
    const eff = resolveNode(t.cur(), t.mobile, t.a)!
    expect(stateStyleOf(eff, 'hover')).toEqual({ color: 'red', backgroundColor: '#0f0' })
    expect(stateStyleOf(resolveNode(t.cur(), t.pc, t.a)!, 'hover')).toEqual({ color: 'red' })
  })

  it('base device writes to the override when that state is already overridden', () => {
    const t = setup()
    t.run(t.pc, false, [{ nodeId: t.a, key: 'color', value: 'blue' }])
    t.run(t.pc, true, [{ nodeId: t.a, key: 'color', value: 'green' }])
    expect(t.cur().nodes[t.a]!.props.states.hover).toEqual({ color: 'red' })
    expect(stateStyleOf(resolveNode(t.cur(), t.pc, t.a)!, 'hover')).toEqual({ color: 'green' })
  })

  it('undefined deletes a key; an empty shared state is removed', () => {
    const t = setup()
    t.run(t.pc, true, [{ nodeId: t.a, key: 'color', value: undefined }])
    expect(t.cur().nodes[t.a]!.props.states.hover).toBeUndefined()
  })

  it('writes several nodes in one history entry', () => {
    const t = setup()
    t.run(t.pc, true, [
      { nodeId: t.a, key: 'opacity', value: '0.5' },
      { nodeId: t.b, key: 'opacity', value: '0.5' },
    ])
    expect(t.history.getState().undoCount).toBe(1)
    expect(t.cur().nodes[t.b]!.props.states.hover).toEqual({ opacity: '0.5' })
    t.history.undo()
    expect(t.cur().nodes[t.b]!.props.states.hover).toBeUndefined()
  })

  it('does not disturb normal props', () => {
    const t = setup()
    t.history.execute(
      createPropsCommand({
        name: 'w',
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        writes: [{ nodeId: t.a, group: 'size', key: 'width', value: '1px' }],
      }),
    )
    t.run(t.pc, true, [{ nodeId: t.a, key: 'color', value: 'blue' }])
    expect(t.cur().nodes[t.a]!.props.size.width).toBe('1px')
  })
})
