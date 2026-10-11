import { describe, expect, it } from 'vitest'
import { createDevice } from '@/core'
import { ARTBOARD_GAP, layoutArtboards, unionRect } from './artboard'

describe('artboard', () => {
  it('デバイスを重ならず横一列に配置する', () => {
    const a = { ...createDevice('pc'), width: 1280, height: 800 }
    const b = { ...createDevice('mobile'), width: 390, height: 844 }
    const [ab1, ab2] = layoutArtboards([a, b])
    expect(ab1?.rect).toEqual({ x: 0, y: 0, width: 1280, height: 800 })
    expect(ab2?.rect.x).toBe(1280 + ARTBOARD_GAP)
    expect(ab2?.deviceId).toBe(b.id)
  })

  it('unionRect は全体を囲み、空なら undefined', () => {
    expect(unionRect([])).toBeUndefined()
    expect(
      unionRect([
        { x: 0, y: 0, width: 100, height: 50 },
        { x: 200, y: -20, width: 50, height: 100 },
      ]),
    ).toEqual({ x: 0, y: -20, width: 250, height: 100 })
  })
})
