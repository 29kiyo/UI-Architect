// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { hitFromElement, measureWorldRect } from './hit'

const vp = { zoom: 2, panX: 30, panY: -10 }

function setup() {
  document.body.innerHTML =
    '<div id="c"><div data-device-id="d1"><div id="n1" data-node-id="n1"><span id="n2" data-node-id="n2"></span></div></div></div>'
  const c = document.getElementById('c') as HTMLElement
  const n2 = document.getElementById('n2') as HTMLElement
  return { c, n2 }
}

describe('hit', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('hitFromElement: 最も近いノードとデバイスを返す', () => {
    const { c, n2 } = setup()
    expect(hitFromElement(n2)).toEqual({ deviceId: 'd1', nodeId: 'n2' })
    expect(hitFromElement(c)).toBeUndefined()
    expect(hitFromElement(null)).toBeUndefined()
  })

  it('measureWorldRect: 画面の実測矩形をワールド座標に変換する', () => {
    const { c, n2 } = setup()
    c.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect
    n2.getBoundingClientRect = () => ({ left: 110, top: 70, width: 200, height: 100 }) as DOMRect
    n2.getClientRects = () => [{}] as unknown as DOMRectList
    expect(measureWorldRect(c, vp, 'd1', 'n2')).toEqual({ x: 35, y: 30, width: 100, height: 50 })
  })

  it('存在しない / レイアウトの無い要素は undefined', () => {
    const { c } = setup()
    expect(measureWorldRect(c, vp, 'd1', 'nope')).toBeUndefined()
    expect(measureWorldRect(c, vp, 'd1', 'n2')).toBeUndefined() // jsdom は rects が空
  })
})
