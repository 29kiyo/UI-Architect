import { describe, expect, it } from 'vitest'
import { AssetSchema } from '../model'
import { buildAsset, sha256HexOf } from './file'

const buf = (...n: number[]) => new Uint8Array(n).buffer as ArrayBuffer

describe('buildAsset', () => {
  it('mime・kind・hash・size を埋め、スキーマに通る', async () => {
    const { asset, blob } = await buildAsset(
      { name: 'a.png', data: buf(1, 2, 3) },
      { width: 4, height: 5 },
    )
    expect(AssetSchema.parse(asset)).toEqual(asset)
    expect(asset).toMatchObject({ kind: 'image', mime: 'image/png', size: 3, width: 4, height: 5 })
    expect(asset.hash).toBe(await sha256HexOf(buf(1, 2, 3)))
    expect(asset.hash).toHaveLength(64)
    expect(blob.mime).toBe('image/png')
  })
  it('mime 指定が優先され、フォントは font と判定される', async () => {
    expect((await buildAsset({ name: 'x.bin', mime: 'image/webp', data: buf(1) })).asset.mime).toBe(
      'image/webp',
    )
    expect((await buildAsset({ name: 'f.woff2', data: buf(1) })).asset.kind).toBe('font')
  })
  it('同じ内容は同じ hash、id は毎回別', async () => {
    const a = await buildAsset({ name: 'a.png', data: buf(9) })
    const b = await buildAsset({ name: 'b.png', data: buf(9) })
    expect(a.asset.hash).toBe(b.asset.hash)
    expect(a.asset.id).not.toBe(b.asset.id)
  })
})
