import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory, createNode } from '@/core'
import { createPropsCommand } from '../canvas/commands'
import {
  canResetProp,
  createAttachCommand,
  createDetachCommand,
  createResetPropCommand,
  overrideState,
} from './overrideCommands'

function setup() {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const root = page.nodes[page.rootNodeId]!
  const a = createNode({ type: 'element', name: 'a' })
  page.nodes[a.id] = a
  root.children = [a.id]
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const pc = doc.devices[0]!.id
  const mobile = doc.devices[1]!.id
  const cur = () => store.getState().doc.pages[0]!
  const target = (deviceId: string) => ({ pageId: page.id, deviceId, nodeId: a.id })
  const write = (deviceId: string, base: boolean, value: string) =>
    history.execute(
      createPropsCommand({
        name: 'w',
        pageId: page.id,
        deviceId,
        base,
        writes: [{ nodeId: a.id, group: 'size', key: 'width', value }],
      }),
    )
  return { history, cur, pc, mobile, aId: a.id, target, write }
}

describe('overrideState', () => {
  it('is shared without override and overridden after a device write', () => {
    const t = setup()
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'width')).toBe('shared')
    t.write(t.mobile, false, '100%')
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'width')).toBe('overridden')
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'height')).toBe('shared')
    expect(overrideState(t.cur(), t.pc, t.aId, 'size', 'width')).toBe('shared')
  })
})

describe('reset', () => {
  it('removes the device override and the shared value is untouched', () => {
    const t = setup()
    t.write(t.pc, true, '300px')
    t.write(t.mobile, false, '100%')
    t.history.execute(createResetPropCommand(t.target(t.mobile), 'size', 'width'))
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'width')).toBe('shared')
    expect(t.cur().nodes[t.aId]!.props.size.width).toBe('300px')
    t.history.undo()
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'width')).toBe('overridden')
  })
})

describe('detach / attach', () => {
  it('detach marks every key overridden and blocks reset; attach restores', () => {
    const t = setup()
    t.write(t.pc, true, '300px')
    t.history.execute(createDetachCommand(t.target(t.mobile)))
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'width')).toBe('overridden')
    expect(canResetProp(t.cur(), t.mobile, t.aId)).toBe(false)
    t.history.execute(createAttachCommand(t.target(t.mobile)))
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'width')).toBe('shared')
    expect(canResetProp(t.cur(), t.mobile, t.aId)).toBe(true)
    t.history.undo()
    expect(overrideState(t.cur(), t.mobile, t.aId, 'size', 'width')).toBe('overridden')
  })
})
