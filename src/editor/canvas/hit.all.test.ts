// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { measureAllRects } from './hit'

describe('measureAllRects', () => {
  it('表示中のノードだけをワールド座標で返し、exclude は除く', () => {
    document.body.innerHTML =
      '<div id="c"><div data-device-id="d1"><div id="n1" data-node-id="n1"></div><div id="n2" data-node-id="n2"></div></div></div>'
    const c = document.getElementById('c') as HTMLElement
    const n1 = document.getElementById('n1') as HTMLElement
    c.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect
    n1.getBoundingClientRect = () => ({ left: 110, top: 70, width: 200, height: 100 }) as DOMRect
    n1.getClientRects = () => [{}] as unknown as DOMRectList // n2 はレイアウト無し(jsdom 既定)
    const vp = { zoom: 2, panX: 30, panY: -10 }
    expect(measureAllRects(c, vp, 'd1', new Set())).toEqual([
      { x: 35, y: 30, width: 100, height: 50 },
    ])
    expect(measureAllRects(c, vp, 'd1', new Set(['n1']))).toEqual([])
  })
})
