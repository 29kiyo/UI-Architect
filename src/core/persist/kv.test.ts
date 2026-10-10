import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createIndexedDbKv, createMemoryKv, type KeyValueStore } from './index'

const impls: Array<[string, () => KeyValueStore]> = [
  ['memory', () => createMemoryKv()],
  ['indexeddb', () => createIndexedDbKv(`test-${Math.random()}`)],
]

describe.each(impls)('kv: %s', (_name, make) => {
  it('set / get / 上書き / delete / keys', async () => {
    const kv = make()
    expect(await kv.get('a')).toBeUndefined()
    await kv.set('b', '2')
    await kv.set('a', '1')
    await kv.set('a', '1x')
    expect(await kv.get('a')).toBe('1x')
    expect((await kv.keys()).sort()).toEqual(['a', 'b'])
    await kv.delete('a')
    await kv.delete('missing') // 無くても throw しない
    expect(await kv.get('a')).toBeUndefined()
    expect(await kv.keys()).toEqual(['b'])
  })

  it('大きな文字列', async () => {
    const kv = make()
    const big = 'x'.repeat(2_000_000)
    await kv.set('big', big)
    expect((await kv.get('big'))?.length).toBe(big.length)
  })
})
