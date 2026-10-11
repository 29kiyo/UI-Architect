import { describe, expect, it } from 'vitest'
import { createDevice } from '@/core'
import { ARTBOARD_GAP, frameFor, layoutArtboards, safeBands } from './artboard'

describe('回転・フレーム・セーフエリア', () => {
  it('回転したデバイスは幅高さが入れ替わり、次のアートボードがずれる', () => {
    const pc = createDevice('pc')
    const m = { ...createDevice('mobile'), orientation: 'landscape' as const }
    const [a, b] = layoutArtboards([pc, m])
    expect(a?.rect.width).toBe(1280)
    expect(b?.rect).toEqual({ x: 1280 + ARTBOARD_GAP, y: 0, width: 844, height: 390 })
  })

  it('frameFor は種別ごとに違う', () => {
    expect(frameFor('mobile').pad).toBeGreaterThan(frameFor('pc').pad)
    expect(frameFor('tablet').radius).toBeGreaterThan(frameFor('pc').radius)
  })

  it('safeBands は 0 の辺を作らず、左右は上下の帯の間に入る', () => {
    const r = { x: 100, y: 0, width: 200, height: 400 }
    expect(safeBands(r, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual([])
    expect(safeBands(r, { top: 10, right: 0, bottom: 20, left: 5 })).toEqual([
      { x: 100, y: 0, width: 200, height: 10 },
      { x: 100, y: 380, width: 200, height: 20 },
      { x: 100, y: 10, width: 5, height: 370 },
    ])
  })
})
