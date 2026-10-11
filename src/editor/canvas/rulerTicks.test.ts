import { describe, expect, it } from 'vitest'
import { niceStep, rulerTicks } from './rulerTicks'

describe('ruler', () => {
  it('niceStep は 1・2・5×10^n に丸める', () => {
    expect(niceStep(7.5)).toBe(10)
    expect(niceStep(50)).toBe(50)
    expect(niceStep(60)).toBe(100)
    expect(niceStep(130)).toBe(200)
  })

  it('目盛りはワールド値と画面位置を返す', () => {
    expect(rulerTicks(1, 40, 300, 60)).toEqual([
      { value: 0, screen: 40 },
      { value: 100, screen: 140 },
      { value: 200, screen: 240 },
    ])
  })

  it('ズームすると刻みが変わる', () => {
    const t = rulerTicks(2, 0, 400, 60) // 60/2=30 → 50 刻み
    expect(t[1]).toEqual({ value: 50, screen: 100 })
  })
})
