import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createIndexedDbBlobStore, createMemoryBlobStore, putBlobs, type BlobStore } from './index'

const bytes = (...n: number[]) => new Uint8Array(n).buffer as ArrayBuffer

const impls: Array<[string, () => BlobStore]> = [
  ['memory', () => createMemoryBlobStore()],
  ['indexeddb', () => createIndexedDbBlobStore(`test-${Math.random()}`)],
]

describe.each(impls)('blob store: %s', (_name, make) => {
  it('put / get / 上書き / delete / keys', async () => {
    const s = make()
    expect(await s.get('a')).toBeUndefined()
    await s.put('a', { mime: 'image/png', data: bytes(1, 2, 3) })
    await s.put('b', { mime: 'font/ttf', data: bytes(9) })
    const a = await s.get('a')
    expect(a?.mime).toBe('image/png')
    expect(Array.from(new Uint8Array(a!.data))).toEqual([1, 2, 3])
    await s.put('a', { mime: 'image/png', data: bytes(7) })
    expect(Array.from(new Uint8Array((await s.get('a'))!.data))).toEqual([7])
    expect((await s.keys()).sort()).toEqual(['a', 'b'])
    await s.delete('a')
    await s.delete('missing') // 無くても throw しない
    expect(await s.get('a')).toBeUndefined()
    expect(await s.keys()).toEqual(['b'])
  })

  it('putBlobs でまとめて保存できる', async () => {
    const s = make()
    await putBlobs(
      s,
      new Map([
        ['x', { mime: 'image/png', data: bytes(1) }],
        ['y', { mime: 'image/png', data: bytes(2) }],
      ]),
    )
    expect((await s.keys()).sort()).toEqual(['x', 'y'])
  })

  it('大きなバイナリ', async () => {
    const s = make()
    const big = new Uint8Array(3_000_000).fill(5).buffer as ArrayBuffer
    await s.put('big', { mime: 'video/mp4', data: big })
    expect((await s.get('big'))?.data.byteLength).toBe(big.byteLength)
  })
})
