import { describe, expect, it } from 'vitest'
import { createMemoryBlobStore } from '../persist'
import { createAssetUrlStore, resolveAssetSrc } from './urls'

const blob = (n: number) => ({ mime: 'image/png', data: new Uint8Array([n]).buffer as ArrayBuffer })

function make() {
  const created: string[] = []
  const revoked: string[] = []
  const store = createAssetUrlStore({
    createUrl: () => {
      const u = `blob:${created.length}`
      created.push(u)
      return u
    },
    revokeUrl: (u) => revoked.push(u),
  })
  return { store, created, revoked }
}

describe('asset url store', () => {
  it('set / get / 上書きで古い URL を revoke し、version が増える', () => {
    const { store, revoked } = make()
    const v0 = store.version()
    store.set('a', blob(1))
    expect(store.get('a')).toBe('blob:0')
    store.set('a', blob(2))
    expect(store.get('a')).toBe('blob:1')
    expect(revoked).toEqual(['blob:0'])
    expect(store.version()).toBe(v0 + 2)
  })
  it('load は BlobStore から読み、並行 load は 1 回にまとまる', async () => {
    const { store, created } = make()
    const src = createMemoryBlobStore()
    await src.put('a', blob(1))
    const [x, y] = await Promise.all([store.load('a', src), store.load('a', src)])
    expect(x).toBe(y)
    expect(created).toHaveLength(1)
    expect(await store.load('none', src)).toBeUndefined()
  })
  it('revoke / clear / subscribe', async () => {
    const { store, revoked } = make()
    let n = 0
    const off = store.subscribe(() => n++)
    store.set('a', blob(1))
    store.set('b', blob(2))
    store.revoke('a')
    expect(store.get('a')).toBeUndefined()
    store.clear()
    expect(revoked).toHaveLength(2)
    expect(n).toBe(4)
    off()
    store.set('c', blob(3))
    expect(n).toBe(4)
  })
  it('resolveAssetSrc: data: はそのまま、asset: は解決、未解決は undefined', () => {
    const { store } = make()
    store.set('a', blob(1))
    expect(resolveAssetSrc('data:image/png;base64,AA', store)).toBe('data:image/png;base64,AA')
    expect(resolveAssetSrc('asset:a', store)).toBe('blob:0')
    expect(resolveAssetSrc('asset:zz', store)).toBeUndefined()
    expect(resolveAssetSrc('https://x/y.png', store)).toBeUndefined()
    expect(resolveAssetSrc(undefined, store)).toBeUndefined()
  })
})
