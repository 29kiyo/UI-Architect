import { describe, expect, it } from 'vitest'
import type { Asset } from '../model'
import { createImageNode, fitSize } from './imageNode'

const asset: Asset = {
  id: 'a1',
  kind: 'image',
  name: 'photo.png',
  mime: 'image/png',
  hash: 'h',
  size: 1,
  width: 640,
  height: 480,
}

describe('image node', () => {
  it('fitSize: 長辺を max に収める。小さい画像は拡大しない。不明は既定', () => {
    expect(fitSize(640, 480)).toEqual({ width: 320, height: 240 })
    expect(fitSize(100, 50)).toEqual({ width: 100, height: 50 })
    expect(fitSize(0, 0)).toEqual({ width: 320, height: 240 })
    expect(fitSize(10000, 1)).toEqual({ width: 320, height: 1 })
  })
  it('createImageNode: asset 参照・サイズ・alt・フィット', () => {
    const n = createImageNode(asset)
    expect(n.type).toBe('image')
    expect(n.category).toBe('image')
    expect(n.props.content).toMatchObject({ src: 'asset:a1', alt: 'photo' })
    expect(n.props.size).toMatchObject({ width: '320px', height: '240px' })
    expect(n.props.appearance.objectFit).toBe('contain')
  })
})
