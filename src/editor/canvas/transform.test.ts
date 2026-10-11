import { describe, expect, it } from 'vitest'
import {
  angleDeg,
  applyReorder,
  flexAxis,
  getRotation,
  handlePoint,
  moveKind,
  normalizeAngle,
  parsePx,
  reorderTarget,
  resizeRect,
  setRotation,
} from './transform'

const R = { x: 100, y: 100, width: 200, height: 100 }

describe('resizeRect', () => {
  it('se: 右下が動き、左上は固定', () => {
    expect(resizeRect(R, 'se', { x: 20, y: 10 })).toEqual({
      x: 100,
      y: 100,
      width: 220,
      height: 110,
    })
  })

  it('nw: 左上が動き、右下は固定', () => {
    expect(resizeRect(R, 'nw', { x: -10, y: -20 })).toEqual({
      x: 90,
      y: 80,
      width: 210,
      height: 120,
    })
  })

  it('e: 幅だけ変わり高さ・y は不変', () => {
    const r = resizeRect(R, 'e', { x: 50, y: 999 })
    expect(r.width).toBe(250)
    expect(r.height).toBe(100)
    expect(r.y).toBeCloseTo(100)
  })

  it('Alt(中心基準): 中心が動かず 2 倍の幅で変わる', () => {
    const r = resizeRect(R, 'se', { x: 10, y: 10 }, { fromCenter: true })
    expect(r).toEqual({ x: 90, y: 90, width: 220, height: 120 })
  })

  it('Shift(比率固定): 角は大きい変化に合わせ、辺は反対側が追従', () => {
    expect(resizeRect(R, 'se', { x: 100, y: 0 }, { keepRatio: true })).toMatchObject({
      width: 300,
      height: 150,
    })
    const e = resizeRect(R, 'e', { x: 100, y: 0 }, { keepRatio: true })
    expect(e.width / e.height).toBeCloseTo(2)
  })

  it('最小サイズで止まり、反対側の辺は動かない', () => {
    expect(resizeRect(R, 'se', { x: -999, y: -999 })).toMatchObject({
      x: 100,
      y: 100,
      width: 1,
      height: 1,
    })
    expect(resizeRect(R, 'nw', { x: 999, y: 999 })).toMatchObject({
      x: 299,
      y: 199,
      width: 1,
      height: 1,
    })
  })

  it('handlePoint は矩形上の位置を返す', () => {
    expect(handlePoint(R, 'nw')).toEqual({ x: 100, y: 100 })
    expect(handlePoint(R, 'se')).toEqual({ x: 300, y: 200 })
    expect(handlePoint(R, 'n')).toEqual({ x: 200, y: 100 })
  })
})

describe('moveKind / parsePx / flexAxis', () => {
  it('種別を判定する', () => {
    expect(moveKind('absolute', 'block')).toBe('absolute')
    expect(moveKind('fixed', 'flex')).toBe('absolute')
    expect(moveKind(undefined, 'flex')).toBe('reorder')
    expect(moveKind('static', 'inline-flex')).toBe('reorder')
    expect(moveKind('relative', 'grid')).toBe('reorder')
    expect(moveKind('relative', 'block')).toBe('offset')
    expect(moveKind('static', 'block')).toBe('none')
    expect(moveKind(undefined, undefined)).toBe('none')
  })

  it('parsePx は px・数値のみ解釈する', () => {
    expect(parsePx('12px')).toBe(12)
    expect(parsePx('-3.5px')).toBe(-3.5)
    expect(parsePx(8)).toBe(8)
    expect(parsePx('50%')).toBeUndefined()
    expect(parsePx('auto')).toBeUndefined()
    expect(parsePx(undefined)).toBeUndefined()
  })

  it('flexAxis は column 系だけ y', () => {
    expect(flexAxis({ display: 'flex', flexDirection: 'column' })).toBe('y')
    expect(flexAxis({ display: 'flex', flexDirection: 'row' })).toBe('x')
    expect(flexAxis({ display: 'flex' })).toBe('x')
    expect(flexAxis({ display: 'grid', flexDirection: 'column' })).toBe('x')
  })
})

describe('reorder', () => {
  const others = [
    { id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } },
    { id: 'b', rect: { x: 110, y: 0, width: 100, height: 50 } },
    { id: 'c', rect: { x: 220, y: 0, width: 100, height: 50 } },
  ]

  it('横並び: 最寄りの兄弟の前/後ろを返す', () => {
    expect(reorderTarget(others, { x: 20, y: 25 }, 'x').beforeId).toBe('a')
    expect(reorderTarget(others, { x: 90, y: 25 }, 'x').beforeId).toBe('b') // a の後ろ = b の前
    expect(reorderTarget(others, { x: 310, y: 25 }, 'x').beforeId).toBeUndefined() // 末尾
  })

  it('指標の線は挿入位置の辺になる', () => {
    expect(reorderTarget(others, { x: 20, y: 25 }, 'x').line).toEqual({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 50,
    })
    expect(reorderTarget(others, { x: 310, y: 25 }, 'x').line).toEqual({
      x1: 320,
      y1: 0,
      x2: 320,
      y2: 50,
    })
  })

  it('縦並び', () => {
    const col = [
      { id: 'a', rect: { x: 0, y: 0, width: 50, height: 40 } },
      { id: 'b', rect: { x: 0, y: 50, width: 50, height: 40 } },
    ]
    expect(reorderTarget(col, { x: 10, y: 80 }, 'y').beforeId).toBeUndefined()
    expect(reorderTarget(col, { x: 10, y: 5 }, 'y').beforeId).toBe('a')
  })

  it('兄弟がいなければ何も返さない', () => {
    expect(reorderTarget([], { x: 0, y: 0 }, 'x')).toEqual({ beforeId: undefined, line: undefined })
  })

  it('applyReorder', () => {
    expect(applyReorder(['a', 'b', 'c'], 'a', undefined)).toEqual(['b', 'c', 'a'])
    expect(applyReorder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(applyReorder(['a', 'b', 'c'], 'b', 'c')).toEqual(['a', 'b', 'c'])
    expect(applyReorder(['a', 'b'], 'a', 'zzz')).toEqual(['b', 'a'])
  })
})

describe('rotation', () => {
  it('getRotation は単位を度に直す', () => {
    expect(getRotation('')).toBe(0)
    expect(getRotation('rotate(30deg)')).toBe(30)
    expect(getRotation('translate(1px,2px) rotate(-0.25turn)')).toBe(-90)
    expect(getRotation('rotate(3.14159rad)')).toBeCloseTo(180, 0)
    expect(getRotation('rotateX(10deg)')).toBe(0)
  })

  it('setRotation は rotate() だけを差し替える', () => {
    expect(setRotation('', 30)).toBe('rotate(30deg)')
    expect(setRotation('translate(10px,5px)', 30)).toBe('translate(10px,5px) rotate(30deg)')
    expect(setRotation('rotate(10deg) scale(2)', 45)).toBe('rotate(45deg) scale(2)')
    expect(setRotation('rotate(10deg) scale(2)', 0)).toBe('scale(2)')
    expect(setRotation('none', 0)).toBe('')
  })

  it('angleDeg / normalizeAngle', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90)
    expect(angleDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0)
    expect(normalizeAngle(190)).toBeCloseTo(-170)
    expect(normalizeAngle(-190)).toBeCloseTo(170)
    expect(normalizeAngle(30)).toBeCloseTo(30)
  })
})
