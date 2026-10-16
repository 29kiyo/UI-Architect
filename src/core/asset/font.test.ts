import { describe, expect, it } from 'vitest'
import type { Asset } from '../model'
import { createMemoryBlobStore } from '../persist'
import {
  createFontLoader,
  fontFamilyCss,
  fontFamilyOf,
  isFontName,
  type FontFaceLike,
} from './font'

const font = (id: string, name: string): Asset => ({
  id,
  kind: 'font',
  name,
  mime: 'font/woff2',
  hash: `h-${id}`,
  size: 1,
})
const data = new Uint8Array([1]).buffer as ArrayBuffer

describe('font helpers', () => {
  it('拡張子判定と family 名', () => {
    expect(isFontName('a.WOFF2')).toBe(true)
    expect(isFontName('a.png')).toBe(false)
    expect(fontFamilyOf(font('abcdef123', 'Inter-Regular.woff2'))).toBe('Inter-Regular')
    expect(fontFamilyOf(font('abcdef123', '";}.ttf'))).toBe('font-abcdef')
    expect(fontFamilyCss('My Font')).toBe('"My Font"')
  })
})

describe('createFontLoader', () => {
  it('追加分だけ登録し、doc から消えたら解除する', async () => {
    const added: string[] = []
    const removed: string[] = []
    const loader = createFontLoader({
      create: (family): FontFaceLike & { family: string } => ({ family, load: async () => {} }),
      add: (f) => added.push((f as unknown as { family: string }).family),
      remove: (f) => removed.push((f as unknown as { family: string }).family),
    })
    const src = createMemoryBlobStore()
    await src.put('a', { mime: 'font/woff2', data })
    await src.put('b', { mime: 'font/woff2', data })
    const a = font('a', 'A.woff2')
    const b = font('b', 'B.woff2')
    await loader.sync([a, b, { ...a, id: 'img', kind: 'image' }], src)
    await loader.sync([a, b], src) // 再実行しても二重登録しない
    expect(added.sort()).toEqual(['A', 'B'])
    await loader.sync([a], src)
    expect(removed).toEqual(['B'])
    expect(loader.loaded()).toEqual(['a'])
  })
  it('Blob が無い・読込失敗は登録しない', async () => {
    const loader = createFontLoader({
      create: () => ({ load: async () => Promise.reject(new Error('bad')) }),
      add: () => {},
      remove: () => {},
    })
    const src = createMemoryBlobStore()
    await src.put('a', { mime: 'font/woff2', data })
    await loader.sync([font('a', 'A.woff2'), font('none', 'N.woff2')], src)
    expect(loader.loaded()).toEqual([])
  })
})
