import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { createDevice, createEmptyDocument } from '../model'
import { createDocumentStore } from '../store'
import { createUpdateDeviceCommand, deviceSize } from './size'

describe('deviceSize', () => {
  it('既定のデバイスは見た目が変わらない', () => {
    expect(deviceSize(createDevice('pc'))).toEqual({ width: 1280, height: 800 })
    expect(deviceSize(createDevice('mobile'))).toEqual({ width: 390, height: 844 })
  })
  it('回転すると幅と高さが入れ替わる(元の値は保持)', () => {
    const m = { ...createDevice('mobile'), orientation: 'landscape' as const }
    expect(deviceSize(m)).toEqual({ width: 844, height: 390 })
    expect(m.width).toBe(390)
    const p = { ...createDevice('pc'), orientation: 'portrait' as const }
    expect(deviceSize(p)).toEqual({ width: 800, height: 1280 })
  })
})

describe('createUpdateDeviceCommand', () => {
  it('orientation と safeArea を変更でき、Undo で戻る', () => {
    const doc = createEmptyDocument('t')
    const store = createDocumentStore(doc)
    const history = createHistory(store)
    const mobile = doc.devices[1]!
    history.execute(createUpdateDeviceCommand(mobile.id, { orientation: 'landscape' }, 'rotate'))
    history.execute(
      createUpdateDeviceCommand(mobile.id, {
        safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
      }),
    )
    const cur = () => store.getState().doc.devices[1]!
    expect(cur().orientation).toBe('landscape')
    expect(cur().safeArea.top).toBe(47)
    history.undo()
    history.undo()
    expect(cur().orientation).toBe('portrait')
    expect(cur().safeArea.top).toBe(0)
  })
  it('存在しないデバイスは throw', () => {
    const store = createDocumentStore(createEmptyDocument('t'))
    expect(() =>
      createHistory(store).execute(createUpdateDeviceCommand('nope', { orientation: 'landscape' })),
    ).toThrow()
  })
})
