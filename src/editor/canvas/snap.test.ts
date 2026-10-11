import { describe, expect, it } from 'vitest'
import { snapRect } from './snap'

const o = { threshold: 6 }
const T = { x: 100, y: 0, width: 80, height: 50 }

describe('snapRect', () => {
  it('端: しきい値内なら左端が揃い、ガイド線が出る', () => {
    const t = { x: 100, y: 200, width: 80, height: 50 }
    const r = snapRect({ x: 103, y: 0, width: 50, height: 50 }, [t], o)
    expect(r.dx).toBeCloseTo(-3)
    expect(r.dy).toBeCloseTo(0)
    expect(r.lines).toEqual([{ x1: 100, y1: 0, x2: 100, y2: 250 }])
  })

  it('しきい値の外なら動かない', () => {
    const r = snapRect({ x: 110, y: 300, width: 40, height: 40 }, [T], o)
    expect(r.dx).toBe(0)
    expect(r.dy).toBe(0)
    expect(r.lines).toEqual([])
  })

  it('中心どうしも吸着する', () => {
    const r = snapRect(
      { x: 32, y: 300, width: 40, height: 40 },
      [{ x: 0, y: 0, width: 100, height: 100 }],
      o,
    )
    expect(r.dx).toBeCloseTo(-2)
    expect(r.dy).toBeCloseTo(0)
  })

  it('候補が複数なら最も近いものを選ぶ', () => {
    const ts = [
      { x: 100, y: 500, width: 10, height: 10 },
      { x: 104, y: 500, width: 10, height: 10 },
    ]
    expect(snapRect({ x: 103, y: 0, width: 10, height: 10 }, ts, o).dx).toBeCloseTo(1)
  })

  it('等間隔: 同じ間隔になる位置に吸着し、区間のガイドが出る', () => {
    const ts = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 100, y: 0, width: 50, height: 50 },
    ]
    const m = { x: 203, y: 0, width: 50, height: 50 }
    const r = snapRect(m, ts, o)
    expect(r.dx).toBeCloseTo(-3)
    expect(r.lines).toContainEqual({ x1: 50, y1: 25, x2: 100, y2: 25 })
    expect(snapRect(m, ts, { ...o, gaps: false }).dx).toBe(0)
  })

  it('lines で指定した辺だけを対象にする(リサイズ用)', () => {
    const t = { x: 100, y: 300, width: 50, height: 50 }
    const r = snapRect({ x: -3, y: 0, width: 100, height: 50 }, [t], {
      ...o,
      gaps: false,
      lines: { x: [1], y: [] },
    })
    expect(r.dx).toBeCloseTo(3)
    expect(r.dy).toBe(0)
  })
})
