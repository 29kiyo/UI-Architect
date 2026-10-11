import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitRect,
  panBy,
  screenToWorld,
  viewportMatrix,
  worldToScreen,
  zoomAt,
} from './viewport'

const vp = { zoom: 2, panX: 30, panY: -10 }

describe('viewport', () => {
  it('world↔screen は往復で元に戻る', () => {
    const p = { x: 123.5, y: -42 }
    const back = screenToWorld(vp, worldToScreen(vp, p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it('zoomAt はカーソル位置のワールド座標を動かさない', () => {
    const s = { x: 200, y: 150 }
    const before = screenToWorld(vp, s)
    const next = zoomAt(vp, s, 3.5)
    const after = screenToWorld(next, s)
    expect(next.zoom).toBe(3.5)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('zoom は範囲内に制限される', () => {
    expect(zoomAt(vp, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(vp, { x: 0, y: 0 }, 0.0001).zoom).toBe(MIN_ZOOM)
  })

  it('panBy は移動量を加算する', () => {
    expect(panBy(vp, 5, 7)).toEqual({ zoom: 2, panX: 35, panY: -3 })
  })

  it('fitRect は矩形を中央に収め、等倍を超えて拡大しない', () => {
    const v = fitRect({ x: 0, y: 0, width: 2000, height: 1000 }, { width: 1000, height: 600 })
    expect(v.zoom).toBeLessThan(1)
    const small = fitRect({ x: 0, y: 0, width: 100, height: 100 }, { width: 1000, height: 600 })
    expect(small.zoom).toBe(1)
    expect(small.panX).toBeCloseTo(450)
    expect(small.panY).toBeCloseTo(250)
  })

  it('viewportMatrix は CSS matrix 文字列を返す', () => {
    expect(viewportMatrix(vp)).toBe('matrix(2,0,0,2,30,-10)')
  })
})
