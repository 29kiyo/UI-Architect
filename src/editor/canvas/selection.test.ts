import { describe, expect, it } from 'vitest'
import { createSelectionStore } from './selection'

describe('selection store', () => {
  it('pick は置き換え、additive は同一デバイス内でトグル', () => {
    const st = createSelectionStore()
    st.getState().pick('a', 'd1', false)
    st.getState().pick('b', 'd1', true)
    expect(st.getState().selectedIds).toEqual(['a', 'b'])
    st.getState().pick('a', 'd1', true)
    expect(st.getState().selectedIds).toEqual(['b'])
  })

  it('別デバイスでの additive は置き換え', () => {
    const st = createSelectionStore()
    st.getState().pick('a', 'd1', false)
    st.getState().pick('x', 'd2', true)
    expect(st.getState().selectedIds).toEqual(['x'])
    expect(st.getState().activeDeviceId).toBe('d2')
  })

  it('pickMany: 置き換え / 追加(重複なし) / 空なら解除', () => {
    const st = createSelectionStore()
    st.getState().pickMany(['a', 'b'], 'd1', false)
    st.getState().pickMany(['b', 'c'], 'd1', true)
    expect(st.getState().selectedIds).toEqual(['a', 'b', 'c'])
    st.getState().pickMany([], 'd1', false)
    expect(st.getState().selectedIds).toEqual([])
    expect(st.getState().activeDeviceId).toBe('d1')
  })

  it('clear / prune は変化が無ければ参照を変えない', () => {
    const st = createSelectionStore()
    const before = st.getState()
    st.getState().clear()
    st.getState().prune(() => true)
    expect(st.getState()).toBe(before)
    st.getState().pick('a', 'd1', false)
    st.getState().pick('b', 'd1', true)
    st.getState().prune((id) => id !== 'a')
    expect(st.getState().selectedIds).toEqual(['b'])
  })

  it('setHover は同じ値なら更新しない', () => {
    const st = createSelectionStore()
    st.getState().setHover({ id: 'a', deviceId: 'd1' })
    const s1 = st.getState()
    st.getState().setHover({ id: 'a', deviceId: 'd1' })
    expect(st.getState()).toBe(s1)
    st.getState().setHover(null)
    expect(st.getState().hover).toBeNull()
  })
})
